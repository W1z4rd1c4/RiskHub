from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINTS = REPO_ROOT / "backend/app/api/v1/endpoints"
BASELINE = Path(__file__).parent / "_auth_idiom_baseline.toml"


def _count_legacy_idioms(root: Path) -> dict[str, int]:
    body_calls = 0
    inline_403 = 0
    for path in root.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                fn = node.func
                name = fn.id if isinstance(fn, ast.Name) else fn.attr if isinstance(fn, ast.Attribute) else None
                if name and name.startswith("_require_"):
                    body_calls += 1
            if isinstance(node, ast.If):
                test = ast.unparse(node.test)
                if "has_permission" in test and "not " in test:
                    for child in ast.walk(node):
                        if isinstance(child, ast.Raise) and "403" in ast.unparse(child):
                            inline_403 += 1
    return {"body_call_require": body_calls, "inline_403": inline_403}


def test_auth_idiom_count_non_increasing() -> None:
    baseline = tomllib.loads(BASELINE.read_text())
    current = _count_legacy_idioms(ENDPOINTS)
    assert current["body_call_require"] <= baseline["body_call_require"]
    assert current["inline_403"] <= baseline["inline_403"]
