from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SERVICES_ROOT = REPO_ROOT / "backend/app/services"
APPROVAL_HELPERS = REPO_ROOT / "backend/app/core/approval_helpers.py"
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


def _commit_lines(source: str) -> list[int]:
    return [node.lineno for node in ast.walk(ast.parse(source)) if _is_commit_call(node)]


def test_service_raw_commits_are_allowlisted_or_use_boundary() -> None:
    allowed = _allowed_files()
    offenders: list[str] = []
    # Keep the former core escape path in scope after its persistence owner moves.
    for path in [*SERVICES_ROOT.rglob("*.py"), APPROVAL_HELPERS]:
        relative = path.relative_to(REPO_ROOT).as_posix()
        if relative == "backend/app/services/transaction_boundary.py":
            continue
        for line in _commit_lines(path.read_text()):
            if relative not in allowed:
                offenders.append(f"{relative}:{line}")

    assert offenders == []


def test_commit_ratchet_detects_seeded_core_escape(tmp_path, monkeypatch):
    core = tmp_path / "backend/app/core"
    core.mkdir(parents=True)
    helper = core / "approval_helpers.py"
    helper.write_text("async def intake(db):\n    await db.commit()\n")
    services = tmp_path / "backend/app/services"
    services.mkdir()
    monkeypatch.setitem(globals(), "REPO_ROOT", tmp_path)
    monkeypatch.setitem(globals(), "SERVICES_ROOT", services)
    monkeypatch.setitem(globals(), "APPROVAL_HELPERS", helper)
    with pytest.raises(AssertionError):
        test_service_raw_commits_are_allowlisted_or_use_boundary()


def test_approval_core_helper_no_longer_owns_or_reexports_intake():
    source = APPROVAL_HELPERS.read_text()
    assert "create_approval_request_with_audit" not in source
    assert "app.services" not in source
    assert "build_approval_queued_response" in source
