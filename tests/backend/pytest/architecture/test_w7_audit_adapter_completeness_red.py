from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
AUDIT_ROOT = REPO_ROOT / "backend" / "app" / "core" / "audit"
MATRIX_PATH = AUDIT_ROOT / "_audit_matrix.toml"


def _load_matrix() -> list[dict[str, str]]:
    with MATRIX_PATH.open("rb") as handle:
        return tomllib.load(handle)["adapter"]


def _module_functions(module_name: str) -> set[str]:
    module_path = AUDIT_ROOT / f"{module_name}.py"
    if not module_path.exists():
        return set()
    tree = ast.parse(module_path.read_text(), filename=str(module_path))
    return {
        node.name
        for node in tree.body
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
    }


def test_audit_matrix_functions_exist() -> None:
    missing = []
    for entry in _load_matrix():
        if entry["function"] not in _module_functions(entry["module"]):
            missing.append(f"{entry['module']}.{entry['function']}")

    assert missing == []
