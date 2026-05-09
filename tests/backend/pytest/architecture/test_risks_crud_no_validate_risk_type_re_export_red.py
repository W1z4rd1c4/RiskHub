"""A-N1: risks/crud package no longer re-exports validate_risk_type."""

from __future__ import annotations

import importlib

import pytest

pytestmark = pytest.mark.contract


def test_validate_risk_type_not_in_crud_all() -> None:
    crud = importlib.import_module("app.api.v1.endpoints.risks.crud")
    assert "validate_risk_type" not in getattr(crud, "__all__", ())
    assert not hasattr(crud, "validate_risk_type"), "must not be available via crud"
