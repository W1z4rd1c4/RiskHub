"""S7.10: users/summary delegates to build_me_capabilities, not local mirror."""

from __future__ import annotations

import inspect

import pytest

pytestmark = pytest.mark.contract


def test_users_summary_imports_canonical_builder() -> None:
    from app.api.v1.endpoints.users import summary

    src = inspect.getsource(summary)
    assert "build_me_capabilities" in src, "must consume canonical builder"
    assert "_can_view_governance" not in src, "FE-mirror must be deleted"


def test_no_residual_can_view_governance_definition() -> None:
    from app.api.v1.endpoints.users import summary

    assert not hasattr(summary, "_can_view_governance")
