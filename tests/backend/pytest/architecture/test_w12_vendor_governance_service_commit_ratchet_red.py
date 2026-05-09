from __future__ import annotations

import ast
import tomllib
from datetime import date
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SERVICE_ROOT = REPO_ROOT / "backend/app/services/_vendor_governance"
ALLOWLIST_PATH = REPO_ROOT / "tests/backend/pytest/architecture/_vendor_governance_service_commit_allowlist.toml"


def _commit_sites(root: Path) -> list[tuple[str, int]]:
    sites: list[tuple[str, int]] = []
    for path in sorted(root.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Await):
                continue
            call = node.value
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == "commit":
                sites.append((path.relative_to(REPO_ROOT).as_posix(), node.lineno))
    return sites


def _allowlist_entries() -> list[dict[str, object]]:
    raw = tomllib.loads(ALLOWLIST_PATH.read_text(encoding="utf-8"))
    return list(raw["allowlist"])


def _entry_line(entry: dict[str, object]) -> int:
    line = entry["line"]
    assert isinstance(line, int)
    return line


def test_vendor_governance_service_commits_are_limited_to_lifecycle_owners() -> None:
    allowed = {(str(entry["file"]), _entry_line(entry)) for entry in _allowlist_entries()}
    commit_sites = set(_commit_sites(SERVICE_ROOT))

    assert commit_sites <= allowed
    assert len(commit_sites) <= 4


def test_vendor_governance_commit_allowlist_entries_are_justified() -> None:
    entries = _allowlist_entries()

    for entry in entries:
        assert entry.get("rationale")
        assert date.fromisoformat(str(entry["expires_at"])) >= date.today()
