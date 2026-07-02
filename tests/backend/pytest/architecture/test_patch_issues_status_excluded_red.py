"""BL §11.1: PATCH /issues must reject status changes at the service seam."""

from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
BASELINE = Path(__file__).parent / "_patch_issues_status_seam.toml"


def _load_baseline() -> dict[str, str]:
    data = tomllib.loads(BASELINE.read_text(encoding="utf-8"))
    return {key: str(value) for key, value in data.items()}


def _function_defs(path: Path) -> list[ast.FunctionDef | ast.AsyncFunctionDef]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    return [node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)]


def _raises_status_conflict_for_updates(node: ast.FunctionDef | ast.AsyncFunctionDef, expected_substring: str) -> bool:
    for child in ast.walk(node):
        if not isinstance(child, ast.If) or not isinstance(child.test, ast.Compare):
            continue
        test = child.test
        if not (
            isinstance(test.left, ast.Constant)
            and test.left.value == "status"
            and any(isinstance(op, ast.In) for op in test.ops)
            and any(isinstance(comparator, ast.Name) and comparator.id == "updates" for comparator in test.comparators)
        ):
            continue
        body_source = "\n".join(ast.unparse(stmt) for stmt in child.body)
        # ADR-003: ConflictError is the domain-taxonomy 409; the sole baseline
        # (_issue_workflow/update_plans.py) is fully migrated.
        if "ConflictError" in body_source and expected_substring in body_source:
            return True
    return False


def test_patch_issues_status_excluded_red() -> None:
    baseline = _load_baseline()
    module_path = REPO_ROOT / baseline["module_path"]
    function_name = baseline["function_name"]
    expected_substring = baseline["expected_substring"]

    target_functions = [node for node in _function_defs(module_path) if node.name == function_name]
    helper_functions: list[ast.FunctionDef | ast.AsyncFunctionDef] = []
    for helper_path in module_path.parent.glob("_*.py"):
        helper_functions.extend(_function_defs(helper_path))

    candidates = [*target_functions, *helper_functions]
    assert target_functions, f"{BASELINE}::function_name missing target {function_name}"
    assert any(_raises_status_conflict_for_updates(node, expected_substring) for node in candidates), (
        f"{baseline['module_path']}::{function_name} must reject status updates with "
        f"{BASELINE}::expected_substring={expected_substring!r}"
    )
