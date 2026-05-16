"""P3 capability catalog surfaces stay explicit and validator-addressable."""

from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
CATALOG = REPO_ROOT / "docs/security/capability-catalog.json"

ITEM18_SURFACES = {
    "role_hub",
    "department_hub",
    "risk_type",
    "approval_scenario",
    "risk_questionnaire",
    "dashboard_overview",
    "activity_log",
    "approval_request",
    "user_directory",
    "control_execution_list",
    "kri_history",
}


def test_item18_catalog_surfaces_are_registered_without_risk_hub() -> None:
    catalog = json.loads(CATALOG.read_text())
    surfaces = {surface["id"]: surface for surface in catalog["surfaces"]}

    assert len(ITEM18_SURFACES) == 11
    assert "risk_hub" not in surfaces

    missing = ITEM18_SURFACES - surfaces.keys()
    assert not missing

    for surface_id in ITEM18_SURFACES:
        surface = surfaces[surface_id]
        assert surface["backend"]["path"].startswith("backend/app/schemas/")
        assert surface["backend"]["class"].endswith(("Capabilities", "CapabilitiesRead"))
        assert surface["frontend"]["path"].startswith("frontend/src/services/api/schemas/")
        assert surface["frontend"]["schema"].endswith("CapabilitiesSchema")
        assert surface["fields"]
