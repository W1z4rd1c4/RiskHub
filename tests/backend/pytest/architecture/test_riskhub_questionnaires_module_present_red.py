"""Lock that riskhub_questionnaires.py exists and exposes its router."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
MODULE_PATH = REPO_ROOT / "backend/app/api/v1/endpoints/riskhub_questionnaires.py"
ENDPOINT_INVARIANTS = REPO_ROOT / "docs/agent/ENDPOINT_INVARIANTS.md"
DECISION_ADR = REPO_ROOT / "docs/adr/ADR-017-retained-compatibility-surfaces.md"


def test_module_file_exists() -> None:
    assert MODULE_PATH.is_file(), "Audit #10 REJECT: module is load-bearing; do not delete"


def test_module_exposes_router_with_batch_send_route() -> None:
    mod = importlib.import_module("app.api.v1.endpoints.riskhub_questionnaires")
    assert hasattr(mod, "router")
    from app.main import app

    endpoint = next(
        route.endpoint for route in mod.router.routes
        if route.path == "/riskhub/questionnaires/batch-send" and "POST" in route.methods
    )
    assert any(
        route.path == "/api/v1/riskhub/questionnaires/batch-send"
        and "POST" in route.methods and route.endpoint is endpoint
        for route in app.routes
    ), "mounted POST batch-send route lost"


def test_module_presence_is_documented_with_frontend_call_chain() -> None:
    endpoint_text = ENDPOINT_INVARIANTS.read_text()
    decision_text = DECISION_ADR.read_text()

    assert "backend/app/api/v1/endpoints/riskhub_questionnaires.py" in endpoint_text
    assert "frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx" in endpoint_text
    assert "frontend/src/components/riskhub/riskQuestionnairePanelState.ts" in endpoint_text
    assert "frontend/src/services/riskHubApi.ts" in endpoint_text
    assert "test_riskhub_questionnaires_module_present_red.py" in endpoint_text

    assert "RiskQuestionnairesPanel.callChain.test.tsx" in endpoint_text
    assert "Decision #10" in decision_text
    assert "riskhub_questionnaires.py" in decision_text
    assert "test_riskhub_questionnaires_module_present_red.py" in decision_text
