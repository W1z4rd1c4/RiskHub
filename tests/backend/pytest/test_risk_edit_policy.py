"""Pin the existing Risk-edit policy; high score alone is not an approval trigger."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import has_permission, is_high_risk_for_approval_async
from app.models import ApprovalRequest, Department, User
from tests.backend.pytest.factories import create_test_risk

EDIT_CASES = [
    pytest.param({"net_probability": 1, "net_impact": 1}, id="score-decrease"),
    pytest.param({"status": "emerging"}, id="active-to-emerging"),
    pytest.param(
        {
            "acceptance_approver": "Recorded approver",
            "acceptance_justification": "Recorded justification",
            "acceptance_date": "2026-10-14",
        },
        id="acceptance-metadata",
    ),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", EDIT_CASES)
@pytest.mark.parametrize("is_priority", [False, True], ids=["nonpriority", "priority"])
async def test_risk_owner_edits_follow_priority_policy_not_score_alone(
    db_session: AsyncSession,
    client_factory,
    test_user_employee: User,
    test_department: Department,
    payload: dict,
    is_priority: bool,
):
    assert not has_permission(test_user_employee, "risks", "write")
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        overrides={
            "category": "Operational",
            "is_priority": is_priority,
            "gross_probability": 5,
            "gross_impact": 5,
            "gross_score": 25,
            "net_probability": 5,
            "net_impact": 5,
            "net_score": 25,
        },
    )
    assert await is_high_risk_for_approval_async(risk, db_session)
    async with client_factory(current_user=test_user_employee) as client:
        before = await client.get(f"/api/v1/risks/{risk.id}")
        assert before.status_code == 200, before.text
        assert before.json()["capabilities"]["can_update"] is True
        assert before.json()["capabilities"]["requires_privileged_update_approval"] is is_priority
        response = await client.patch(f"/api/v1/risks/{risk.id}", json=payload)

    assert response.status_code == (202 if is_priority else 200), response.text
    approvals = (await db_session.execute(select(ApprovalRequest))).scalars().all()
    await db_session.refresh(risk)
    if is_priority:
        assert len(approvals) == 1
        assert approvals[0].id == response.json()["approval_id"]
        assert approvals[0].requires_privileged_approval is True
        assert risk.net_score == 25
        assert risk.status == "active"
        assert risk.acceptance_approver is None
        assert risk.acceptance_justification is None
        assert risk.acceptance_date is None
        for field, value in payload.items():
            assert approvals[0].pending_changes[field]["new"] == value
    else:
        assert approvals == []
        for field, value in payload.items():
            assert response.json()[field] == value
            stored = getattr(risk, field)
            assert (stored.isoformat() if hasattr(stored, "isoformat") else stored) == value
        if "net_probability" in payload:
            assert risk.net_score == response.json()["net_score"] == 1
            assert not await is_high_risk_for_approval_async(risk, db_session)


@pytest.mark.asyncio
async def test_accepted_status_is_invalid_even_for_risk_owner(
    db_session: AsyncSession,
    client_factory,
    test_user_employee: User,
    test_department: Department,
):
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_employee.id,
    )
    async with client_factory(current_user=test_user_employee) as client:
        response = await client.patch(f"/api/v1/risks/{risk.id}", json={"status": "accepted"})
    assert response.status_code == 422, response.text
    assert any(error["loc"] == ["body", "status"] and error["type"] == "enum" for error in response.json()["detail"])
    await db_session.refresh(risk)
    assert risk.status == "active"
    assert (await db_session.execute(select(ApprovalRequest))).scalars().all() == []


@pytest.mark.asyncio
async def test_nonowner_without_write_cannot_use_risk_owner_edit_exception(
    db_session: AsyncSession,
    client_factory,
    test_user_employee: User,
    test_department: Department,
):
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=None,
    )
    async with client_factory(current_user=test_user_employee) as client:
        response = await client.patch(f"/api/v1/risks/{risk.id}", json={"status": "emerging"})
    assert response.status_code == 403, response.text
    await db_session.refresh(risk)
    assert risk.status == "active"
    assert (await db_session.execute(select(ApprovalRequest))).scalars().all() == []
