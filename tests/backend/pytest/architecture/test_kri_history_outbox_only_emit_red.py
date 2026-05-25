"""W1.2: services that require durable delivery emit notifications through outbox."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SERVICES_ROOT = REPO_ROOT / "backend/app/services"
ALLOWED_DIRECT_NOTIFICATION_PATHS = {
    "backend/app/services/notification_service.py",
    # Deadline scheduler jobs are explicitly best-effort/tolerant until the W3 deadline adapter migration.
    "backend/app/services/_deadline_execution/executor.py",
}
ALLOWED_DIRECT_NOTIFICATION_DIR_PARTS = {
    ("outbox", "handlers"),
}
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


def _direct_notification_path_is_allowed(path: Path) -> bool:
    relative = path.relative_to(REPO_ROOT).as_posix()
    if relative in ALLOWED_DIRECT_NOTIFICATION_PATHS:
        return True
    parts = path.relative_to(SERVICES_ROOT).parts
    return any(parts[: len(allowed)] == allowed for allowed in ALLOWED_DIRECT_NOTIFICATION_DIR_PARTS)


def test_no_inprocess_notification_emit_from_outbox_required_services() -> None:
    offenders: list[str] = []
    for path in SERVICES_ROOT.rglob("*.py"):
        if _direct_notification_path_is_allowed(path):
            continue
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                name = _notification_service_call_name(node)
                if name is not None:
                    offenders.append(f"{path}:{node.lineno}::{name}")
    assert offenders == [], f"W1.2: outbox-required services must use outbox: {offenders}"
