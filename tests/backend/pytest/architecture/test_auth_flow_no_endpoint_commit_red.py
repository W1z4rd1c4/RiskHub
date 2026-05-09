"""S7.9: auth/ endpoints have zero db.commit() calls; service layer owns transactions."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
AUTH_DIR = REPO_ROOT / "backend/app/api/v1/endpoints/auth"


def _has_commit(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            fn = node.func
            if isinstance(fn, ast.Attribute) and fn.attr == "commit":
                return True
    return False


def test_no_db_commit_in_auth_endpoints() -> None:
    offenders: list[str] = []
    for path in AUTH_DIR.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        if _has_commit(tree):
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == [], f"#76: auth/ endpoints must own zero commits; offenders: {offenders}"
