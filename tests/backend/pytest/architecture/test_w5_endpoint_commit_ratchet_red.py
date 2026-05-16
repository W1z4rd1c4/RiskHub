from __future__ import annotations

import ast
import tomllib
from datetime import date
from pathlib import Path

import pytest

from ._allowlist_expiry import assert_not_expired

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINT_ROOT = REPO_ROOT / "backend/app/api/v1/endpoints"
ALLOWLIST_PATH = REPO_ROOT / "tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml"


def _commit_sites(root: Path) -> list[tuple[str, int]]:
    sites: list[tuple[str, int]] = []
    for path in sorted(root.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Await):
                continue
            call = node.value
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == "commit":
                sites.append((path.relative_to(REPO_ROOT).as_posix(), node.lineno))
    return sites


def _allowlist_entries() -> list[dict[str, object]]:
    assert_not_expired(ALLOWLIST_PATH)
    raw = tomllib.loads(ALLOWLIST_PATH.read_text(encoding="utf-8"))
    return list(raw["allowlist"])


def _entry_line(entry: dict[str, object]) -> int:
    line = entry["line"]
    assert isinstance(line, int)
    return line


def test_endpoint_database_commits_are_limited_to_auth_allowlist() -> None:
    allowed = {(str(entry["file"]), _entry_line(entry)) for entry in _allowlist_entries()}
    commit_sites = set(_commit_sites(ENDPOINT_ROOT))

    assert len(allowed) <= 8
    assert commit_sites <= allowed
    assert len(commit_sites) <= len(allowed)


def test_auth_commit_allowlist_entries_are_complete_and_unexpired() -> None:
    entries = _allowlist_entries()
    allowed = {(str(entry["file"]), _entry_line(entry)) for entry in entries}
    auth_commit_sites = {
        site
        for site in _commit_sites(ENDPOINT_ROOT / "auth")
        if site[0].startswith("backend/app/api/v1/endpoints/auth/")
    }

    assert auth_commit_sites <= allowed
    for entry in entries:
        assert entry.get("rationale")
        assert date.fromisoformat(str(entry["expires_at"])) >= date.today()
