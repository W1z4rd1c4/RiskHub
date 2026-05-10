from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

REQUIRED_ADAPTER_CALLS = {
    "backend/app/core/approval_helpers.py": {"approval_created"},
    "backend/app/services/approval_execution_service.py": {"approval_rejected", "approval_cancelled"},
    "backend/app/services/issue_deadline_service.py": {"issue_exception_status_changed", "issue_status_changed"},
}


def _called_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _called_names(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(), filename=str(path))
    return {_called_name(node.func) for node in ast.walk(tree) if isinstance(node, ast.Call)} - {None}


def test_audit_adapter_declarations_are_used_by_workflows() -> None:
    missing: list[str] = []
    for rel_path, required_calls in REQUIRED_ADAPTER_CALLS.items():
        calls = _called_names(REPO_ROOT / rel_path)
        for required_call in required_calls:
            if required_call not in calls:
                missing.append(f"{rel_path}: missing {required_call}()")

    assert missing == []
