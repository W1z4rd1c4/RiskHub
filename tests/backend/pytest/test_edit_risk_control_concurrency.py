from __future__ import annotations

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).parents[3]


def _tree(relative_path: str) -> ast.Module:
    return ast.parse((REPO_ROOT / relative_path).read_text(encoding="utf-8"), filename=relative_path)


def _select_chain_targets_model(node: ast.AST, model_name: str) -> bool:
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name) and node.func.id == "select":
            return bool(node.args) and isinstance(node.args[0], ast.Name) and node.args[0].id == model_name
        if isinstance(node.func, ast.Attribute):
            return _select_chain_targets_model(node.func.value, model_name)
    if isinstance(node, ast.Attribute):
        return _select_chain_targets_model(node.value, model_name)
    return False


def _select_chain_filters_approval_resource(node: ast.AST, model_name: str) -> bool:
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        if node.func.attr == "where":
            return any(f"{model_name}.id == approval.resource_id" in ast.unparse(arg) for arg in node.args)
        return _select_chain_filters_approval_resource(node.func.value, model_name)
    if isinstance(node, ast.Attribute):
        return _select_chain_filters_approval_resource(node.value, model_name)
    return False


def _has_approval_resource_row_lock(relative_path: str, model_name: str) -> bool:
    for node in ast.walk(_tree(relative_path)):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Attribute) or node.func.attr != "with_for_update":
            continue
        receiver = node.func.value
        if _select_chain_targets_model(receiver, model_name) and _select_chain_filters_approval_resource(
            receiver,
            model_name,
        ):
            return True
    return False


def test_concurrent_two_approval_race_blocks_with_row_lock() -> None:
    edit_path = "backend/app/services/_approval_execution/edit_risk_control.py"
    delete_path = "backend/app/services/_approval_execution/delete_side_effects.py"

    assert _has_approval_resource_row_lock(edit_path, "Risk")
    assert _has_approval_resource_row_lock(edit_path, "Control")
    assert _has_approval_resource_row_lock(delete_path, "Risk")
    assert _has_approval_resource_row_lock(delete_path, "Control")
    assert _has_approval_resource_row_lock(delete_path, "KeyRiskIndicator")
