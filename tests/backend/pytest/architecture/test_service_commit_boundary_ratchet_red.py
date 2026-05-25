from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SERVICES_ROOT = REPO_ROOT / "backend/app/services"
ALLOWLIST = Path(__file__).with_name("_service_commit_boundary_allowlist.toml")


def _allowed_files() -> set[str]:
    data = tomllib.loads(ALLOWLIST.read_text())
    return {entry["file"] for entry in data["allow"]}


def _is_commit_call(node: ast.AST) -> bool:
    return (
        isinstance(node, ast.Await)
        and isinstance(node.value, ast.Call)
        and isinstance(node.value.func, ast.Attribute)
        and node.value.func.attr == "commit"
    )


def test_service_raw_commits_are_allowlisted_or_use_boundary() -> None:
    allowed = _allowed_files()
    offenders: list[str] = []
    for path in SERVICES_ROOT.rglob("*.py"):
        relative = path.relative_to(REPO_ROOT).as_posix()
        if relative == "backend/app/services/transaction_boundary.py":
            continue
        tree = ast.parse(path.read_text(), filename=relative)
        for node in ast.walk(tree):
            if _is_commit_call(node) and relative not in allowed:
                offenders.append(f"{relative}:{node.lineno}")

    assert offenders == []
