from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINT_LINKS = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/links.py"
WORKFLOW_SOURCE = REPO_ROOT / "backend/app/services/_issue_workflow/source_validation.py"
REGISTER_MUTATION = REPO_ROOT / "backend/app/services/_issue_register/source_mutation.py"


def test_endpoint_links_no_longer_owns_helper_bodies() -> None:
    if not ENDPOINT_LINKS.exists():
        return
    text = ENDPOINT_LINKS.read_text(encoding="utf-8")
    assert "async def _resolve_vendor_department_and_access" not in text
    assert "async def _issue_link_department_ids" not in text


def test_workflow_source_validation_no_longer_owns_helper_bodies() -> None:
    if not WORKFLOW_SOURCE.exists():
        return
    text = WORKFLOW_SOURCE.read_text(encoding="utf-8")
    assert "async def issue_link_department_ids" not in text
    assert "async def resolve_vendor_department_and_access" not in text


def test_canonical_bodies_remain_in_register_source_mutation() -> None:
    text = REGISTER_MUTATION.read_text(encoding="utf-8")
    assert "async def issue_link_department_ids" in text
    assert "async def resolve_vendor_department_and_access" in text
