"""S7.10: users/summary delegates to build_me_capabilities, not local mirror."""

from __future__ import annotations

import ast
import inspect

import pytest

pytestmark = pytest.mark.contract


def _tree() -> ast.Module:
    from app.api.v1.endpoints.users import summary

    return ast.parse(inspect.getsource(summary))


def _imports_canonical_builder(tree: ast.Module) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "app.services._authorization_capabilities":
            return any(alias.name == "build_me_capabilities" for alias in node.names)
    return False


def _function_def(tree: ast.Module, name: str) -> ast.AsyncFunctionDef:
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == name:
            return node
    raise AssertionError(f"{name} function not found")


def _calls_name(node: ast.AST, name: str) -> bool:
    return any(
        isinstance(child, ast.Call) and isinstance(child.func, ast.Name) and child.func.id == name
        for child in ast.walk(node)
    )


def test_users_summary_imports_canonical_builder() -> None:
    tree = _tree()
    build_shell_summary = _function_def(tree, "_build_shell_summary")

    assert _imports_canonical_builder(tree), "must consume canonical builder"
    assert _calls_name(build_shell_summary, "build_me_capabilities"), "must call canonical builder"


def test_no_residual_can_view_governance_definition() -> None:
    tree = _tree()

    assert not any(
        isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "_can_view_governance"
        for node in ast.walk(tree)
    )
