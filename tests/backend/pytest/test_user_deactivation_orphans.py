import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, OrphanedItem, Risk, Role, User
from app.models.risk import RiskStatus


@pytest.mark.asyncio
async def test_user_deactivation_flags_orphaned_risks_and_controls(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_role_employee: Role,
    test_user: User,
):
    target_user = User(
        name="Target Owner",
        email="target.owner@test.com",
        department_id=test_department.id,
        role_id=test_role_employee.id,
        is_active=True,
    )
    db_session.add(target_user)
    await db_session.commit()
    await db_session.refresh(target_user)

    risk = Risk(
        risk_id_code="R-TGT-001",
        name="Target Risk",
        process="Test",
        description="",
        category="Test",
        department_id=test_department.id,
        owner_id=target_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    control = Control(
        name="Target Control",
        description="",
        data_source=None,
        methodology_reference=None,
        control_form="manual",
        process_owner_position=None,
        control_owner_id=target_user.id,
        executor_position=None,
        frequency="monthly",
        risk_level=3,
        output_description=None,
        report_recipient=None,
        documentation_location=None,
        department_id=test_department.id,
        status="draft",
        created_by_id=test_user.id,
        updated_by_id=test_user.id,
    )
    db_session.add_all([risk, control])
    await db_session.commit()
    await db_session.refresh(risk)
    await db_session.refresh(control)

    resp = await auth_client.patch(f"/api/v1/users/{target_user.id}", json={"is_active": False})
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    orphans = (
        (
            await db_session.execute(
                select(OrphanedItem).where(
                    OrphanedItem.previous_owner_id == target_user.id,
                    OrphanedItem.status == "pending",
                )
            )
        )
        .scalars()
        .all()
    )

    assert {(o.item_type, o.item_id) for o in orphans} == {("risk", risk.id), ("control", control.id)}

    # Idempotency: re-deactivating does not create duplicates
    resp2 = await auth_client.patch(f"/api/v1/users/{target_user.id}", json={"is_active": False})
    assert resp2.status_code == 200

    orphans2 = (
        (
            await db_session.execute(
                select(OrphanedItem).where(
                    OrphanedItem.previous_owner_id == target_user.id,
                    OrphanedItem.status == "pending",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(orphans2) == 2
