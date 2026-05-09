from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
CAPABILITY_CATALOG_PATH = REPO_ROOT / "docs/security/capability-catalog.json"
VALIDATOR_DIR = REPO_ROOT / "scripts/security"
if str(VALIDATOR_DIR) not in sys.path:
    sys.path.insert(0, str(VALIDATOR_DIR))

from authz_contract_validator.capability_catalog import validate_capability_catalog  # noqa: E402


def test_capability_catalog_registers_shell_capabilities() -> None:
    catalog = json.loads(CAPABILITY_CATALOG_PATH.read_text(encoding="utf-8"))
    surface_ids = {surface["id"] for surface in catalog["surfaces"]}

    assert "capabilities" in surface_ids
    assert "me_capabilities" in surface_ids
    assert validate_capability_catalog(catalog) == []
