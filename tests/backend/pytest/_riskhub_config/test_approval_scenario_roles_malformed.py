from __future__ import annotations

import pytest

from app.core import exceptions
from app.models.approval_scenario import ApprovalScenario
from app.services._riskhub_config.approval_scenario_roles import get_approval_scenario_roles


def test_corrupted_approver_roles_json_raises_configuration_error() -> None:
    error_type = getattr(exceptions, "ApprovalScenarioConfigurationError", None)
    assert error_type is not None

    scenario = ApprovalScenario(
        key="risk_edit_priority",
        display_name="Risk edit priority",
        description="Malformed approver roles test",
        approver_roles='["risk_manager"',
    )

    with pytest.raises(error_type) as exc_info:
        get_approval_scenario_roles(scenario)

    assert "risk_edit_priority" in str(exc_info.value)
    assert exc_info.value.status_code == 500
