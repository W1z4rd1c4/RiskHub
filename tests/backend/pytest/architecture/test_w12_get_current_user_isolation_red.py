from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ALLOWED = {"backend/app/core/security.py", "backend/app/api/deps.py"}


def test_get_current_user_imports_only_inside_allowed_files() -> None:
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        rel = str(path.relative_to(REPO_ROOT))
        if rel in ALLOWED:
            continue
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "app.core.security":
                if any(alias.name == "get_current_user" for alias in node.names):
                    offenders.append(rel)
                    break
    assert offenders == [], "get_current_user must be imported via app.api.deps, not app.core.security"
