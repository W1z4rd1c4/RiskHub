from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINT_LOADING = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/loading.py"


def test_endpoint_issues_loading_is_deleted_or_thin() -> None:
    if not ENDPOINT_LOADING.exists():
        return
    text = ENDPOINT_LOADING.read_text(encoding="utf-8")
    assert "selectinload(Issue.links).selectinload(IssueLink.risk)" not in text
