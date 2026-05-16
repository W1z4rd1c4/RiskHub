from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
BASELINE_PATH = Path(__file__).parent / "_audit_adapter_usage_baseline.toml"
EXPECTED_ROUTES_KEY = "expected_routes"


def _required_adapter_calls() -> dict[str, set[str]]:
    data = tomllib.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    routes = data[EXPECTED_ROUTES_KEY]
    return {route: set(calls) for route, calls in routes.items()}


REQUIRED_ADAPTER_CALLS = _required_adapter_calls()


def _called_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _called_names(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(), filename=str(path))
    return {_called_name(node.func) for node in ast.walk(tree) if isinstance(node, ast.Call)} - {None}


def test_audit_adapter_declarations_are_used_by_workflows() -> None:
    missing: list[str] = []
    for rel_path, required_calls in REQUIRED_ADAPTER_CALLS.items():
        calls = _called_names(REPO_ROOT / rel_path)
        for required_call in required_calls:
            if required_call not in calls:
                missing.append(f"{rel_path}: missing {required_call}()")

    assert missing == [], f"expected adapter calls per {BASELINE_PATH}::{EXPECTED_ROUTES_KEY}; missing {missing}"
