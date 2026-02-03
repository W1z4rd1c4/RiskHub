import pytest

from datetime import datetime, timedelta, UTC
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, User, Vendor
from app.models import Permission, Role, RolePermission
from app.models.vendor_sla import VendorSLA
from app.models.vendor_incident import VendorIncident, VendorIncidentType, VendorIncidentSeverity


@pytest.mark.asyncio
async def test_dashboard_summary_vendor_metrics_scoped_by_department(
    db_session: AsyncSession,
    client_department_head: AsyncClient,
    client_cro: AsyncClient,
    test_department: Department,
    test_user_department_head: User,
    test_user_cro: User,
):
    # Vendor metrics are only computed for users with vendors:read.
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

    now = datetime.now(UTC).replace(tzinfo=None)

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
        next_reassessment_due_at=now - timedelta(days=1),
        reassessment_cadence_months=12,
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
        next_reassessment_due_at=now - timedelta(days=1),
        reassessment_cadence_months=12,
    )
    db_session.add_all([vendor1, vendor2])
    await db_session.commit()
    await db_session.refresh(vendor1)
    await db_session.refresh(vendor2)

    db_session.add_all(
        [
            VendorSLA(
                vendor_id=vendor1.id,
                metric_name="Uptime",
                description="",
                current_value=90,
                lower_limit=95,
                upper_limit=100,
                unit="%",
                frequency="monthly",
                last_reported_at=now,
                last_period_end=now.date(),
                is_archived=False,
            ),
            VendorSLA(
                vendor_id=vendor2.id,
                metric_name="Uptime",
                description="",
                current_value=90,
                lower_limit=95,
                upper_limit=100,
                unit="%",
                frequency="monthly",
                last_reported_at=now,
                last_period_end=now.date(),
                is_archived=False,
            ),
        ]
    )
    db_session.add(
        VendorIncident(
            vendor_id=vendor1.id,
            incident_type=VendorIncidentType.security,
            severity=VendorIncidentSeverity.high,
            is_major=True,
            occurred_at=now,
            summary="Major security incident",
            details=None,
        )
    )
    await db_session.commit()

    # Department head sees only their department vendors
    resp = await client_department_head.get("/api/v1/dashboard/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_vendors"] == 1
    assert data["high_risk_vendors_count"] == 1
    assert data["overdue_vendor_reassessments_count"] == 1
    assert data["breached_vendor_slas_count"] == 1

    # CRO sees both vendors
    resp = await client_cro.get("/api/v1/dashboard/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_vendors"] == 2
    assert data["high_risk_vendors_count"] == 2
    assert data["overdue_vendor_reassessments_count"] == 2
    assert data["breached_vendor_slas_count"] == 2


@pytest.mark.asyncio
async def test_committee_summary_includes_vendor_sections_and_scopes(
    client_department_head: AsyncClient,
):
    resp = await client_department_head.get("/api/v1/dashboard/committee-summary")
    assert resp.status_code == 200
    data = resp.json()

    assert "critical_vendors" in data
    assert "vendor_alerts" in data
    assert "overdue_reassessments" in data["vendor_alerts"]
    assert "sla_breaches" in data["vendor_alerts"]
    assert "major_incidents_30d" in data["vendor_alerts"]


@pytest.mark.asyncio
async def test_dashboard_summary_hides_vendor_metrics_without_vendors_read(
    db_session: AsyncSession,
    client_department_head: AsyncClient,
    test_department: Department,
    test_user_department_head: User,
):
    now = datetime.now(UTC).replace(tzinfo=None)

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
        next_reassessment_due_at=now - timedelta(days=1),
        reassessment_cadence_months=12,
    )
    db_session.add(vendor)
    await db_session.commit()

    resp = await client_department_head.get("/api/v1/dashboard/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_vendors"] == 0
    assert data["high_risk_vendors_count"] == 0
    assert data["overdue_vendor_reassessments_count"] == 0
    assert data["breached_vendor_slas_count"] == 0
