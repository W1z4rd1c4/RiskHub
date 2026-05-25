from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ISSUE_SHARED = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared"


def test_issue_shared_barrel_is_deleted() -> None:
    assert not any(path for path in ISSUE_SHARED.glob("*.py")), "issue _shared Python barrel must stay deleted"


def test_issue_shared_barrel_explicit_guards() -> None:
    shared_files = {path.name for path in ISSUE_SHARED.glob("*.py")}
    assert shared_files == set()
