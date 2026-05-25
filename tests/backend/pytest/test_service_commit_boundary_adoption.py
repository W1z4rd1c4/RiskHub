from __future__ import annotations

import ast
from pathlib import Path

TARGETS = [
    "backend/app/services/_notification_inbox/lifecycle.py",
    "backend/app/services/_identity_access_lifecycle/execution.py",
    "backend/app/services/_identity_access_lifecycle/profile_updates.py",
    "backend/app/services/_control_execution/workflow.py",
    "backend/app/services/_control_execution/link_policy.py",
    "backend/app/services/_orphaned_items/resolution.py",
    "backend/app/services/_orphaned_items/flagging.py",
    "backend/app/services/_auth_session_workflow/transactions.py",
]

REPO_ROOT = Path(__file__).resolve().parents[3]


def _raw_commit_lines(path: Path) -> list[int]:
    tree = ast.parse(path.read_text(), filename=str(path))
    lines = []
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Await)
            and isinstance(node.value, ast.Call)
            and isinstance(node.value.func, ast.Attribute)
            and node.value.func.attr == "commit"
        ):
            lines.append(node.lineno)
    return lines


def test_low_risk_service_commit_callers_use_transaction_boundary() -> None:
    offenders = {
        target: _raw_commit_lines(REPO_ROOT / target)
        for target in TARGETS
        if _raw_commit_lines(REPO_ROOT / target)
    }

    assert offenders == {}


def test_low_risk_service_commit_callers_import_boundary_helper() -> None:
    missing = []
    for target in TARGETS[:-1]:
        source = (REPO_ROOT / target).read_text()
        if "commit_service_boundary" not in source:
            missing.append(target)

    assert missing == []
