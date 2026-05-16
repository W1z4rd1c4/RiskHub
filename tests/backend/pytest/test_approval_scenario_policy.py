from __future__ import annotations

import pytest

from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, User
from app.models.approval_request import ApprovalStatus
from app.services.approval_scenario_policy import (
    RISK_OWNER_APPROVER_ROLE,
    user_matches_approval_scenario_role,
)


def _approval(
    *,
    requested_by_id: int,
    primary_approver_id: int | None,
    scenario_roles: list[str],
) -> ApprovalRequest:
    return ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=1,
        resource_name="Scenario policy test",
        action_type=ApprovalActionType.EDIT,
        requested_by_id=requested_by_id,
        primary_approver_id=primary_approver_id,
        status=ApprovalStatus.PENDING,
        scenario_approver_roles=scenario_roles,
    )


@pytest.mark.parametrize(
    ("is_requester", "roles", "use_primary_approver", "expected"),
    [
        (True, ["risk_manager"], False, False),
        (True, [RISK_OWNER_APPROVER_ROLE], True, False),
        (False, ["risk_manager"], False, True),
        (False, [RISK_OWNER_APPROVER_ROLE], True, True),
    ],
)
def test_requester_cannot_self_approve_via_any_scenario_role(
    test_user_risk_manager: User,
    test_user_employee: User,
    is_requester: bool,
    roles: list[str],
    use_primary_approver: bool,
    expected: bool,
) -> None:
    approval = _approval(
        requested_by_id=test_user_risk_manager.id if is_requester else test_user_employee.id,
        primary_approver_id=test_user_risk_manager.id if use_primary_approver else None,
        scenario_roles=roles,
    )

    assert user_matches_approval_scenario_role(approval, test_user_risk_manager) is expected
