from __future__ import annotations

import ast
import tomllib
from datetime import date
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINTS = REPO_ROOT / "backend/app/api/v1/endpoints"
BASELINE = Path(__file__).parent / "_auth_idiom_baseline.toml"
ROUTE_DECORATORS = {"get", "post", "put", "patch", "delete"}
PERMISSION_DEPENDENCIES = {"require_permission", "require_business_permission"}
CONTEXT_DEPENDENCIES = {
    "get_cro_user",
    "get_current_committee_user",
    "get_current_user",
    "get_current_user_optional",
    "get_privilege_context",
}


def _call_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _is_route_handler(node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    for decorator in node.decorator_list:
        if not isinstance(decorator, ast.Call):
            continue
        if isinstance(decorator.func, ast.Attribute) and decorator.func.attr in ROUTE_DECORATORS:
            return True
    return False


def _dependency_name(default: ast.AST) -> str | None:
    if not isinstance(default, ast.Call) or _call_name(default.func) != "Depends" or not default.args:
        return None
    target = default.args[0]
    if isinstance(target, ast.Call):
        return _call_name(target.func)
    return _call_name(target)


def _dependency_names(node: ast.FunctionDef | ast.AsyncFunctionDef) -> set[str]:
    defaults = [*node.args.defaults, *(default for default in node.args.kw_defaults if default is not None)]
    return {name for default in defaults if (name := _dependency_name(default)) is not None}


def _body_helper_calls(node: ast.FunctionDef | ast.AsyncFunctionDef) -> set[str]:
    helper_calls: set[str] = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Call) and (name := _call_name(child.func)) and name.startswith("_require_"):
            helper_calls.add(name)
    return helper_calls


def _forbidden_inline_role_checks(node: ast.FunctionDef | ast.AsyncFunctionDef) -> list[int]:
    lines: list[int] = []
    for child in ast.walk(node):
        if not isinstance(child, ast.If):
            continue
        test = ast.unparse(child.test)
        if "current_user.is_admin" in test or "current_user.role ==" in test or "current_user.role.name ==" in test:
            lines.append(child.lineno)
    return lines


def _load_body_helper_allowlist() -> set[str]:
    baseline = tomllib.loads(BASELINE.read_text(encoding="utf-8"))
    expires_at = baseline["expires_at"]
    assert date.fromisoformat(expires_at) >= date.today(), f"{BASELINE}: expires_at={expires_at} elapsed"
    return set(baseline["body_level_allowlist"])


def test_route_auth_idioms_use_canonical_dependencies_or_allowlisted_helpers() -> None:
    body_level_allowlist = _load_body_helper_allowlist()
    auth_offenders: list[str] = []
    inline_offenders: list[str] = []

    for path in ENDPOINTS.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except SyntaxError:
            continue
        rel_path = path.relative_to(REPO_ROOT).as_posix()
        for node in tree.body:
            if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) or not _is_route_handler(node):
                continue

            dependencies = _dependency_names(node)
            helper_calls = _body_helper_calls(node)
            accepted = bool(dependencies & PERMISSION_DEPENDENCIES)

            if "require_platform_admin" in dependencies:
                accepted = accepted or "admin" in path.parts
                if "admin" not in path.parts:
                    auth_offenders.append(f"{rel_path}:{node.lineno} require_platform_admin outside admin endpoints")

            if dependencies & CONTEXT_DEPENDENCIES:
                accepted = True

            helper_dependency_names = {name for name in dependencies if name.startswith("_require_")}
            all_helper_names = helper_calls | helper_dependency_names
            if all_helper_names:
                if path.name not in body_level_allowlist:
                    auth_offenders.append(
                        f"{rel_path}:{node.lineno} uses helper auth {sorted(all_helper_names)} outside {BASELINE.name}"
                    )
                accepted = accepted or path.name in body_level_allowlist

            if not accepted and (all_helper_names or dependencies & (PERMISSION_DEPENDENCIES | CONTEXT_DEPENDENCIES)):
                auth_offenders.append(f"{rel_path}:{node.lineno} {node.name} has no canonical route auth idiom")

            for lineno in _forbidden_inline_role_checks(node):
                inline_offenders.append(f"{rel_path}:{lineno} inline current_user role/admin check in {node.name}")

    offenders = [*auth_offenders, *inline_offenders]
    assert offenders == [], "\n".join(offenders)
