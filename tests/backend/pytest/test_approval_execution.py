from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, ValidationError
from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus, User
from app.services._approval_execution.authorization import assert_can_approve, assert_can_cancel, assert_can_reject

pytestmark = pytest.mark.asyncio


def _approval(
    *,
    requester: User,
    primary_approver: User | None,
    status: ApprovalStatus = ApprovalStatus.PENDING,
    scenario_roles: list[str] | None = None,
) -> ApprovalRequest:
    return ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=1,
        resource_name="Approval execution authz fixture",
        action_type=ApprovalActionType.EDIT,
        requested_by_id=requester.id,
        primary_approver_id=primary_approver.id if primary_approver else None,
        status=status,
        scenario_approver_roles=scenario_roles,
    )


async def test_approve_authz_still_rejects_requester(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    approval = _approval(
        requester=test_user_employee,
        primary_approver=test_user_risk_manager,
        scenario_roles=["risk_manager", "cro"],
    )

    with pytest.raises(AuthorizationError, match="Users cannot approve their own requests"):
        await assert_can_approve(db_session, approval, test_user_employee)


async def test_reject_authz_still_tells_requester_to_cancel(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    approval = _approval(
        requester=test_user_employee,
        primary_approver=test_user_risk_manager,
        scenario_roles=["risk_manager", "cro"],
    )

    with pytest.raises(AuthorizationError) as exc_info:
        await assert_can_reject(db_session, approval, test_user_employee)

    assert exc_info.value.detail == "Requesters must cancel their own approval requests instead of rejecting them"


async def test_cancel_authz_still_rejects_non_requester_non_resolver(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_approval_requester: User,
    test_user_risk_manager: User,
) -> None:
    approval = _approval(
        requester=test_user_employee,
        primary_approver=test_user_risk_manager,
        scenario_roles=["risk_manager", "cro"],
    )

    with pytest.raises(AuthorizationError) as exc_info:
        await assert_can_cancel(db_session, approval, test_user_approval_requester)

    assert exc_info.value.detail == "Only the requester or approval resolvers can cancel requests"


async def test_cancel_authz_returns_tier_for_requester(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    approval = _approval(
        requester=test_user_employee,
        primary_approver=test_user_risk_manager,
        scenario_roles=["risk_manager", "cro"],
    )

    tier = await assert_can_cancel(db_session, approval, test_user_employee)

    assert tier.is_requester is True
    assert tier.is_privileged is False


async def test_reject_authz_allows_matching_privileged_pending_privileged(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_risk_manager: User,
    test_user_cro: User,
) -> None:
    approval = _approval(
        requester=test_user_employee,
        primary_approver=test_user_risk_manager,
        status=ApprovalStatus.PENDING_PRIVILEGED,
        scenario_roles=["cro"],
    )

    assert await assert_can_reject(db_session, approval, test_user_cro) is None


async def test_reject_authz_rejects_first_stage_only_pending_privileged(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    approval = _approval(
        requester=test_user_employee,
        primary_approver=test_user_risk_manager,
        status=ApprovalStatus.PENDING_PRIVILEGED,
        scenario_roles=["cro"],
    )

    with pytest.raises(AuthorizationError) as exc_info:
        await assert_can_reject(db_session, approval, test_user_risk_manager)

    assert exc_info.value.detail == "This request requires approval-resolution authority"


async def test_cancel_authz_allows_requester_and_privileged_pending_privileged(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_approval_requester: User,
    test_user_risk_manager: User,
    test_user_cro: User,
) -> None:
    approval = _approval(
        requester=test_user_employee,
        primary_approver=test_user_risk_manager,
        status=ApprovalStatus.PENDING_PRIVILEGED,
        scenario_roles=["cro"],
    )

    requester_tier = await assert_can_cancel(db_session, approval, test_user_employee)
    resolver_tier = await assert_can_cancel(db_session, approval, test_user_cro)

    assert requester_tier.is_requester is True
    assert resolver_tier.is_privileged is True

    with pytest.raises(AuthorizationError) as exc_info:
        await assert_can_cancel(db_session, approval, test_user_approval_requester)

    assert exc_info.value.detail == "Only the requester or approval resolvers can cancel requests"


async def test_reject_authz_terminal_status_returns_400(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_risk_manager: User,
    test_user_cro: User,
) -> None:
    approval = _approval(
        requester=test_user_employee,
        primary_approver=test_user_risk_manager,
        status=ApprovalStatus.APPROVED,
        scenario_roles=["cro"],
    )

    with pytest.raises(ValidationError) as exc_info:
        await assert_can_reject(db_session, approval, test_user_cro)

    assert exc_info.value.detail == "Cannot reject request with status: APPROVED"


async def test_cancel_authz_terminal_status_returns_400_for_requester(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    approval = _approval(
        requester=test_user_employee,
        primary_approver=test_user_risk_manager,
        status=ApprovalStatus.APPROVED,
        scenario_roles=["risk_manager", "cro"],
    )

    with pytest.raises(ValidationError) as exc_info:
        await assert_can_cancel(db_session, approval, test_user_employee)

    assert exc_info.value.detail == "Cannot cancel request with status: APPROVED"


async def test_cancel_authz_terminal_status_returns_400_for_privileged_resolver(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_risk_manager: User,
    test_user_cro: User,
) -> None:
    approval = _approval(
        requester=test_user_employee,
        primary_approver=test_user_risk_manager,
        status=ApprovalStatus.APPROVED,
        scenario_roles=["cro"],
    )

    with pytest.raises(ValidationError) as exc_info:
        await assert_can_cancel(db_session, approval, test_user_cro)

    assert exc_info.value.detail == "Cannot cancel request with status: APPROVED"
