import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Permission, Role, RolePermission, User, Vendor


@pytest.mark.asyncio
async def test_dashboard_summary_vendor_metrics_scoped_by_department(
    db_session: AsyncSession,
    client_department_head: AsyncClient,
    client_cro: AsyncClient,
    test_department: Department,
    test_user_department_head: User,
    test_user_cro: User,
):
    role = (await db_session.execute(select(Role).where(Role.id == test_user_department_head.role_id))).scalar_one()
    perm = Permission(resource="vendors", action="read", description="Read vendors")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()
    db_session.expire(role, ["permissions"])

    dept2 = Department(name="Dept 2", code="D2", description="Second department")
    db_session.add(dept2)
    await db_session.commit()
    await db_session.refresh(dept2)

    vendor1 = Vendor(
        name="Vendor Dept 1",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_department_head.id,
        vendor_type="ict",
        risk_score_1_5=4,
        supports_important_core_insurance_function=True,
        dora_relevant=True,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    vendor2 = Vendor(
        name="Vendor Dept 2",
        process="IT",
        subprocess=None,
        department_id=dept2.id,
        outsourcing_owner_user_id=test_user_cro.id,
        vendor_type="ict",
        risk_score_1_5=4,
        supports_important_core_insurance_function=True,
        dora_relevant=True,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add_all([vendor1, vendor2])
    await db_session.commit()

    resp = await client_department_head.get("/api/v1/dashboard/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_vendors"] == 1
    assert data["high_risk_vendors_count"] == 1

    resp = await client_cro.get("/api/v1/dashboard/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_vendors"] == 2
    assert data["high_risk_vendors_count"] == 2


@pytest.mark.asyncio
async def test_committee_summary_includes_critical_vendors_section(
    client_department_head: AsyncClient,
):
    resp = await client_department_head.get("/api/v1/dashboard/committee-summary")
    assert resp.status_code == 200
    data = resp.json()

    assert "critical_vendors" in data
    assert data["critical_vendors_total"] is None
    assert data["can_view_vendors"] is False


@pytest.mark.asyncio
async def test_committee_summary_high_risk_vendors_excludes_score_three_and_reports_total(
    db_session: AsyncSession,
    client_cro: AsyncClient,
    test_department: Department,
    test_user_cro: User,
):
    vendors = [
        Vendor(
            name=name,
            process="IT",
            department_id=test_department.id,
            outsourcing_owner_user_id=test_user_cro.id,
            vendor_type="ict",
            risk_score_1_5=score,
            status="active",
        )
        for name, score in [
            ("Excluded score three", 3),
            ("Zulu score five", 5),
            ("Alpha score four", 4),
            ("Alpha score five", 5),
            ("Charlie score four", 4),
            ("Bravo score five", 5),
            ("Bravo score four", 4),
        ]
    ]
    db_session.add_all(vendors)
    await db_session.commit()

    response = await client_cro.get("/api/v1/dashboard/committee-summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["can_view_vendors"] is True
    assert payload["critical_vendors_total"] == 6
    assert [item["name"] for item in payload["critical_vendors"]] == [
        "Alpha score five",
        "Bravo score five",
        "Zulu score five",
        "Alpha score four",
        "Bravo score four",
    ]
    assert "Excluded score three" not in {
        item["name"] for item in payload["critical_vendors"]
    }


@pytest.mark.asyncio
async def test_committee_summary_critical_vendors_uses_actor_visible_vendor_scope(
    db_session: AsyncSession,
    client_department_head: AsyncClient,
    test_department: Department,
    test_user_cro: User,
    test_user_department_head: User,
):
    role = (await db_session.execute(select(Role).where(Role.id == test_user_department_head.role_id))).scalar_one()
    perm = Permission(resource="vendors", action="read", description="Read vendors")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()
    db_session.expire(role, ["permissions"])

    other_dept = Department(name="Vendor Committee Other", code="VCOM", description="Other")
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    owned_other = Vendor(
        name="Committee Owned Other Vendor",
        process="IT",
        subprocess=None,
        department_id=other_dept.id,
        outsourcing_owner_user_id=test_user_department_head.id,
        vendor_type="ict",
        risk_score_1_5=5,
        supports_important_core_insurance_function=True,
        dora_relevant=True,
        is_significant_vendor=True,
        has_alternative_providers=False,
        status="active",
    )
    unrelated_other = Vendor(
        name="Committee Hidden Other Vendor",
        process="IT",
        subprocess=None,
        department_id=other_dept.id,
        outsourcing_owner_user_id=test_user_cro.id,
        vendor_type="ict",
        risk_score_1_5=5,
        supports_important_core_insurance_function=True,
        dora_relevant=True,
        is_significant_vendor=True,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add_all([owned_other, unrelated_other])
    await db_session.commit()

    resp = await client_department_head.get("/api/v1/dashboard/committee-summary")
    assert resp.status_code == 200
    names = {item["name"] for item in resp.json()["critical_vendors"]}
    assert "Committee Owned Other Vendor" in names
    assert "Committee Hidden Other Vendor" not in names


@pytest.mark.asyncio
async def test_dashboard_summary_hides_vendor_metrics_without_vendors_read(
    db_session: AsyncSession,
    client_department_head: AsyncClient,
    test_department: Department,
    test_user_department_head: User,
):
    vendor = Vendor(
        name="Vendor Dept 1",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_department_head.id,
        vendor_type="ict",
        risk_score_1_5=4,
        supports_important_core_insurance_function=True,
        dora_relevant=True,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()

    resp = await client_department_head.get("/api/v1/dashboard/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_vendors"] == 0
    assert data["high_risk_vendors_count"] == 0
