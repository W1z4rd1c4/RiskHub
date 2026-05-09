from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
APP_ROOT = REPO_ROOT / "backend/app"


def _is_outbox_enqueue_call(call: ast.Call) -> bool:
    if not isinstance(call.func, ast.Attribute) or call.func.attr != "enqueue":
        return False
    value = call.func.value
    if isinstance(value, ast.Name):
        return value.id == "OutboxService" or value.id.endswith("outbox_service")
    return False


def _has_non_empty_idempotency_key(call: ast.Call) -> bool:
    for keyword in call.keywords:
        if keyword.arg != "idempotency_key":
            continue
        value = keyword.value
        if isinstance(value, ast.Constant) and value.value in (None, ""):
            return False
        return True
    return False


def test_outbox_enqueue_calls_provide_non_empty_idempotency_key() -> None:
    missing: list[str] = []
    call_count = 0

    for path in sorted(APP_ROOT.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not _is_outbox_enqueue_call(node):
                continue
            call_count += 1
            if not _has_non_empty_idempotency_key(node):
                rel_path = path.relative_to(REPO_ROOT).as_posix()
                missing.append(f"{rel_path}:{node.lineno}")

    assert missing == []
    assert call_count >= 5
