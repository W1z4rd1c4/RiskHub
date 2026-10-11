"""Ordinary factor decisions have one owner; lifecycle and restore are distinct."""

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract
ROOT = Path(__file__).resolve().parents[4]
NAMED = {
    "begin_password_login", "validate_native_session", "recent_authentication", "check_recent_proof",
    "start_enrollment", "account_security", "bootstrap_status",
}


def sources():
    paths = list((ROOT / "backend/app/services/_local_auth").glob("*.py"))
    paths.append(ROOT / "backend/app/api/v1/endpoints/auth/local.py")
    return {str(path.relative_to(ROOT)): path.read_text() for path in paths}


def violations(files):
    errors = []
    owners = []
    seen = set()
    for path, source in files.items():
        tree = ast.parse(source)
        definitions = {
            node.name for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        owner = "evaluate_factor_policy" in definitions
        if owner:
            owners.append(path)
        for node in ast.walk(tree):
            if not owner and isinstance(node, ast.Compare) and any(
                isinstance(item, ast.Attribute) and item.attr == "local_mfa_policy" for item in ast.walk(node)
            ):
                errors.append(f"{path}: duplicate policy decision")
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in NAMED:
                seen.add(node.name)
                if any(isinstance(item, ast.Attribute) and item.attr == "confirmed_at" for item in ast.walk(node)):
                    errors.append(f"{path}:{node.name}: duplicate confirmed decision")
                if not any(
                    isinstance(item, ast.Call) and isinstance(item.func, ast.Name)
                    and item.func.id == "evaluate_factor_policy" for item in ast.walk(node)
                ):
                    errors.append(f"{path}:{node.name}: missing shared policy")
    if len(owners) != 1:
        errors.append("factor rule must have exactly one owner")
    if seen != NAMED:
        errors.append(f"missing named consumers: {NAMED - seen}")
    return errors


def test_ordinary_factor_policy_has_one_owner():
    assert violations(sources()) == []


def test_seeded_new_consumer_duplicate_is_detected():
    files = sources()
    files["backend/app/services/_local_auth/new_consumer.py"] = (
        "def duplicate(settings, factor):\n"
        "    return settings.local_mfa_policy == 'required' or factor.confirmed_at is not None\n"
    )
    assert any("new_consumer.py: duplicate policy decision" in error for error in violations(files))


def test_internal_owner_relocation_preserves_contract():
    files = sources()
    owner = next(path for path, source in files.items() if "def evaluate_factor_policy(" in source)
    files["backend/app/services/_local_auth/moved_policy.py"] = files.pop(owner)
    assert violations(files) == []


def test_seeded_named_confirmation_copy_is_detected():
    files = sources()
    path = next(path for path, source in files.items() if "async def account_security(" in source)
    files[path] = files[path].replace("mfa_enabled=policy.confirmed", "mfa_enabled=factor.confirmed_at is not None")
    assert any("account_security: duplicate confirmed decision" in error for error in violations(files))
