"""Lock that endpoint modules import schemas, not define them inline."""

from __future__ import annotations

import ast
import importlib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

EVICTED_FROM_HEALTH = {
    "LivenessResponse",
    "ReadinessResponse",
    "HealthResponse",
}
EVICTED_FROM_PREFERENCES = {
    "PreferencesUpdate",
    "PreferencesResponse",
}
EVICTED_FROM_RISKHUB_Q = {
    "BatchSendRiskFilters",
    "BatchSendRequest",
    "BatchSendResponse",
}


def _module_classnames(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return {node.name for node in ast.walk(tree) if isinstance(node, ast.ClassDef)}


def test_health_endpoint_does_not_define_evicted_classes() -> None:
    path = REPO_ROOT / "backend/app/api/v1/endpoints/health.py"
    assert _module_classnames(path).isdisjoint(EVICTED_FROM_HEALTH)


def test_preferences_endpoint_does_not_define_evicted_classes() -> None:
    path = REPO_ROOT / "backend/app/api/v1/endpoints/preferences.py"
    assert _module_classnames(path).isdisjoint(EVICTED_FROM_PREFERENCES)


def test_riskhub_questionnaires_endpoint_does_not_define_evicted_classes() -> None:
    path = REPO_ROOT / "backend/app/api/v1/endpoints/riskhub_questionnaires.py"
    assert _module_classnames(path).isdisjoint(EVICTED_FROM_RISKHUB_Q | {"RiskFilters"})


def test_schema_modules_export_evicted_classes() -> None:
    health_schema = importlib.import_module("app.schemas.health")
    preferences_schema = importlib.import_module("app.schemas.preferences")
    riskhub_schema = importlib.import_module("app.schemas.riskhub")
    for name in EVICTED_FROM_HEALTH:
        assert hasattr(health_schema, name)
    for name in EVICTED_FROM_PREFERENCES:
        assert hasattr(preferences_schema, name)
    for name in EVICTED_FROM_RISKHUB_Q:
        assert hasattr(riskhub_schema, name)
