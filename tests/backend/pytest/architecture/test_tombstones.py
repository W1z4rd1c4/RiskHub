"""Registry-driven tombstone locks: deleted modules must stay deleted.

Targets live in `_tombstones.toml`; adding a tombstone is one TOML entry, not a
new test module. Tombstones whose assertions need bespoke logic (contract-doc
scans, conditional thinness checks) keep their own test files.
"""

from __future__ import annotations

import importlib
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
TOMBSTONES = tomllib.loads((Path(__file__).parent / "_tombstones.toml").read_text(encoding="utf-8"))["tombstones"]


def _entry_id(entry: dict) -> str:
    return entry.get("path") or entry.get("absent_attr", {}).get("name", "unnamed")


@pytest.mark.parametrize("entry", TOMBSTONES, ids=_entry_id)
def test_tombstone_holds(entry: dict) -> None:
    reason = entry["reason"]

    path = entry.get("path")
    if path is not None:
        assert not (REPO_ROOT / path).exists(), f"{reason}: {path} must stay deleted"

    banned_imports = entry.get("banned_imports", [])
    if banned_imports:
        offenders: list[str] = []
        for root in entry.get("scan", ["backend/app"]):
            for candidate in (REPO_ROOT / root).rglob("*.py"):
                text = candidate.read_text(encoding="utf-8")
                if any(banned in text for banned in banned_imports):
                    offenders.append(str(candidate.relative_to(REPO_ROOT)))
        assert offenders == [], f"{reason}: banned import used by {offenders}"

    absent_attr = entry.get("absent_attr")
    if absent_attr is not None:
        module = importlib.import_module(absent_attr["module"])
        assert not hasattr(module, absent_attr["name"]), f"{reason}: {absent_attr['name']} must stay deleted"

    canonical = entry.get("canonical")
    if canonical is not None:
        module = importlib.import_module(canonical["module"])
        for attr in canonical["attrs"]:
            assert hasattr(module, attr), f"{reason}: canonical home lost {attr}"
