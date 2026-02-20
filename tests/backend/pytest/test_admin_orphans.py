import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, ControlRiskLink, KeyRiskIndicator, Risk


@pytest.mark.asyncio
async def test_fix_orphans_returns_400_when_no_risks(client_platform_admin: AsyncClient):
    response = await client_platform_admin.post("/api/v1/admin/fix-orphans")

    assert response.status_code == 400
    assert response.json()["detail"] == "No risks available for assignment"


@pytest.mark.asyncio
async def test_fix_orphans_creates_links_within_bounds(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_platform_admin,
):
    risks = [
        Risk(
            risk_id_code=f"R-ORPH-{index}",
            name=f"Orphan Risk {index}",
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
        for index in range(1, 4)
    ]
    db_session.add_all(risks)

    controls = [
        Control(
            name=f"Orphan Control {index}",
            description="Control without links",
            department_id=test_department.id,
            control_owner_id=test_user_platform_admin.id,
            frequency="monthly",
            status="active",
        )
        for index in range(1, 3)
    ]
    db_session.add_all(controls)
    await db_session.commit()

    response = await client_platform_admin.post("/api/v1/admin/fix-orphans")
    assert response.status_code == 200

    payload = response.json()
    assert payload["kris_fixed"] == 0
    assert payload["controls_fixed"] == len(controls)
    assert len(controls) <= payload["links_created"] <= len(controls) * 3

    links = list((await db_session.execute(select(ControlRiskLink))).scalars().all())
    assert len(links) == payload["links_created"]
    risk_ids = {risk.id for risk in risks}

    for control in controls:
        links_for_control = [link for link in links if link.control_id == control.id]
        assert 1 <= len(links_for_control) <= min(3, len(risks))
        assert all(link.risk_id in risk_ids for link in links_for_control)


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
