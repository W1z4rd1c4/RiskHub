from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SECURITY = REPO_ROOT / "backend/app/core/security.py"


def test_mock_auth_branch_is_guarded_by_two_conjuncts() -> None:
    tree = ast.parse(SECURITY.read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            target = ast.unparse(node.targets[0])
            if target == "mock_auth_enabled":
                value = ast.unparse(node.value)
                if "mock_auth_enabled" in value and "debug" in value and " and " in value:
                    return
    raise AssertionError("mock-auth fallback must be gated by mock_auth_enabled AND debug")
