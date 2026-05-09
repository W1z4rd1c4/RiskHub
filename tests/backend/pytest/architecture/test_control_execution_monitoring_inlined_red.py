"""RED: monitoring.py wrapper deleted; inlined into link_governance."""

import inspect
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


def test_monitoring_wrapper_module_removed() -> None:
    assert not Path("backend/app/services/_control_execution/monitoring.py").exists()


def test_link_governance_inlines_load_call() -> None:
    from app.services._control_execution import link_governance

    src = inspect.getsource(link_governance)
    assert "from app.services._monitoring_response import" in src
    assert "load_control_execution_monitoring_context" not in src
    assert "load_monitoring_response_context" in src
