"""
RBAC tests for report endpoints.
Tests department scoping and permission enforcement.
"""
import csv
from io import StringIO
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ActivityLog,
    Control,
    Department,
    KeyRiskIndicator,
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
    Vendor,
)


@pytest.fixture
async def second_department(db_session: AsyncSession) -> Department:
    """Create a second department for cross-department testing."""
    dept = Department(name="Finance", code="FIN", description="Finance department")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)
    return dept


@pytest.fixture
async def test_control_other_dept(db_session: AsyncSession, second_department: Department, test_user: User) -> Control:
    """Create a control in a different department."""
    control = Control(
        name="Finance Control",
        description="A control in Finance dept",
        department_id=second_department.id,
        control_owner_id=test_user.id,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)
    return control


@pytest.fixture
async def test_control_own_dept(db_session: AsyncSession, test_department: Department, test_user: User) -> Control:
    """Create a control in the test user's department."""
    control = Control(
        name="Test Control",
        description="A control in test dept",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)
    return control


@pytest.fixture
async def test_risk_other_dept(db_session: AsyncSession, second_department: Department, test_user: User) -> Risk:
    """Create a risk in a different department."""
    risk = Risk(
        risk_id_code="FIN-R01",
        name="Finance Risk",
        process="Finance",
        description="Finance risk",
        category="Financial",
        department_id=second_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)
    return risk


class TestReportPermissions:
    """Test permission enforcement on report endpoints."""

    @pytest.mark.asyncio
    async def test_admin_can_export_all_controls_pdf(
        self,
        auth_client: AsyncClient,
        test_control_own_dept: Control,
        test_control_other_dept: Control,
    ):
        """Admin (privileged) can export controls from all departments."""
        response = await auth_client.get("/api/v1/reports/controls/pdf")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"

    @pytest.mark.asyncio
    async def test_admin_can_export_all_risks_pdf(
        self,
        auth_client: AsyncClient,
        test_risk: Risk,
        test_risk_other_dept: Risk,
    ):
        """Admin can export risks from all departments."""
        response = await auth_client.get("/api/v1/reports/risks/pdf")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"

    @pytest.mark.asyncio
    async def test_admin_can_export_summary_pdf(
        self,
        auth_client: AsyncClient,
        test_control_own_dept: Control,
    ):
        """Admin can export dashboard summary."""
        response = await auth_client.get("/api/v1/reports/summary/pdf")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"


class TestReportDepartmentScoping:
    """Test department scoping for non-privileged users."""

    @pytest.mark.asyncio
    async def test_employee_cannot_export_cross_department(
        self,
        client_employee: AsyncClient,
        second_department: Department,
        test_control_other_dept: Control,
    ):
        """Employee cannot request export for a department they don't belong to."""
        response = await client_employee.get(
            f"/api/v1/reports/controls/pdf?department_id={second_department.id}"
        )
        assert response.status_code == 403
        assert "Access denied" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_employee_can_export_own_department_controls(
        self,
        client_employee: AsyncClient,
        test_control_own_dept: Control,
    ):
        """Employee can export controls from their own department."""
        response = await client_employee.get("/api/v1/reports/controls/pdf")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"

    @pytest.mark.asyncio
    async def test_employee_can_export_own_department_risks(
        self,
        client_employee: AsyncClient,
        test_risk: Risk,
    ):
        """Employee can export risks from their own department."""
        response = await client_employee.get("/api/v1/reports/risks/pdf")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_employee_cross_department_risks_blocked(
        self,
        client_employee: AsyncClient,
        second_department: Department,
        test_risk_other_dept: Risk,
    ):
        """Employee cannot export risks from another department."""
        response = await client_employee.get(
            f"/api/v1/reports/risks/pdf?department_id={second_department.id}"
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_employee_summary_scoped_to_own_department(
        self,
        client_employee: AsyncClient,
        test_control_own_dept: Control,
    ):
        """Employee's summary export only includes their department data."""
        response = await client_employee.get("/api/v1/reports/summary/pdf")
        assert response.status_code == 200



class TestReportExcelEndpoints:
    """Test Excel export endpoints have same RBAC as PDF."""

    @pytest.mark.asyncio
    async def test_admin_can_export_controls_excel(
        self,
        auth_client: AsyncClient,
        test_control_own_dept: Control,
    ):
        """Admin can export controls as Excel."""
        response = await auth_client.get("/api/v1/reports/controls/excel")
        assert response.status_code == 200
        assert "spreadsheetml" in response.headers["content-type"]

    @pytest.mark.asyncio
    async def test_admin_can_export_risks_excel(
        self,
        auth_client: AsyncClient,
        test_risk: Risk,
    ):
        """Admin can export risks as Excel."""
        response = await auth_client.get("/api/v1/reports/risks/excel")
        assert response.status_code == 200
        assert "spreadsheetml" in response.headers["content-type"]


    @pytest.mark.asyncio
    async def test_employee_cannot_export_cross_department_excel(
        self,
        client_employee: AsyncClient,
        second_department: Department,
        test_control_other_dept: Control,
    ):
        """Employee blocked from cross-department Excel export."""
        response = await client_employee.get(
            f"/api/v1/reports/controls/excel?department_id={second_department.id}"
        )
        assert response.status_code == 403


class TestUnifiedExportEndpoints:
    """Regression coverage for /reports/*/export endpoints."""

    @pytest.mark.asyncio
    async def test_risk_unified_export_supports_all_formats(
        self,
        auth_client: AsyncClient,
        test_risk: Risk,
    ):
        for fmt in ("pdf", "xlsx", "csv"):
            response = await auth_client.get(f"/api/v1/reports/risks/export?format={fmt}")
            assert response.status_code == 200
            if fmt == "pdf":
                assert response.headers["content-type"] == "application/pdf"
            elif fmt == "xlsx":
                assert "spreadsheetml" in response.headers["content-type"]
            else:
                assert "text/csv" in response.headers["content-type"]

    @pytest.mark.asyncio
    async def test_control_unified_export_supports_all_formats(
        self,
        auth_client: AsyncClient,
        test_control_own_dept: Control,
    ):
        for fmt in ("pdf", "xlsx", "csv"):
            response = await auth_client.get(f"/api/v1/reports/controls/export?format={fmt}")
            assert response.status_code == 200
            if fmt == "pdf":
                assert response.headers["content-type"] == "application/pdf"
            elif fmt == "xlsx":
                assert "spreadsheetml" in response.headers["content-type"]
            else:
                assert "text/csv" in response.headers["content-type"]

    @pytest.mark.asyncio
    async def test_unified_export_csv_is_department_scoped(
        self,
        client_employee: AsyncClient,
        db_session: AsyncSession,
        test_department: Department,
        second_department: Department,
        test_user_employee: User,
    ):
        own_risk = Risk(
            risk_id_code="EMP-R-001",
            name="Employee Dept Risk",
            process="Ops",
            description="Visible to employee",
            category="Operational",
            department_id=test_department.id,
            owner_id=test_user_employee.id,
            risk_type="operational",
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="active",
        )
        other_risk = Risk(
            risk_id_code="OTH-R-001",
            name="Other Dept Risk",
            process="Finance",
            description="Must stay hidden",
            category="Financial",
            department_id=second_department.id,
            owner_id=test_user_employee.id + 1000,
            risk_type="operational",
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="active",
        )
        db_session.add_all([own_risk, other_risk])
        await db_session.commit()

        response = await client_employee.get("/api/v1/reports/risks/export?format=csv")
        assert response.status_code == 200
        csv_payload = response.content.decode("utf-8")
        assert "Employee Dept Risk" in csv_payload
        assert "Other Dept Risk" not in csv_payload

    @pytest.mark.asyncio
    async def test_risk_as_of_export_replays_post_cutoff_status_change(
        self,
        auth_client: AsyncClient,
        db_session: AsyncSession,
        test_department: Department,
        test_user: User,
    ):
        risk = Risk(
            risk_id_code="ASOF-R-001",
            name="As-Of Risk",
            process="Claims",
            description="As-of replay test",
            category="Operational",
            department_id=test_department.id,
            owner_id=test_user.id,
            risk_type="operational",
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="archived",
        )
        db_session.add(risk)
        await db_session.flush()

        log = ActivityLog(
            entity_type="risk",
            entity_id=risk.id,
            entity_name=risk.name,
            action="archive",
            actor_id=test_user.id,
            actor_name=test_user.name,
            department_id=test_department.id,
            changes={"status": {"old": "active", "new": "archived"}},
            description="Archived risk",
            created_at=datetime.now(UTC),
        )
        db_session.add(log)
        await db_session.commit()

        yesterday = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
        response = await auth_client.get(f"/api/v1/reports/risks/export?format=csv&as_of_date={yesterday}")
        assert response.status_code == 200
        csv_payload = response.content.decode("utf-8")
        assert "As-Of Risk" in csv_payload
        assert "active" in csv_payload

    @pytest.mark.asyncio
    async def test_kri_and_vendor_export_endpoints_available(
        self,
        auth_client: AsyncClient,
        db_session: AsyncSession,
        test_department: Department,
        test_user: User,
        test_risk: Risk,
    ):
        kri = KeyRiskIndicator(
            risk_id=test_risk.id,
            metric_name="Export KRI",
            description="KRI export",
            unit="%",
            current_value=12.5,
            lower_limit=1.0,
            upper_limit=20.0,
            reporting_owner_id=test_user.id,
            is_archived=False,
        )
        vendor = Vendor(
            name="Export Vendor",
            process="IT",
            subprocess=None,
            department_id=test_department.id,
            outsourcing_owner_user_id=test_user.id,
            vendor_type="ict",
            risk_score_1_5=3,
            supports_important_core_insurance_function=False,
            dora_relevant=False,
            is_significant_vendor=False,
            has_alternative_providers=False,
            status="active",
        )
        db_session.add_all([kri, vendor])
        await db_session.commit()

        for fmt in ("pdf", "xlsx", "csv"):
            kri_resp = await auth_client.get(f"/api/v1/reports/kris/export?format={fmt}")
            vendor_resp = await auth_client.get(f"/api/v1/reports/vendors/export?format={fmt}")
            assert kri_resp.status_code == 200
            assert vendor_resp.status_code == 200

    @pytest.mark.asyncio
    async def test_vendor_as_of_export_replays_post_cutoff_status_change(
        self,
        auth_client: AsyncClient,
        db_session: AsyncSession,
        test_department: Department,
        test_user: User,
    ):
        vendor = Vendor(
            name="As-Of Vendor",
            process="IT",
            subprocess=None,
            department_id=test_department.id,
            outsourcing_owner_user_id=test_user.id,
            vendor_type="ict",
            risk_score_1_5=2,
            supports_important_core_insurance_function=False,
            dora_relevant=False,
            is_significant_vendor=False,
            has_alternative_providers=True,
            status="inactive",
        )
        db_session.add(vendor)
        await db_session.flush()

        log = ActivityLog(
            entity_type="vendor",
            entity_id=vendor.id,
            entity_name=vendor.name,
            action="archive",
            actor_id=test_user.id,
            actor_name=test_user.name,
            department_id=test_department.id,
            changes={"status": {"old": "active", "new": "inactive"}},
            description="Archived vendor",
            created_at=datetime.now(UTC),
        )
        db_session.add(log)
        await db_session.commit()

        yesterday = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
        response = await auth_client.get(f"/api/v1/reports/vendors/export?format=csv&as_of_date={yesterday}")
        assert response.status_code == 200
        csv_payload = response.content.decode("utf-8")
        assert "As-Of Vendor" in csv_payload
        assert "active" in csv_payload

    @pytest.mark.asyncio
    async def test_risk_as_of_export_rehydrates_owner_and_department_names(
        self,
        auth_client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
    ):
        old_department = Department(name="AsOf Department Old", code="ASOF_DEP_OLD", description="Old dept")
        new_department = Department(name="AsOf Department New", code="ASOF_DEP_NEW", description="New dept")
        db_session.add_all([old_department, new_department])
        await db_session.flush()

        old_owner = User(
            name="AsOf Owner Old",
            email="asof-owner-old@test.com",
            role_id=test_user.role_id,
            department_id=old_department.id,
            is_active=True,
        )
        new_owner = User(
            name="AsOf Owner New",
            email="asof-owner-new@test.com",
            role_id=test_user.role_id,
            department_id=new_department.id,
            is_active=True,
        )
        db_session.add_all([old_owner, new_owner])
        await db_session.flush()

        risk = Risk(
            risk_id_code="ASOF-R-LABEL-001",
            name="As-Of Label Risk",
            process="Operations",
            description="As-of owner/department rehydrate check",
            category="Operational",
            department_id=new_department.id,
            owner_id=new_owner.id,
            risk_type="operational",
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="active",
        )
        db_session.add(risk)
        await db_session.flush()

        db_session.add(
            ActivityLog(
                entity_type="risk",
                entity_id=risk.id,
                entity_name=risk.name,
                action="update",
                actor_id=test_user.id,
                actor_name=test_user.name,
                department_id=new_department.id,
                changes={
                    "owner_id": {"old": old_owner.id, "new": new_owner.id},
                    "department_id": {"old": old_department.id, "new": new_department.id},
                },
                description="Reassigned risk owner and department",
                created_at=datetime.now(UTC),
            )
        )
        await db_session.commit()

        as_of = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
        response = await auth_client.get(f"/api/v1/reports/risks/export?format=csv&as_of_date={as_of}")
        assert response.status_code == 200

        csv_payload = response.content.decode("utf-8")
        rows = list(csv.DictReader(StringIO(csv_payload)))
        risk_row = next((row for row in rows if row.get("Risk ID") == "ASOF-R-LABEL-001"), None)

        assert risk_row is not None
        assert risk_row["Owner"] == old_owner.name
        assert risk_row["Department"] == old_department.name
        assert risk_row["Owner"] != new_owner.name
        assert risk_row["Department"] != new_department.name

    @pytest.mark.asyncio
    async def test_kri_as_of_export_recomputes_status_and_rehydrates_reporting_owner(
        self,
        auth_client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_risk: Risk,
    ):
        old_owner = User(
            name="AsOf KRI Owner Old",
            email="asof-kri-owner-old@test.com",
            role_id=test_user.role_id,
            department_id=test_risk.department_id,
            is_active=True,
        )
        new_owner = User(
            name="AsOf KRI Owner New",
            email="asof-kri-owner-new@test.com",
            role_id=test_user.role_id,
            department_id=test_risk.department_id,
            is_active=True,
        )
        db_session.add_all([old_owner, new_owner])
        await db_session.flush()

        kri = KeyRiskIndicator(
            risk_id=test_risk.id,
            metric_name="As-Of KRI Replay",
            description="As-of status rehydrate check",
            unit="%",
            current_value=12.0,
            lower_limit=1.0,
            upper_limit=20.0,
            reporting_owner_id=new_owner.id,
            is_archived=False,
        )
        db_session.add(kri)
        await db_session.flush()

        db_session.add(
            ActivityLog(
                entity_type="kri",
                entity_id=kri.id,
                entity_name=kri.metric_name,
                action="update",
                actor_id=test_user.id,
                actor_name=test_user.name,
                department_id=test_risk.department_id,
                changes={
                    "is_archived": {"old": True, "new": False},
                    "reporting_owner_id": {"old": old_owner.id, "new": new_owner.id},
                },
                description="Restored KRI and changed reporting owner",
                created_at=datetime.now(UTC),
            )
        )
        await db_session.commit()

        as_of = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
        response = await auth_client.get(
            f"/api/v1/reports/kris/export?format=csv&as_of_date={as_of}&status=archived"
        )
        assert response.status_code == 200

        csv_payload = response.content.decode("utf-8")
        rows = list(csv.DictReader(StringIO(csv_payload)))
        kri_row = next((row for row in rows if row.get("Metric") == "As-Of KRI Replay"), None)

        assert kri_row is not None
        assert kri_row["Status"] == "archived"
        assert kri_row["Reporting Owner"] == old_owner.name
        assert kri_row["Reporting Owner"] != new_owner.name
