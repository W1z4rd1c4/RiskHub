from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, Department, Risk, User
from app.models.risk import RiskStatus


@pytest.mark.asyncio
async def test_employee_cannot_patch_cross_department_risk(
    client_employee,
    db_session: AsyncSession,
    test_user: User,
):
    dept_b = Department(name="Cross Dept B", code=f"CROSS-B-{uuid4().hex[:6]}")
    db_session.add(dept_b)
    await db_session.commit()
    await db_session.refresh(dept_b)

    risk = Risk(
        risk_id_code=f"R-CROSS-{uuid4().hex[:6]}",
        name="Cross Department Risk",
        process="Ops",
        subprocess=None,
        risk_type="operational",
        category="Operational",
        description="Cross department risk",
        department_id=dept_b.id,
        owner_id=test_user.id,
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
        is_priority=False,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    response = await client_employee.patch(
        f"/api/v1/risks/{risk.id}",
        json={"name": "Unauthorized Update"},
    )

    assert response.status_code in {403, 404}


@pytest.mark.asyncio
async def test_employee_cannot_patch_cross_department_control(
    client_employee,
    db_session: AsyncSession,
    test_user: User,
):
    dept_b = Department(name="Cross Dept Control", code=f"CROSS-C-{uuid4().hex[:6]}")
    db_session.add(dept_b)
    await db_session.commit()
    await db_session.refresh(dept_b)

    control = Control(
        name="Cross Department Control",
        description="Control for write-surface RBAC test",
        data_source="db",
        methodology_reference="policy",
        control_form="manual",
        process_owner_position="Head",
        control_owner_id=test_user.id,
        executor_position="Analyst",
        frequency="monthly",
        risk_level=3,
        output_description="report",
        report_recipient="owner",
        documentation_location="repo",
        department_id=dept_b.id,
        status="active",
        created_by_id=test_user.id,
        updated_by_id=test_user.id,
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    response = await client_employee.patch(
        f"/api/v1/controls/{control.id}",
        json={"name": "Unauthorized Control Update"},
    )

    assert response.status_code in {403, 404}
