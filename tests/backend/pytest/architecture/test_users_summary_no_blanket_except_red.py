"""D-N3: users/summary blanket-except blocks must specify concrete exception types."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SUMMARY = REPO_ROOT / "backend/app/api/v1/endpoints/users/summary.py"


def _is_blanket_exception(handler_type: ast.expr | None) -> bool:
    if handler_type is None:
        return True
    if isinstance(handler_type, ast.Name):
        return handler_type.id in {"Exception", "BaseException"}
    if isinstance(handler_type, ast.Tuple):
        return any(_is_blanket_exception(elt) for elt in handler_type.elts)
    return False


def test_no_blanket_except_in_users_summary() -> None:
    tree = ast.parse(SUMMARY.read_text())
    offenders: list[int] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ExceptHandler) and _is_blanket_exception(node.type):
            offenders.append(node.lineno)
    assert offenders == [], f"blanket-except at line(s) {offenders}; must specify type"
