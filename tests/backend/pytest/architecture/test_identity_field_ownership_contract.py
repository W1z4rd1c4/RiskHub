"""One ownership answer and explicit eligibility context, independent of file location."""

import ast
import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

ROOT = Path(__file__).resolve().parents[4]


def assert_identity_contract(sources):
    owners = []
    consumers = set()
    for path, source in sources.items():
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name == "identity_field_owners":
                    owners.append((path, node))
                if node.name in {"ensure_identity_field_update_allowed", "access_user_capabilities"}:
                    assert any(
                        isinstance(call, ast.Call)
                        and isinstance(call.func, ast.Name)
                        and call.func.id == "identity_field_owners"
                        for call in ast.walk(node)
                    ), node.name
                    consumers.add(node.name)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id in {"can_authenticate_user", "lock_identity_transition", "lock_refresh_rotation_user"}:
                    assert any(keyword.arg == "settings" for keyword in node.keywords), (path, node.lineno)
    assert len(owners) == 1
    assert consumers == {"ensure_identity_field_update_allowed", "access_user_capabilities"}


def sources():
    paths = subprocess.check_output(
        ["git", "ls-files", "--", "backend/**/*.py", "scripts/**/*.py"], cwd=ROOT, text=True
    ).splitlines()
    return {path: (ROOT / path).read_text() for path in paths}


def test_one_ownership_answer_and_explicit_eligibility_context():
    assert_identity_contract(sources())


def test_contract_detects_seeded_context_omission_and_owner_duplication():
    original = sources()
    for injected in (
        "def caller(user): return can_authenticate_user(user)",
        "def identity_field_owners(): return {}",
    ):
        for path in ("backend/app/seeded_decoy.py", "backend/scripts/seeded_decoy.py", "scripts/seeded_decoy.py"):
            with pytest.raises(AssertionError):
                assert_identity_contract({**original, path: injected})


def test_contract_allows_internal_module_relocation():
    original = sources()
    owner_path = next(path for path, source in original.items() if "def identity_field_owners(" in source)
    moved = dict(original)
    moved["backend/app/internal_relocated_ownership.py"] = moved.pop(owner_path)
    assert_identity_contract(moved)
