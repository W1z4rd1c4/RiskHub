"""S4.4: issue notifications emit only through outbox, not in-process helpers."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ISSUE_SURFACES = (
    REPO_ROOT / "backend/app/services/_issue_workflow",
    REPO_ROOT / "backend/app/api/v1/endpoints/issues",
)
BANNED_NOTIFICATION_METHODS = {
    "create_notification",
    "create_notification_once",
    "create_vendor_notification_if_visible",
    "notify_approvers",
    "notify_approvers_cancelled",
    "notify_requester_resolved",
}


def _notification_service_call_name(call: ast.Call) -> str | None:
    fn = call.func
    if not isinstance(fn, ast.Attribute):
        return None
    if fn.attr not in BANNED_NOTIFICATION_METHODS:
        return None
    if isinstance(fn.value, ast.Name) and fn.value.id == "NotificationService":
        return fn.attr
    return None


def test_no_inprocess_notification_emit_from_issues() -> None:
    offenders: list[str] = []
    for root in ISSUE_SURFACES:
        for path in root.rglob("*.py"):
            try:
                tree = ast.parse(path.read_text())
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Call):
                    name = _notification_service_call_name(node)
                    if name is not None:
                        offenders.append(f"{path}:{node.lineno}::{name}")
    assert offenders == [], f"S4.4: must use outbox: {offenders}"
