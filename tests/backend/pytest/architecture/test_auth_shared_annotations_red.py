from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
AUTH_SHARED = REPO_ROOT / "backend/app/api/v1/endpoints/auth/_shared.py"


def _imports_runtime_role(tree: ast.Module) -> bool:
    for node in tree.body:
        if isinstance(node, ast.If) and isinstance(node.test, ast.Name) and node.test.id == "TYPE_CHECKING":
            continue
        if isinstance(node, ast.ImportFrom) and node.module == "app.models":
            if any(alias.name == "Role" for alias in node.names):
                return True
    return False


def _postpones_annotations(tree: ast.Module) -> bool:
    return any(
        isinstance(node, ast.ImportFrom)
        and node.module == "__future__"
        and any(alias.name == "annotations" for alias in node.names)
        for node in tree.body
    )


def test_auth_shared_role_annotations_are_import_safe() -> None:
    tree = ast.parse(AUTH_SHARED.read_text(encoding="utf-8"), filename=str(AUTH_SHARED))

    assert _postpones_annotations(tree) or _imports_runtime_role(tree)
