from __future__ import annotations

import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


REPO_ROOT = Path(__file__).resolve().parents[4]
TEST_ROOT = REPO_ROOT / "tests" / "backend" / "pytest"
WHITELIST_PATH = TEST_ROOT / "_get_db_override_whitelist.toml"


def test_only_whitelisted_files_override_get_db() -> None:
    whitelist = set(tomllib.loads(WHITELIST_PATH.read_text())["allowed_files"])
    needle = "dependency_overrides" + "[get_db]"

    offenders: list[str] = []
    for path in sorted(TEST_ROOT.rglob("*.py")):
        relative_path = path.relative_to(REPO_ROOT).as_posix()
        if relative_path in whitelist:
            continue
        if needle in path.read_text():
            offenders.append(relative_path)

    assert offenders == []
