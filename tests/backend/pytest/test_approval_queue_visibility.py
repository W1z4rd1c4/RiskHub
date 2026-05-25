from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalRequest, ApprovalResourceType, ApprovalStatus, Department, Risk, User
from app.schemas.approval_request import ApprovalStatusEnum
from app.services import approval_queue_visibility
from app.services._approval_queue.queries import list_approval_queue_page, list_my_approval_queue_page


@pytest.mark.asyncio
async def test_visibility_filter_applies_before_pagination(
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    test_user_employee: User,
    seed_risk_types,
    monkeypatch: pytest.MonkeyPatch,
):
    other_department = Department(name="Approval Queue Budget Other", code="AQB-OTHER")
    db_session.add(other_department)
    await db_session.flush()

    now = datetime(2026, 5, 24, 12, 0, tzinfo=UTC)
    invisible_risks = [
        Risk(
            risk_id_code=f"AQB-HIDDEN-{index}",
            name=f"Hidden approval queue risk {index}",
            process="Approval queue",
            description="Hidden risk for queue pagination budget",
            category="Operational",
            department_id=other_department.id,
            owner_id=test_user.id,
            risk_type="operational",
            gross_probability=1,
            gross_impact=1,
            net_probability=1,
            net_impact=1,
            status="active",
        )
        for index in range(10)
    ]
    visible_risk = Risk(
        risk_id_code="AQB-VISIBLE",
        name="Visible approval queue risk",
        process="Approval queue",
        description="Visible risk for queue pagination budget",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        gross_probability=1,
        gross_impact=1,
        net_probability=1,
        net_impact=1,
        status="active",
    )
    db_session.add_all([*invisible_risks, visible_risk])
    await db_session.flush()

    approvals = [
        ApprovalRequest(
            resource_type=ApprovalResourceType.RISK,
            resource_id=risk.id,
            resource_name=risk.name,
            requested_by_id=test_user.id,
            primary_approver_id=test_user.id,
            reason=f"Hidden approval {index}",
            status=ApprovalStatus.PENDING,
            scenario_key="risk_delete",
            scenario_approver_roles=["employee"],
            created_at=now + timedelta(minutes=index + 1),
        )
        for index, risk in enumerate(invisible_risks)
    ]
    visible_approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=visible_risk.id,
        resource_name=visible_risk.name,
        requested_by_id=test_user.id,
        primary_approver_id=test_user.id,
        reason="Visible approval",
        status=ApprovalStatus.PENDING,
        scenario_key="risk_delete",
        scenario_approver_roles=["employee"],
        created_at=now,
    )
    db_session.add_all([*approvals, visible_approval])
    await db_session.commit()

    post_filter_checks: list[int] = []
    original_check = approval_queue_visibility.can_view_pending_approval_queue_item

    async def counting_check(*args, approval: ApprovalRequest, **kwargs):
        post_filter_checks.append(approval.id)
        return await original_check(*args, approval=approval, **kwargs)

    monkeypatch.setattr(approval_queue_visibility, "can_view_pending_approval_queue_item", counting_check)

    response = await list_approval_queue_page(
        db=db_session,
        current_user=test_user_employee,
        skip=0,
        limit=1,
        status_filter=ApprovalStatusEnum.pending,
        resource_type=None,
        my_requests=False,
    )

    assert response.total == 1
    assert [item.id for item in response.items] == [visible_approval.id]
    assert post_filter_checks == []


@pytest.mark.asyncio
async def test_my_approvals_excludes_self_requested_primary_and_scenario_pending_rows(
    db_session: AsyncSession,
    test_risk: Risk,
    test_user_employee: User,
):
    self_primary = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=test_risk.id,
        resource_name=test_risk.name,
        requested_by_id=test_user_employee.id,
        primary_approver_id=test_user_employee.id,
        reason="Self primary pending",
        status=ApprovalStatus.PENDING,
    )
    self_scenario = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=test_risk.id,
        resource_name=test_risk.name,
        requested_by_id=test_user_employee.id,
        primary_approver_id=test_user_employee.id,
        reason="Self scenario pending",
        status=ApprovalStatus.PENDING,
        scenario_key="risk_delete",
        scenario_approver_roles=["employee"],
    )
    db_session.add_all([self_primary, self_scenario])
    await db_session.commit()

    approvals_to_resolve = await list_my_approval_queue_page(
        db=db_session,
        current_user=test_user_employee,
        skip=0,
        limit=10,
    )
    own_requests = await list_approval_queue_page(
        db=db_session,
        current_user=test_user_employee,
        skip=0,
        limit=10,
        status_filter=ApprovalStatusEnum.pending,
        resource_type=None,
        my_requests=True,
    )

    assert approvals_to_resolve.total == 0
    assert own_requests.total == 2
