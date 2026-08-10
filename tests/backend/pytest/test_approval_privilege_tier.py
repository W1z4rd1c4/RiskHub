"""S6.6: resolve_approval_privilege_tier behavioral parity across flows."""

from __future__ import annotations

import pytest

from app.core.permissions import can_resolve_approvals
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    Process,
    User,
)
from app.models.approval_request import ApprovalStatus
from app.services.approval_scenario_policy import (
    ApprovalPrivilegeTier,
    can_access_malformed_extended_process_resolution_scope,
    resolve_approval_privilege_tier,
    scenario_allows_privileged_resolution,
    user_matches_approval_scenario_role,
)

pytestmark = [pytest.mark.contract, pytest.mark.asyncio]


def _approval(
    *,
    requested_by_id: int,
    primary_approver_id: int | None,
    scenario_roles: list[str] | None,
) -> ApprovalRequest:
    return ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=1,
        resource_name="Privilege tier test",
        action_type=ApprovalActionType.EDIT,
        requested_by_id=requested_by_id,
        primary_approver_id=primary_approver_id,
        status=ApprovalStatus.PENDING,
        scenario_approver_roles=scenario_roles,
    )


async def test_privilege_tier_matches_legacy_ladder_for_privileged_scenario_match(
    db_session,
    test_user_employee: User,
    test_user_risk_manager: User,
):
    approval = _approval(
        requested_by_id=test_user_employee.id,
        primary_approver_id=test_user_risk_manager.id,
        scenario_roles=["risk_manager", "cro"],
    )

    tier = await resolve_approval_privilege_tier(db_session, test_user_risk_manager, approval)

    assert isinstance(tier, ApprovalPrivilegeTier)
    assert tier.is_privileged == can_resolve_approvals(test_user_risk_manager)
    assert tier.scenario_match == user_matches_approval_scenario_role(approval, test_user_risk_manager)
    assert tier.privileged_scenario_match == scenario_allows_privileged_resolution(approval, test_user_risk_manager)
    assert tier.is_primary_approver is True
    assert tier.is_requester is False


async def test_privilege_tier_matches_legacy_ladder_for_legacy_requester(
    db_session,
    test_user_employee: User,
    test_user_risk_manager: User,
):
    approval = _approval(
        requested_by_id=test_user_employee.id,
        primary_approver_id=test_user_risk_manager.id,
        scenario_roles=None,
    )

    tier = await resolve_approval_privilege_tier(db_session, test_user_employee, approval)

    assert isinstance(tier, ApprovalPrivilegeTier)
    assert tier.is_privileged == can_resolve_approvals(test_user_employee)
    assert tier.scenario_match is None
    assert tier.privileged_scenario_match is None
    assert tier.is_primary_approver is False
    assert tier.is_requester is True


async def test_malformed_extended_process_resolution_scope_truth_table(
    test_department,
    test_user_employee: User,
    test_user_risk_manager: User,
):
    visible_process = Process(
        f_code="F-S6-6-VISIBLE",
        l0_area="Operations",
        l1_process="Visible malformed scope",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
    )
    hidden_process = Process(
        f_code="F-S6-6-HIDDEN",
        l0_area="Operations",
        l1_process="Hidden malformed scope",
        process_owner_user_id=None,
        owning_department_id=test_department.id + 10_000,
    )

    assert can_access_malformed_extended_process_resolution_scope(
        test_user_risk_manager,
        None,
    )
    assert can_access_malformed_extended_process_resolution_scope(
        test_user_risk_manager,
        hidden_process,
    )
    assert not can_access_malformed_extended_process_resolution_scope(
        test_user_employee,
        None,
    )
    assert can_access_malformed_extended_process_resolution_scope(
        test_user_employee,
        visible_process,
    )
    assert not can_access_malformed_extended_process_resolution_scope(
        test_user_employee,
        hidden_process,
    )
