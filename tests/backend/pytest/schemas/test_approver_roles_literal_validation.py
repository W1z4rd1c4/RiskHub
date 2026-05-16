from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.riskhub import ApprovalScenarioUpdate
from app.services._riskhub_config import approval_scenario_roles


def test_unknown_approver_role_rejected_with_422() -> None:
    approver_roles = getattr(approval_scenario_roles, "APPROVER_ROLES", None)
    assert approver_roles == ("risk_owner", "risk_manager", "cro")

    assert ApprovalScenarioUpdate(approver_roles=list(approver_roles)).approver_roles == list(approver_roles)

    for invalid_role in ["unknown_role", "ceo", ""]:
        with pytest.raises(ValidationError):
            ApprovalScenarioUpdate(approver_roles=[invalid_role])
