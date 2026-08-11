"""#53: lock every importer-reachable nested transaction boundary by function."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

BOUNDARY_CASES = (
    (
        "backend/scripts/import_ict_register_workbook.py",
        "apply_parameter_overlay",
        "ict_register_parameter_overlay",
    ),
    (
        "backend/app/services/_vendor_governance/lifecycle.py",
        "create_vendor_detail",
        "vendor_create",
    ),
    (
        "backend/app/services/_vendor_governance/lifecycle.py",
        "update_vendor_detail",
        "vendor_update",
    ),
    (
        "backend/app/services/_entity_mutation_lifecycle/direct_apply.py",
        "apply_risk_update_directly",
        "entity_mutation.update_risk",
    ),
    (
        "backend/app/services/_vendor_links/workflow.py",
        "link_vendor_target",
        "vendor_link.{kind}.create",
    ),
)


def _async_function(relative_path: str, function_name: str) -> ast.AsyncFunctionDef:
    path = REPO_ROOT / relative_path
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=relative_path)
    function = next(
        (
            node
            for node in tree.body
            if isinstance(node, ast.AsyncFunctionDef) and node.name == function_name
        ),
        None,
    )
    assert (
        function is not None
    ), f"Missing async function {relative_path}:{function_name}"
    return function


def _raw_commit_count(function: ast.AsyncFunctionDef) -> int:
    return sum(
        1
        for node in ast.walk(function)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "commit"
    )


def _string_template(node: ast.expr) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if not isinstance(node, ast.JoinedStr):
        return None
    parts: list[str] = []
    for value in node.values:
        if isinstance(value, ast.Constant) and isinstance(value.value, str):
            parts.append(value.value)
        elif isinstance(value, ast.FormattedValue):
            parts.append("{" + ast.unparse(value.value) + "}")
        else:
            return None
    return "".join(parts)


def _named_service_boundaries(function: ast.AsyncFunctionDef) -> list[str]:
    boundaries: list[str] = []
    for node in ast.walk(function):
        if not isinstance(node, ast.Call):
            continue
        if (
            not isinstance(node.func, ast.Name)
            or node.func.id != "commit_service_boundary"
        ):
            continue
        boundary = next(
            (keyword.value for keyword in node.keywords if keyword.arg == "boundary"),
            None,
        )
        assert boundary is not None, f"Unnamed service boundary in {function.name}"
        rendered = _string_template(boundary)
        assert rendered is not None, f"Non-auditable boundary name in {function.name}"
        boundaries.append(rendered)
    return boundaries


@pytest.mark.parametrize(
    ("relative_path", "function_name", "boundary_name"),
    BOUNDARY_CASES,
)
def test_importer_reachable_mutations_use_the_named_defer_compatible_boundary(
    relative_path: str,
    function_name: str,
    boundary_name: str,
) -> None:
    function = _async_function(relative_path, function_name)

    assert _raw_commit_count(function) == 0
    assert _named_service_boundaries(function) == [boundary_name]


def test_run_import_owns_the_only_outer_cutover_commit_after_the_defer_scope() -> None:
    function = _async_function(
        "backend/scripts/import_ict_register_workbook.py",
        "run_import",
    )
    defer_scopes = [
        item
        for node in ast.walk(function)
        if isinstance(node, ast.With)
        for item in node.items
        if isinstance(item.context_expr, ast.Call)
        and isinstance(item.context_expr.func, ast.Name)
        and item.context_expr.func.id == "defer_service_boundary_commits"
    ]

    assert len(defer_scopes) == 1
    assert _raw_commit_count(function) == 0
    assert _named_service_boundaries(function) == ["ict_register_cutover_import"]
