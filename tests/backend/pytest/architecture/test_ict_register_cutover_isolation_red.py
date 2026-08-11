"""#53: keep the one-shot cutover policy narrow and unreachable from runtime."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
CUTOVER_MODULE = REPO_ROOT / "backend/scripts/_ict_register_cutover.py"
IMPORTER_MODULE = REPO_ROOT / "backend/scripts/import_ict_register_workbook.py"


def _tree(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _async_function(path: Path, name: str) -> ast.AsyncFunctionDef:
    function = next(
        (
            node
            for node in ast.walk(_tree(path))
            if isinstance(node, ast.AsyncFunctionDef) and node.name == name
        ),
        None,
    )
    assert function is not None, f"Missing async function {path}:{name}"
    return function


def _called_names(function: ast.AsyncFunctionDef) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(function):
        if not isinstance(node, ast.Call):
            continue
        if isinstance(node.func, ast.Name):
            names.add(node.func.id)
        elif isinstance(node.func, ast.Attribute):
            names.add(node.func.attr)
    return names


def test_cutover_modules_are_not_reachable_from_the_api_or_runtime_package() -> None:
    forbidden = ("_ict_register_cutover", "import_ict_register_workbook")
    exposed = {
        str(path.relative_to(REPO_ROOT)): name
        for path in (REPO_ROOT / "backend/app").rglob("*.py")
        for name in forbidden
        if name in path.read_text(encoding="utf-8")
    }

    assert exposed == {}


def test_cutover_policy_is_imported_only_by_the_offline_importer() -> None:
    importers = []
    for path in (REPO_ROOT / "backend/scripts").glob("*.py"):
        if path == CUTOVER_MODULE:
            continue
        if "scripts._ict_register_cutover" in path.read_text(encoding="utf-8"):
            importers.append(path.name)

    assert importers == [IMPORTER_MODULE.name]


def test_cutover_window_locks_fixed_rows_without_committing() -> None:
    function = _async_function(CUTOVER_MODULE, "load_authorized_cutover_window")
    called = _called_names(function)
    source = CUTOVER_MODULE.read_text(encoding="utf-8")

    assert "with_for_update" in called
    assert (
        sum(
            1
            for node in ast.walk(function)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "with_for_update"
        )
        == 2
    )
    assert "protected_asset_edit" in source
    assert "protected_process_edit" in source
    assert "protected_vendor_edit" in source
    assert not any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "commit"
        for node in ast.walk(_tree(CUTOVER_MODULE))
    )


def test_cutover_does_not_construct_approval_requests_or_supply_request_reason() -> (
    None
):
    cutover_tree = _tree(CUTOVER_MODULE)
    constructs_approval = any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in {"ApprovalRequest", "GovernedMutationProposal"}
        for node in ast.walk(cutover_tree)
    )

    assert constructs_approval is False
    assert "request_reason" not in IMPORTER_MODULE.read_text(encoding="utf-8")


@pytest.mark.parametrize(
    ("relative_path", "function_name", "required_guard"),
    [
        (
            "backend/app/services/_vendor_governance/lifecycle.py",
            "create_vendor_detail",
            "submit_vendor_creation_if_required",
        ),
        (
            "backend/app/services/_ict_register_lifecycle/lifecycle.py",
            "create_process_detail",
            "submit_process_creation_if_required",
        ),
        (
            "backend/app/services/_ict_register_lifecycle/asset_lifecycle.py",
            "create_asset_detail",
            "submit_asset_creation_if_required",
        ),
    ],
)
def test_ordinary_service_entrypoints_still_apply_protected_creation_policy(
    relative_path: str,
    function_name: str,
    required_guard: str,
) -> None:
    function = _async_function(REPO_ROOT / relative_path, function_name)

    assert required_guard in _called_names(function)
