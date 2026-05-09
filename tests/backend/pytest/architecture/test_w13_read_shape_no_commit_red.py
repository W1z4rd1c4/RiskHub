from __future__ import annotations

import ast
import tomllib
from pathlib import Path
from typing import Any

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ARCH_DIR = Path(__file__).parent
READ_SHAPE = ARCH_DIR / "_bounded_context_read_shape.toml"


def _load_toml(path: Path) -> dict[str, Any]:
    return tomllib.loads(path.read_text())


def _python_files_for_read_shapes() -> list[Path]:
    data = _load_toml(READ_SHAPE)
    files: list[Path] = []
    for package in data.get("packages", []):
        files.extend((REPO_ROOT / "backend/app/services" / package).rglob("*.py"))
    for file_name in data.get("files", []):
        files.append(REPO_ROOT / file_name)
    return sorted(set(files))


def test_read_shape_contexts_do_not_commit_transactions() -> None:
    offenders: list[str] = []
    for path in _python_files_for_read_shapes():
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Await) or not isinstance(node.value, ast.Call):
                continue
            func = node.value.func
            if isinstance(func, ast.Attribute) and func.attr == "commit":
                offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == [], f"ADR-007 read-shape contexts must not commit transactions: {offenders}"
