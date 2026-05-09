from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
OUTBOX_STORE_PATH = REPO_ROOT / "backend/app/services/outbox/store.py"


def test_outbox_store_participates_in_caller_transactions() -> None:
    tree = ast.parse(OUTBOX_STORE_PATH.read_text(encoding="utf-8"), filename=str(OUTBOX_STORE_PATH))
    offenders: list[int] = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.Await):
            continue
        call = node.value
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == "commit":
            offenders.append(node.lineno)

    assert offenders == []
