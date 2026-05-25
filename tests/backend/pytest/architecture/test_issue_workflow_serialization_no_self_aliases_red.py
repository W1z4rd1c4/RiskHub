"""B-N3: workflow/serialization drops self-aliases; endpoint barrel repointed."""
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
WORKFLOW_SER = REPO_ROOT / "backend/app/services/_issue_workflow/serialization.py"
SHARED_SER = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/serialization.py"
SHARED_INIT = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/__init__.py"


def test_no_self_aliases_in_workflow_serialization() -> None:
    text = WORKFLOW_SER.read_text()
    assert "active_exception = _active_exception" not in text
    assert "_serialize_exception_with_user_names = serialize_exception_with_user_names" not in text


def test_endpoint_barrel_imports_public_active_exception() -> None:
    assert not SHARED_SER.exists(), "endpoint shared serialization shim must stay deleted"
    assert not SHARED_INIT.exists(), "endpoint shared package shim must stay deleted"
    assert "active_exception" in WORKFLOW_SER.read_text()
