"""BL §10.3: unified export endpoints require reports:read."""

from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
BASELINE = Path(__file__).parent / "_export_endpoint_baseline.toml"
ROUTE_METHODS = {"get", "post"}


def _call_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _is_route(node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    return any(
        isinstance(decorator, ast.Call)
        and isinstance(decorator.func, ast.Attribute)
        and decorator.func.attr in ROUTE_METHODS
        for decorator in node.decorator_list
    )


def _has_dependency(default: ast.AST, *, dependency: str, resource: str, action: str) -> bool:
    if not isinstance(default, ast.Call) or _call_name(default.func) != "Depends" or not default.args:
        return False
    target = default.args[0]
    return (
        isinstance(target, ast.Call)
        and _call_name(target.func) == dependency
        and len(target.args) >= 2
        and isinstance(target.args[0], ast.Constant)
        and target.args[0].value == resource
        and isinstance(target.args[1], ast.Constant)
        and target.args[1].value == action
    )


def test_export_endpoint_scope_filter_red() -> None:
    baseline = tomllib.loads(BASELINE.read_text(encoding="utf-8"))
    module_dir = REPO_ROOT / str(baseline["module_dir"])
    offenders: list[str] = []

    for path in sorted(module_dir.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) or not _is_route(node):
                continue
            defaults = [*node.args.defaults, *(default for default in node.args.kw_defaults if default is not None)]
            if not any(
                _has_dependency(
                    default,
                    dependency=str(baseline["expected_dependency"]),
                    resource=str(baseline["expected_resource"]),
                    action=str(baseline["expected_action"]),
                )
                for default in defaults
            ):
                offenders.append(f"{path.relative_to(REPO_ROOT).as_posix()}::{node.name}")

    assert offenders == [], (
        f"export routes missing Depends(require_permission('reports', 'read')) per "
        f"{BASELINE}: {offenders}"
    )
