from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "backend/app"
FACADE_PATH = BACKEND_ROOT / "services/authorization_capabilities.py"
PRIVATE_PACKAGE_ROOT = BACKEND_ROOT / "services/_authorization_capabilities"


def _public_facade_names() -> set[str]:
    tree = ast.parse(FACADE_PATH.read_text(encoding="utf-8"), filename=str(FACADE_PATH))
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == "__all__" for target in node.targets):
            continue
        if not isinstance(node.value, ast.List):
            continue
        return {
            element.value
            for element in node.value.elts
            if isinstance(element, ast.Constant) and isinstance(element.value, str)
        }
    raise AssertionError("authorization_capabilities facade missing __all__")


def _scanned_files() -> list[Path]:
    roots = [
        BACKEND_ROOT / "api/v1/endpoints",
        BACKEND_ROOT / "services",
    ]
    files: list[Path] = []
    for root in roots:
        files.extend(path for path in root.rglob("*.py") if "__pycache__" not in path.parts)
    return sorted(
        path
        for path in files
        if path != FACADE_PATH
        and not path.is_relative_to(PRIVATE_PACKAGE_ROOT)
    )


def test_private_capability_imports_do_not_bypass_public_facade() -> None:
    public_names = _public_facade_names()
    offenders: list[str] = []

    for path in _scanned_files():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom):
                continue
            if not (node.module or "").startswith("app.services._authorization_capabilities"):
                continue
            bypassed_names = sorted(alias.name for alias in node.names if alias.name in public_names)
            if bypassed_names:
                names = ", ".join(bypassed_names)
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{node.lineno} imports {names}")

    assert offenders == []
