from __future__ import annotations

import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


ROOT = Path(__file__).resolve().parents[4]


def test_default_backend_test_target_excludes_postgres_marked_tests() -> None:
    makefile = (ROOT / "scripts/Makefile").read_text()
    match = re.search(r"^test:\n\t(?P<command>.+)$", makefile, flags=re.MULTILINE)

    assert match is not None
    assert '-m "not postgres and not benchmark"' in match.group("command")
