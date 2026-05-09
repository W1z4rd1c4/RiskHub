"""Lock that riskhub_questionnaires.py exists and exposes its router."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
MODULE_PATH = REPO_ROOT / "backend/app/api/v1/endpoints/riskhub_questionnaires.py"
ENDPOINT_INVARIANTS = REPO_ROOT / "docs/agent/ENDPOINT_INVARIANTS.md"
AUDIT_CONTEXT = REPO_ROOT / ".planning/audits/_context/02-backend-endpoints.md"


def test_module_file_exists() -> None:
    assert MODULE_PATH.is_file(), "Audit #10 REJECT: module is load-bearing; do not delete"


def test_module_exposes_router_with_batch_send_route() -> None:
    mod = importlib.import_module("app.api.v1.endpoints.riskhub_questionnaires")
    assert hasattr(mod, "router")
    paths = {getattr(route, "path", "") for route in mod.router.routes}
    assert any("batch-send" in path for path in paths), "live route lost"


def test_module_presence_is_documented_with_frontend_call_chain() -> None:
    endpoint_text = ENDPOINT_INVARIANTS.read_text()
    audit_text = AUDIT_CONTEXT.read_text()

    assert "backend/app/api/v1/endpoints/riskhub_questionnaires.py" in endpoint_text
    assert "frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx:257" in endpoint_text
    assert "frontend/src/components/riskhub/riskQuestionnairePanelState.ts:170" in endpoint_text
    assert "frontend/src/services/riskHubApi.ts:308" in endpoint_text
    assert "test_riskhub_questionnaires_module_present_red.py" in endpoint_text

    assert "Audit #10 REJECT" in audit_text
    assert "test_riskhub_questionnaires_module_present_red.py" in audit_text
