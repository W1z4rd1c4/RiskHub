from __future__ import annotations

import json
from typing import Literal

from app.core.exceptions import ApprovalScenarioConfigurationError
from app.models.approval_scenario import ApprovalScenario

APPROVER_ROLES: tuple[Literal["risk_owner", "risk_manager", "cro"], ...] = ("risk_owner", "risk_manager", "cro")
DEFAULT_APPROVER_ROLES = ["risk_manager", "cro"]


def get_approval_scenario_roles(scenario: ApprovalScenario) -> list[str]:
    if isinstance(scenario.approver_roles, list):
        return [str(role) for role in scenario.approver_roles]
    try:
        roles = json.loads(scenario.approver_roles)
    except (json.JSONDecodeError, TypeError):
        raise ApprovalScenarioConfigurationError(f"Corrupted approver_roles JSON for scenario {scenario.key}") from None
    return roles if isinstance(roles, list) else DEFAULT_APPROVER_ROLES.copy()


def set_approval_scenario_roles(scenario: ApprovalScenario, roles: list[str]) -> None:
    scenario.approver_roles = list(roles)
