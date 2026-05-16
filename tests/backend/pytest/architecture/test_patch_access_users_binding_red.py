"""BL §1.4: PATCH /access/users keeps privileged body-level write guards."""

from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
BASELINE = Path(__file__).parent / "_access_management_endpoints.toml"


def _tree(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _call_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _route_function(tree: ast.Module, *, method: str, route_path: str) -> ast.AsyncFunctionDef:
    for node in tree.body:
        if not isinstance(node, ast.AsyncFunctionDef):
            continue
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call) or not isinstance(decorator.func, ast.Attribute):
                continue
            if decorator.func.attr != method or not decorator.args:
                continue
            if isinstance(decorator.args[0], ast.Constant) and decorator.args[0].value == route_path:
                return node
    raise AssertionError(f"{BASELINE} route {method.upper()} {route_path} not found")


def test_patch_access_users_binding_red() -> None:
    baseline = tomllib.loads(BASELINE.read_text(encoding="utf-8"))
    module_path = REPO_ROOT / baseline["module_path"]
    tree = _tree(module_path)
    route = _route_function(tree, method=str(baseline["method"]), route_path=str(baseline["route_path"]))

    body_calls = {
        _call_name(node.func)
        for node in ast.walk(route)
        if isinstance(node, ast.Call) and _call_name(node.func)
    }
    expected_guards = set(baseline["expected_body_guards"])
    missing = expected_guards - body_calls
    assert missing == set(), (
        f"PATCH {baseline['route_path']} missing body-level auth guards {sorted(missing)} "
        f"per {BASELINE}::expected_body_guards"
    )

    source = module_path.read_text(encoding="utf-8")
    assert "return is_platform_admin(user) or is_cro(user)" in source, (
        "access write guard must resolve to Admin OR CRO via _can_manage_privileged_status"
    )
