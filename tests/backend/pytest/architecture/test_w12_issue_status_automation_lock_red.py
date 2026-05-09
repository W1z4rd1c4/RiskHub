from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SERVICES_ROOT = REPO_ROOT / "backend" / "app" / "services"

ALLOWED_AUTOMATED_STATUS_ASSIGNMENTS = {
    ("backend/app/services/_kri_history/corrections.py", "closed"),
    ("backend/app/services/issue_deadline_service.py", "in_progress"),
}


def _status_name(value: ast.expr) -> str | None:
    if isinstance(value, ast.Attribute) and isinstance(value.value, ast.Name) and value.value.id == "IssueStatus":
        return value.attr
    if isinstance(value, ast.Constant) and isinstance(value.value, str):
        return value.value
    return None


def _is_issue_status_target(target: ast.expr) -> bool:
    return (
        isinstance(target, ast.Attribute)
        and target.attr == "status"
        and isinstance(target.value, ast.Name)
        and target.value.id == "issue"
    )


def test_automated_issue_status_assignments_are_allowlisted() -> None:
    assignments: set[tuple[str, str]] = set()
    for path in SERVICES_ROOT.rglob("*.py"):
        rel_path = path.relative_to(REPO_ROOT).as_posix()
        if "/_issue_workflow/" in rel_path:
            continue
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Assign):
                continue
            status = _status_name(node.value)
            if status is None:
                continue
            if any(_is_issue_status_target(target) for target in node.targets):
                assignments.add((rel_path, status))

    assert assignments == ALLOWED_AUTOMATED_STATUS_ASSIGNMENTS
