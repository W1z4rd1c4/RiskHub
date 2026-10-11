from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SSO = REPO_ROOT / "backend/app/api/v1/endpoints/auth/sso.py"
LOCAL = REPO_ROOT / "backend/app/api/v1/endpoints/auth/local.py"
PASSWORD = REPO_ROOT / "backend/app/api/v1/endpoints/auth/password.py"
DEMO = REPO_ROOT / "backend/app/api/v1/endpoints/auth/demo.py"
REFRESH = REPO_ROOT / "backend/app/api/v1/endpoints/auth/refresh.py"
SHARED = REPO_ROOT / "backend/app/api/v1/endpoints/auth/_shared.py"
AUTH_SESSION = REPO_ROOT / "backend/app/services/_auth_session/sso_challenges.py"


def _tree(path: Path) -> ast.Module:
    return ast.parse(path.read_text(), filename=str(path))


def _imports_name(tree: ast.Module, *, module: str | None, name: str) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == module:
            return any(alias.name == name for alias in node.names)
    return False


def _function_def(tree: ast.Module, name: str) -> ast.FunctionDef | ast.AsyncFunctionDef:
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    raise AssertionError(f"{name} function not found")


def _calls_name(node: ast.AST, name: str) -> bool:
    for child in ast.walk(node):
        if not isinstance(child, ast.Call):
            continue
        if isinstance(child.func, ast.Name) and child.func.id == name:
            return True
        if isinstance(child.func, ast.Attribute) and child.func.attr == name:
            return True
    return False


def test_sso_module_uses_auth_session_exchange_boundary() -> None:
    sso_tree = _tree(SSO)
    sso_exchange = _function_def(sso_tree, "sso_exchange")

    assert _imports_name(sso_tree, module="app.services._auth_session", name="resolve_sso_exchange")
    assert _imports_name(sso_tree, module="_shared", name="_build_token_response")
    assert _imports_name(sso_tree, module="_shared", name="_issue_refresh_session")
    assert _calls_name(sso_exchange, "resolve_sso_exchange")
    assert _calls_name(sso_exchange, "_build_token_response")
    assert _calls_name(sso_exchange, "_issue_refresh_session")
    assert not _imports_name(sso_tree, module="app.core.security", name="create_access_token")
    assert not _calls_name(sso_exchange, "create_access_token")

    shared_tree = _tree(SHARED)
    assert _imports_name(shared_tree, module="app.core.security", name="create_access_token")
    assert _imports_name(shared_tree, module="app.core.tokens", name="create_refresh_token")

    auth_session_tree = _tree(AUTH_SESSION)
    assert isinstance(_function_def(auth_session_tree, "resolve_sso_exchange"), ast.AsyncFunctionDef)


@pytest.mark.parametrize(
    ("path", "function_name"),
    [
        (PASSWORD, "login"),
        (LOCAL, "mfa_verify"),
        (DEMO, "_build_demo_response"),
        (SSO, "sso_exchange"),
        (REFRESH, "refresh_session"),
    ],
)
def test_auth_flows_issue_access_tokens_through_shared_response_builder(
    path: Path,
    function_name: str,
) -> None:
    tree = _tree(path)
    endpoint = _function_def(tree, function_name)

    assert _imports_name(tree, module="_shared", name="_build_token_response")
    assert _calls_name(endpoint, "_build_token_response")
    assert not _imports_name(tree, module="app.core.security", name="create_access_token")
    assert not _calls_name(endpoint, "create_access_token")


def test_native_factor_exchange_keeps_shared_refresh_issuer() -> None:
    endpoint = _function_def(_tree(LOCAL), "mfa_verify")
    assert _calls_name(endpoint, "_issue_refresh_session")


@pytest.mark.parametrize("mutation", ["direct_token", "missing_shared"])
def test_seeded_native_exchange_violation_is_detected(monkeypatch, mutation) -> None:
    source = LOCAL.read_text()
    if mutation == "direct_token":
        source = source.replace(
            "result = _build_token_response(", "create_access_token()\n        result = _build_token_response("
        )
    else:
        source = source.replace("result = _build_token_response(", "result = forbidden_builder(")
    monkeypatch.setattr(__import__(__name__, fromlist=["_tree"]), "_tree", lambda path: ast.parse(source))
    with pytest.raises(AssertionError):
        test_auth_flows_issue_access_tokens_through_shared_response_builder(LOCAL, "mfa_verify")
