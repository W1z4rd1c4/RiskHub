"""BL §5.4: requesters cannot approve their own approval requests."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
AUTHORIZATION_PATH = REPO_ROOT / "backend/app/services/_approval_execution/authorization.py"
SCENARIO_POLICY_PATH = REPO_ROOT / "backend/app/services/approval_scenario_policy.py"


def _tree(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _function(tree: ast.Module, name: str) -> ast.FunctionDef | ast.AsyncFunctionDef | None:
    return next(
        (
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) and node.name == name
        ),
        None,
    )


def _is_attr(node: ast.AST, object_name: str, attr_name: str) -> bool:
    return (
        isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id == object_name
        and node.attr == attr_name
    )


def _has_tier_requester_guard() -> bool:
    tree = _tree(AUTHORIZATION_PATH)
    for node in ast.walk(tree):
        if isinstance(node, ast.If) and _is_attr(node.test, "tier", "is_requester"):
            body = "\n".join(ast.unparse(stmt) for stmt in node.body)
            return "AuthorizationError" in body and "own requests" in body
    return False


def _has_requester_tier_assignment() -> bool:
    tree = _tree(SCENARIO_POLICY_PATH)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or ast.unparse(node.func) != "ApprovalPrivilegeTier":
            continue
        for keyword in node.keywords:
            if keyword.arg == "is_requester" and ast.unparse(keyword.value) == "approval.requested_by_id == user.id":
                return True
    return False


def _has_role_match_requester_short_circuit() -> bool:
    tree = _tree(SCENARIO_POLICY_PATH)
    fn = _function(tree, "user_matches_approval_scenario_role")
    assert fn is not None, "approval_scenario_policy.py must define user_matches_approval_scenario_role"

    if_statements = [stmt for stmt in fn.body if isinstance(stmt, ast.If)]
    assert if_statements, "user_matches_approval_scenario_role must keep explicit guard branches"
    assert ast.unparse(if_statements[0].test) == "roles is None"

    for stmt in if_statements[1:3]:
        if ast.unparse(stmt.test) != "approval.requested_by_id == user.id":
            continue
        return any(
            isinstance(child, ast.Return)
            and isinstance(child.value, ast.Constant)
            and child.value.value is False
            for child in stmt.body
        )
    return False


def test_self_approval_prevention_red() -> None:
    assert _has_tier_requester_guard(), "authorization.py must reject tier.is_requester"
    assert _has_requester_tier_assignment(), "approval_scenario_policy.py must derive is_requester from requested_by_id"
    assert _has_role_match_requester_short_circuit(), (
        "user_matches_approval_scenario_role must short-circuit requesters with "
        "if approval.requested_by_id == user.id: return False immediately after roles is None"
    )
