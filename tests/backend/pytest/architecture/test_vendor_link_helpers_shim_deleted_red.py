"""S5.1/C-N2: vendor_link_helpers shim must be deleted; canonical lives in services."""

from __future__ import annotations

import importlib
import json
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SHIM = REPO_ROOT / "backend/app/api/v1/endpoints/vendor_link_helpers.py"
CONTRACT_MD = REPO_ROOT / "docs/security/authorization-capability-contract.md"
CONTRACT_JSON = REPO_ROOT / "docs/security/authorization-capability-contract.json"
SHIM_TOKEN = "backend/app/api/v1/endpoints/vendor_link_helpers.py"


def test_shim_file_removed() -> None:
    assert not SHIM.exists(), "vendor_link_helpers shim must be deleted"


def test_canonical_module_intact() -> None:
    mod = importlib.import_module("app.services._vendor_links")
    assert hasattr(mod, "link_vendor_target")
    assert hasattr(mod, "list_vendor_linked_risks")


def test_capability_contract_no_longer_cites_deleted_shim() -> None:
    assert "vendor_link_helpers.py" not in CONTRACT_MD.read_text()

    contract = json.loads(CONTRACT_JSON.read_text())
    assert SHIM_TOKEN not in contract["sensitive_change_paths"]
    offenders = [
        entry["id"]
        for entry in contract["actions"]
        if "vendor_link_helpers.py" in entry.get("service_policy", "")
    ]
    assert offenders == []
