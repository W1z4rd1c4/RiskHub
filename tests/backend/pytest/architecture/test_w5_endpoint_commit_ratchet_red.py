from __future__ import annotations

import ast
from pathlib import Path

import pytest

from ._registry_policy import load_exception_registry

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
    raw = load_exception_registry(ALLOWLIST_PATH, decision="ADR-002", entries_key="allowlist")
    return list(raw["allowlist"])


def test_endpoint_database_commits_remain_at_zero() -> None:
    assert _allowlist_entries() == [], "New endpoint exceptions require a superseding ADR"
    assert _commit_sites(ENDPOINT_ROOT) == []


def test_endpoint_ratchet_rejects_even_complete_new_exceptions(tmp_path, monkeypatch):
    target = tmp_path / "endpoint_commits.toml"
    target.write_text(ALLOWLIST_PATH.read_text().replace("allowlist = []", '''[[allowlist]]
file = "backend/app/api/v1/endpoints/example.py"
line = 2
owner = "RiskHub Maintainer"
rationale = "An expiry is not permission to revive endpoint commits"
expires_at = "2099-01-01"'''))
    monkeypatch.setitem(globals(), "ALLOWLIST_PATH", target)
    with pytest.raises(AssertionError, match="superseding ADR"):
        test_endpoint_database_commits_remain_at_zero()
