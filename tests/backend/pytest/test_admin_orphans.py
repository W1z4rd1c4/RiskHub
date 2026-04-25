import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, ControlRiskLink, KeyRiskIndicator, OrphanedItem, Risk


@pytest.mark.asyncio
async def test_fix_orphans_requires_explicit_resolutions(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_user_platform_admin,
):
    risk = Risk(
        risk_id_code="R-ORPH-REQ-1",
        name="Needs Resolution",
        process="Ops",
        description="",
        category="Operational",
        department_id=test_user_platform_admin.department_id,
        owner_id=test_user_platform_admin.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk)
    await db_session.flush()
    orphan = OrphanedItem(
        item_type="risk",
        item_id=risk.id,
        previous_owner_id=test_user_platform_admin.id,
        status="pending",
    )
    db_session.add(orphan)
    await db_session.commit()

    response = await client_platform_admin.post("/api/v1/admin/fix-orphans", json={"dry_run": True, "resolutions": []})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_fix_orphans_dry_run_validates_explicit_mapping(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_platform_admin,
):
    target_risk = Risk(
        risk_id_code="R-ORPH-TARGET-1",
        name="Target Risk",
        process="Orphan Process",
        description="Risk for orphan remediation tests",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_platform_admin.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    control = Control(
        name="Orphan Control",
        description="Control without links",
        department_id=test_department.id,
        control_owner_id=test_user_platform_admin.id,
        frequency="monthly",
        status="active",
    )
    db_session.add_all([target_risk, control])
    await db_session.flush()
    orphan = OrphanedItem(
        item_type="control",
        item_id=control.id,
        previous_owner_id=test_user_platform_admin.id,
        status="pending",
    )
    db_session.add(orphan)
    await db_session.commit()

    response = await client_platform_admin.post(
        "/api/v1/admin/fix-orphans",
        json={
            "dry_run": True,
            "resolutions": [
                {
                    "orphan_id": orphan.id,
                    "new_owner_id": test_user_platform_admin.id,
                    "department_id": test_department.id,
                    "target_risk_id": target_risk.id,
                }
            ],
        },
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["dry_run"] is True
    assert payload["resolved_count"] == 1
    assert payload["controls_fixed"] == 1
    assert payload["results"][0]["applied"] is False

    await db_session.refresh(orphan)
    assert orphan.status == "pending"
    links = list((await db_session.execute(select(ControlRiskLink))).scalars().all())
    assert links == []


@pytest.mark.asyncio
async def test_fix_orphans_rejects_duplicate_orphan_ids_in_batch(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_platform_admin,
):
    target_risk = Risk(
        risk_id_code="R-ORPH-DUP-1",
        name="Duplicate Target Risk",
        process="Orphan Process",
        description="Risk for duplicate-orphan remediation tests",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_platform_admin.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    control = Control(
        name="Duplicate Apply Control",
        description="Control without links",
        department_id=test_department.id,
        control_owner_id=test_user_platform_admin.id,
        frequency="monthly",
        status="active",
    )
    db_session.add_all([target_risk, control])
    await db_session.flush()
    orphan = OrphanedItem(
        item_type="control",
        item_id=control.id,
        previous_owner_id=test_user_platform_admin.id,
        status="pending",
    )
    db_session.add(orphan)
    await db_session.commit()

    response = await client_platform_admin.post(
        "/api/v1/admin/fix-orphans",
        json={
            "dry_run": False,
            "resolutions": [
                {
                    "orphan_id": orphan.id,
                    "new_owner_id": test_user_platform_admin.id,
                    "department_id": test_department.id,
                    "target_risk_id": target_risk.id,
                },
                {
                    "orphan_id": orphan.id,
                    "new_owner_id": test_user_platform_admin.id,
                    "department_id": test_department.id,
                    "target_risk_id": target_risk.id,
                },
            ],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == f"Duplicate orphan_id in request: {orphan.id}"

    await db_session.refresh(orphan)
    await db_session.refresh(control)
    assert orphan.status == "pending"
    assert control.control_owner_id == test_user_platform_admin.id
    links = list((await db_session.execute(select(ControlRiskLink))).scalars().all())
    assert links == []


@pytest.mark.asyncio
async def test_fix_orphans_applies_explicit_resolution(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_platform_admin,
):
    target_risk = Risk(
        risk_id_code="R-ORPH-TARGET-2",
        name="Target Risk",
        process="Orphan Process",
        description="Risk for orphan remediation tests",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_platform_admin.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    control = Control(
        name="Apply Control",
        description="Control without links",
        department_id=test_department.id,
        control_owner_id=test_user_platform_admin.id,
        frequency="monthly",
        status="active",
    )
    db_session.add_all([target_risk, control])
    await db_session.flush()
    orphan = OrphanedItem(
        item_type="control",
        item_id=control.id,
        previous_owner_id=test_user_platform_admin.id,
        status="pending",
    )
    db_session.add(orphan)
    await db_session.commit()

    response = await client_platform_admin.post(
        "/api/v1/admin/fix-orphans",
        json={
            "dry_run": False,
            "resolutions": [
                {
                    "orphan_id": orphan.id,
                    "new_owner_id": test_user_platform_admin.id,
                    "department_id": test_department.id,
                    "target_risk_id": target_risk.id,
                }
            ],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["dry_run"] is False
    assert payload["resolved_count"] == 1
    assert payload["results"][0]["applied"] is True

    await db_session.refresh(orphan)
    await db_session.refresh(control)
    assert orphan.status == "resolved"
    assert control.control_owner_id == test_user_platform_admin.id
    links = list((await db_session.execute(select(ControlRiskLink))).scalars().all())
    assert len(links) == 1
    assert links[0].risk_id == target_risk.id


@pytest.mark.asyncio
async def test_orphan_stats_reports_expected_counts(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_platform_admin,
):
    risk = Risk(
        risk_id_code="R-ORPH-STATS-1",
        name="Stats Risk",
        process="Stats Process",
        description="Risk for orphan stats tests",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_platform_admin.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk)
    await db_session.flush()

    db_session.add(
        Control(
            name="Stats Control",
            description="Control with no links",
            department_id=test_department.id,
            control_owner_id=test_user_platform_admin.id,
            frequency="monthly",
            status="active",
        )
    )
    db_session.add(
        KeyRiskIndicator(
            risk_id=risk.id,
            metric_name="Stats KRI",
            description="KRI for orphan stats test",
            current_value=10.0,
            lower_limit=5.0,
            upper_limit=15.0,
            frequency="quarterly",
        )
    )
    await db_session.commit()

    response = await client_platform_admin.get("/api/v1/admin/orphan-stats")
    assert response.status_code == 200

    payload = response.json()
    assert payload["orphan_kris"] == 0
    assert payload["controls_without_links"] == 1
    assert payload["total_risks"] == 1
    assert payload["total_controls"] == 1
    assert payload["total_kris"] == 1
    assert payload["total_links"] == 0
