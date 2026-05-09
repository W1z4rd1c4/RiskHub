"""C-N1: endpoint shim _get_approval_department_id must be deleted."""
from __future__ import annotations

import importlib

import pytest

pytestmark = pytest.mark.contract


def test_endpoint_shim_absent() -> None:
    shared = importlib.import_module("app.api.v1.endpoints.approvals._shared")
    assert not hasattr(shared, "_get_approval_department_id"), (
        "C-N1: endpoint shim must be deleted; canonical lives in _approval_execution/loading.py"
    )


def test_canonical_intact() -> None:
    loading = importlib.import_module("app.services._approval_execution.loading")
    assert hasattr(loading, "get_approval_department_id")
