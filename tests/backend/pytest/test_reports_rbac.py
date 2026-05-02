"""
RBAC tests for report endpoints.
Tests department scoping and permission enforcement.
"""

import csv
from datetime import UTC, date, datetime, timedelta
from io import StringIO

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.reports import audit_trail_excel as audit_trail_export_module
from app.models import (
    ActivityLog,
    Control,
    ControlExecution,
    Department,
    KeyRiskIndicator,
    KRIValueHistory,
    Risk,
    User,
    Vendor,
)
from app.models.risk import ControlRiskLink
from app.services._kri_history.periods import latest_closed_period_for_date
from tests.backend.pytest.factories import create_test_control, create_test_risk


@pytest_asyncio.fixture
async def second_department(db_session: AsyncSession) -> Department:
    """Create a second department for cross-department testing."""
    dept = Department(name="Finance", code="FIN", description="Finance department")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)
    return dept


@pytest_asyncio.fixture
async def test_control_other_dept(db_session: AsyncSession, second_department: Department, test_user: User) -> Control:
    """Create a control in a different department."""
    return await create_test_control(
        db_session,
        department_id=second_department.id,
        owner_id=test_user.id,
        name="Finance Control",
        overrides={"description": "A control in Finance dept"},
    )


@pytest_asyncio.fixture
async def test_control_own_dept(db_session: AsyncSession, test_department: Department, test_user: User) -> Control:
    """Create a control in the test user's department."""
    return await create_test_control(
        db_session,
        department_id=test_department.id,
        owner_id=test_user.id,
        name="Test Control",
        overrides={"description": "A control in test dept"},
    )


@pytest_asyncio.fixture
async def test_risk_other_dept(db_session: AsyncSession, second_department: Department, test_user: User) -> Risk:
    """Create a risk in a different department."""
    return await create_test_risk(
        db_session,
        risk_id_code="FIN-R01",
        department_id=second_department.id,
        owner_id=test_user.id,
        name="Finance Risk",
        process="Finance",
        overrides={"category": "Financial", "description": "Finance risk"},
    )


class TestReportPermissions:
    """Test permission enforcement on report endpoints."""

    @pytest.mark.asyncio
    async def test_admin_can_export_all_controls_csv(
        self,
        auth_client: AsyncClient,
        test_control_own_dept: Control,
        test_control_other_dept: Control,
    ):
        """Admin (privileged) can export controls from all departments."""
        response = await auth_client.get("/api/v1/reports/controls/export?format=csv")
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]

    @pytest.mark.asyncio
    async def test_admin_can_export_all_risks_csv(
        self,
        auth_client: AsyncClient,
        test_risk: Risk,
        test_risk_other_dept: Risk,
    ):
        """Admin can export risks from all departments."""
        response = await auth_client.get("/api/v1/reports/risks/export?format=csv")
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]

    @pytest.mark.asyncio
    async def test_admin_can_export_summary_csv(
        self,
        auth_client: AsyncClient,
        test_control_own_dept: Control,
    ):
        """Admin can export dashboard summary."""
        response = await auth_client.get("/api/v1/reports/summary/export?format=csv")
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]


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
            f"/api/v1/reports/controls/export?format=csv&department_id={second_department.id}"
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
        response = await client_employee.get("/api/v1/reports/controls/export?format=csv")
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]

    @pytest.mark.asyncio
    async def test_employee_can_export_own_department_risks(
        self,
        client_employee: AsyncClient,
        test_risk: Risk,
    ):
        """Employee can export risks from their own department."""
        response = await client_employee.get("/api/v1/reports/risks/export?format=csv")
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]

    @pytest.mark.asyncio
    async def test_employee_cross_department_risks_blocked(
        self,
        client_employee: AsyncClient,
        second_department: Department,
        test_risk_other_dept: Risk,
    ):
        """Employee cannot export risks from another department."""
        response = await client_employee.get(
            f"/api/v1/reports/risks/export?format=csv&department_id={second_department.id}"
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_employee_summary_scoped_to_own_department(
        self,
        client_employee: AsyncClient,
        test_control_own_dept: Control,
    ):
        """Employee's summary export only includes their department data."""
        response = await client_employee.get("/api/v1/reports/summary/export?format=csv")
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]


class TestReportExcelEndpoints:
    """Test legacy Excel endpoint bridge behavior."""

    @pytest.mark.asyncio
    async def test_admin_controls_excel_endpoint_returns_gone(
        self,
        auth_client: AsyncClient,
        test_control_own_dept: Control,
    ):
        """Legacy Excel endpoint is removed and returns 410."""
        response = await auth_client.get("/api/v1/reports/controls/excel")
        assert response.status_code == 410
        assert response.json()["detail"]["code"] == "excel_export_removed"


class TestReportMonitoringExports:
    @pytest.mark.asyncio
    async def test_controls_export_filters_and_includes_monitoring_columns(
        self,
        auth_client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_department: Department,
    ):
        passed_control = Control(
            name="Passed Export Control",
            description="Control with passing execution",
            department_id=test_department.id,
            control_owner_id=test_user.id,
            control_form="manual",
            frequency="monthly",
            risk_level=3,
            status="active",
        )
        failed_control = Control(
            name="Failed Export Control",
            description="Control with failed execution",
            department_id=test_department.id,
            control_owner_id=test_user.id,
            control_form="manual",
            frequency="monthly",
            risk_level=3,
            status="active",
        )
        db_session.add_all([passed_control, failed_control])
        await db_session.flush()

        db_session.add_all(
            [
                ControlExecution(
                    control_id=passed_control.id,
                    executed_by_id=test_user.id,
                    result="passed",
                    executed_at=datetime.now(UTC) - timedelta(days=2),
                ),
                ControlExecution(
                    control_id=failed_control.id,
                    executed_by_id=test_user.id,
                    result="failed",
                    executed_at=datetime.now(UTC) - timedelta(days=1),
                ),
            ]
        )
        await db_session.commit()

        response = await auth_client.get("/api/v1/reports/controls/export?format=csv&monitoring_status=passed")
        assert response.status_code == 200

        rows = list(csv.DictReader(StringIO(response.content.decode("utf-8"))))
        assert rows
        assert rows[0]["Monitoring Status"] == "passed"
        assert rows[0]["Latest Execution Result"] == "passed"
        assert rows[0]["Name"] == "Passed Export Control"
        exported_names = {row["Name"] for row in rows}
        assert "Failed Export Control" not in exported_names

    @pytest.mark.asyncio
    async def test_kris_export_filters_and_includes_monitoring_columns(
        self,
        auth_client: AsyncClient,
        db_session: AsyncSession,
        test_risk: Risk,
    ):
        _, required_period_end = latest_closed_period_for_date(datetime.now(UTC).date(), "quarterly")
        warning_kri = KeyRiskIndicator(
            risk_id=test_risk.id,
            metric_name="Warning Export KRI",
            description="KRI within upper warning margin",
            unit="%",
            current_value=95.0,
            lower_limit=0.0,
            upper_limit=100.0,
            frequency="quarterly",
            last_period_end=required_period_end,
            is_archived=False,
        )
        breach_kri = KeyRiskIndicator(
            risk_id=test_risk.id,
            metric_name="Breach Export KRI",
            description="KRI over threshold",
            unit="%",
            current_value=120.0,
            lower_limit=0.0,
            upper_limit=100.0,
            frequency="quarterly",
            last_period_end=required_period_end,
            is_archived=False,
        )
        db_session.add_all([warning_kri, breach_kri])
        await db_session.commit()

        response = await auth_client.get("/api/v1/reports/kris/export?format=csv&monitoring_status=warning")
        assert response.status_code == 200

        rows = list(csv.DictReader(StringIO(response.content.decode("utf-8"))))
        assert rows
        assert rows[0]["Metric"] == "Warning Export KRI"
        assert rows[0]["Monitoring Status"] == "warning"
        assert rows[0]["Required Due Date"]
        assert rows[0]["Days Overdue"] == "0"
        exported_metrics = {row["Metric"] for row in rows}
        assert "Breach Export KRI" not in exported_metrics

    @pytest.mark.asyncio
    async def test_kris_export_filters_due_soon_timeliness_status(
        self,
        auth_client: AsyncClient,
        db_session: AsyncSession,
        test_risk: Risk,
    ):
        due_soon_kri = KeyRiskIndicator(
            risk_id=test_risk.id,
            metric_name="Due Soon Export KRI",
            description="KRI due soon",
            unit="%",
            current_value=45.0,
            lower_limit=0.0,
            upper_limit=100.0,
            frequency="quarterly",
            last_period_end=None,
            is_archived=False,
        )
        reported_kri = KeyRiskIndicator(
            risk_id=test_risk.id,
            metric_name="Reported Export KRI",
            description="Already reported",
            unit="%",
            current_value=55.0,
            lower_limit=0.0,
            upper_limit=100.0,
            frequency="quarterly",
            last_period_end=date(2026, 3, 31),
            is_archived=False,
        )
        db_session.add_all([due_soon_kri, reported_kri])
        await db_session.commit()

        response = await auth_client.get(
            "/api/v1/reports/kris/export?format=csv&timeliness_status=due_soon&as_of_date=2026-03-27"
        )
        assert response.status_code == 200

        rows = list(csv.DictReader(StringIO(response.content.decode("utf-8"))))
        metrics = {row["Metric"] for row in rows}
        assert "Due Soon Export KRI" in metrics
        assert "Reported Export KRI" not in metrics

    @pytest.mark.asyncio
    async def test_kris_export_rejects_monitoring_and_timeliness_filters_together(
        self,
        auth_client: AsyncClient,
    ):
        response = await auth_client.get(
            "/api/v1/reports/kris/export?format=csv&monitoring_status=warning&timeliness_status=due_soon"
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "monitoring_status and timeliness_status cannot be used together"

    @pytest.mark.asyncio
    async def test_admin_risks_excel_endpoint_returns_gone(
        self,
        auth_client: AsyncClient,
        test_risk: Risk,
    ):
        """Legacy Excel endpoint is removed and returns 410."""
        response = await auth_client.get("/api/v1/reports/risks/excel")
        assert response.status_code == 410
        assert response.json()["detail"]["code"] == "excel_export_removed"

    @pytest.mark.asyncio
    async def test_admin_summary_excel_endpoint_returns_gone(
        self,
        auth_client: AsyncClient,
        test_control_own_dept: Control,
    ):
        response = await auth_client.get("/api/v1/reports/summary/excel")
        assert response.status_code == 410
        assert response.json()["detail"]["code"] == "excel_export_removed"

    @pytest.mark.asyncio
    async def test_employee_cannot_export_cross_department_excel(
        self,
        client_employee: AsyncClient,
        second_department: Department,
        test_control_other_dept: Control,
    ):
        """Employee remains blocked from cross-department legacy endpoint."""
        response = await client_employee.get(f"/api/v1/reports/controls/excel?department_id={second_department.id}")
        assert response.status_code == 403


class TestUnifiedExportEndpoints:
    """Regression coverage for /reports/*/export endpoints."""

    @pytest.mark.asyncio
    async def test_risk_unified_export_supports_supported_formats(
        self,
        auth_client: AsyncClient,
        test_risk: Risk,
    ):
        csv_response = await auth_client.get("/api/v1/reports/risks/export?format=csv")
        assert csv_response.status_code == 200
        assert "text/csv" in csv_response.headers["content-type"]

        excel_removed = await auth_client.get("/api/v1/reports/risks/export?format=xlsx")
        assert excel_removed.status_code == 410
        assert excel_removed.json()["detail"]["code"] == "excel_export_removed"

    @pytest.mark.asyncio
    async def test_control_unified_export_supports_supported_formats(
        self,
        auth_client: AsyncClient,
        test_control_own_dept: Control,
    ):
        csv_response = await auth_client.get("/api/v1/reports/controls/export?format=csv")
        assert csv_response.status_code == 200
        assert "text/csv" in csv_response.headers["content-type"]

        excel_removed = await auth_client.get("/api/v1/reports/controls/export?format=xlsx")
        assert excel_removed.status_code == 410
        assert excel_removed.json()["detail"]["code"] == "excel_export_removed"

    @pytest.mark.asyncio
    async def test_risk_unified_export_csv_includes_name_column_and_values(
        self,
        auth_client: AsyncClient,
        test_risk: Risk,
    ):
        response = await auth_client.get("/api/v1/reports/risks/export?format=csv")
        assert response.status_code == 200

        csv_payload = response.content.decode("utf-8")
        rows = list(csv.DictReader(StringIO(csv_payload)))
        assert rows
        assert "Name" in rows[0]
        assert any(row.get("Name") == test_risk.name for row in rows)

    @pytest.mark.asyncio
    async def test_unified_export_rejects_pdf_format(
        self,
        auth_client: AsyncClient,
        test_risk: Risk,
        test_control_own_dept: Control,
    ):
        for entity in ("risks", "controls", "kris", "vendors"):
            response = await auth_client.get(f"/api/v1/reports/{entity}/export?format=pdf")
            assert response.status_code == 422

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
    async def test_scoped_as_of_risk_export_excludes_replayed_foreign_department(
        self,
        client_employee: AsyncClient,
        db_session: AsyncSession,
        test_department: Department,
        second_department: Department,
        test_user_employee: User,
    ):
        risk = Risk(
            risk_id_code="ASOF-SCOPE-R-001",
            name="Historical Finance Risk",
            process="Ops",
            description="Currently scoped, historically foreign",
            category="Operational",
            department_id=test_department.id,
            owner_id=None,
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
                actor_id=test_user_employee.id,
                actor_name=test_user_employee.name,
                department_id=test_department.id,
                changes={"department_id": {"old": second_department.id, "new": test_department.id}},
                description="Moved risk into employee department",
                created_at=datetime.now(UTC),
            )
        )
        await db_session.commit()

        as_of = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
        response = await client_employee.get(f"/api/v1/reports/risks/export?format=csv&as_of_date={as_of}")
        assert response.status_code == 200
        assert "Historical Finance Risk" not in response.content.decode("utf-8")

    @pytest.mark.asyncio
    async def test_risk_export_department_filter_excludes_cross_dept_owner_exception(
        self,
        client_employee: AsyncClient,
        db_session: AsyncSession,
        test_department: Department,
        second_department: Department,
        test_user_employee: User,
    ):
        risk = Risk(
            risk_id_code="DEPT-FILTER-R-001",
            name="Cross Dept Owned Risk",
            process="Finance",
            description="Owned but outside requested department",
            category="Operational",
            department_id=second_department.id,
            owner_id=test_user_employee.id,
            risk_type="operational",
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="active",
        )
        db_session.add(risk)
        await db_session.commit()

        response = await client_employee.get(
            f"/api/v1/reports/risks/export?format=csv&department_id={test_department.id}"
        )
        assert response.status_code == 200
        assert "Cross Dept Owned Risk" not in response.content.decode("utf-8")

    @pytest.mark.asyncio
    async def test_control_export_department_filter_excludes_cross_dept_owner_exception(
        self,
        client_employee: AsyncClient,
        db_session: AsyncSession,
        test_department: Department,
        second_department: Department,
        test_user_employee: User,
    ):
        control = Control(
            name="Cross Dept Owned Control",
            description="Owned but outside requested department",
            department_id=second_department.id,
            control_owner_id=test_user_employee.id,
            status="active",
        )
        db_session.add(control)
        await db_session.commit()

        response = await client_employee.get(
            f"/api/v1/reports/controls/export?format=csv&department_id={test_department.id}"
        )
        assert response.status_code == 200
        assert "Cross Dept Owned Control" not in response.content.decode("utf-8")

    @pytest.mark.asyncio
    async def test_kri_export_department_filter_excludes_cross_dept_reporting_exception(
        self,
        client_employee: AsyncClient,
        db_session: AsyncSession,
        test_department: Department,
        second_department: Department,
        test_user_employee: User,
    ):
        risk = Risk(
            risk_id_code="DEPT-FILTER-KRI-R-001",
            name="Cross Dept KRI Risk",
            process="Finance",
            description="Risk for cross-department KRI",
            category="Operational",
            department_id=second_department.id,
            owner_id=None,
            risk_type="operational",
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="active",
        )
        db_session.add(risk)
        await db_session.flush()
        kri = KeyRiskIndicator(
            risk_id=risk.id,
            metric_name="Cross Dept Reporting KRI",
            description="Reporting owner outside requested department",
            unit="%",
            current_value=12.0,
            lower_limit=1.0,
            upper_limit=20.0,
            reporting_owner_id=test_user_employee.id,
            is_archived=False,
        )
        db_session.add(kri)
        await db_session.commit()

        response = await client_employee.get(
            f"/api/v1/reports/kris/export?format=csv&department_id={test_department.id}"
        )
        assert response.status_code == 200
        assert "Cross Dept Reporting KRI" not in response.content.decode("utf-8")

    @pytest.mark.asyncio
    async def test_unfiltered_exports_preserve_cross_dept_ownership_exceptions(
        self,
        client_employee: AsyncClient,
        db_session: AsyncSession,
        second_department: Department,
        test_user_employee: User,
    ):
        risk = Risk(
            risk_id_code="UNFILTERED-R-001",
            name="Unfiltered Cross Dept Owned Risk",
            process="Finance",
            description="Visible through direct ownership",
            category="Operational",
            department_id=second_department.id,
            owner_id=test_user_employee.id,
            risk_type="operational",
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="active",
        )
        control = Control(
            name="Unfiltered Cross Dept Owned Control",
            description="Visible through control ownership",
            department_id=second_department.id,
            control_owner_id=test_user_employee.id,
            status="active",
        )
        kri_risk = Risk(
            risk_id_code="UNFILTERED-KRI-R-001",
            name="Unfiltered Cross Dept KRI Risk",
            process="Finance",
            description="Risk for reporting-owner KRI",
            category="Operational",
            department_id=second_department.id,
            owner_id=None,
            risk_type="operational",
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="active",
        )
        db_session.add_all([risk, control, kri_risk])
        await db_session.flush()
        kri = KeyRiskIndicator(
            risk_id=kri_risk.id,
            metric_name="Unfiltered Cross Dept Reporting KRI",
            description="Visible through reporting ownership",
            unit="%",
            current_value=12.0,
            lower_limit=1.0,
            upper_limit=20.0,
            reporting_owner_id=test_user_employee.id,
            is_archived=False,
        )
        parent_owner_risk = Risk(
            risk_id_code="UNFILTERED-KRI-R-OWNER-001",
            name="Unfiltered Cross Dept Parent Owner KRI Risk",
            process="Finance",
            description="Risk owner should see child KRI export row",
            category="Operational",
            department_id=second_department.id,
            owner_id=test_user_employee.id,
            risk_type="operational",
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="active",
        )
        linked_control_risk = Risk(
            risk_id_code="UNFILTERED-KRI-R-CONTROL-001",
            name="Unfiltered Cross Dept Linked Control KRI Risk",
            process="Finance",
            description="Linked control owner should see child KRI export row",
            category="Operational",
            department_id=second_department.id,
            owner_id=None,
            risk_type="operational",
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="active",
        )
        linked_control = Control(
            name="Unfiltered Cross Dept Linked Control",
            description="Control owner grants linked risk visibility",
            department_id=second_department.id,
            control_owner_id=test_user_employee.id,
            status="active",
        )
        vendor = Vendor(
            name="Unfiltered Cross Dept Owned Vendor",
            process="IT",
            department_id=second_department.id,
            outsourcing_owner_user_id=test_user_employee.id,
            vendor_type="ict",
            status="active",
        )
        db_session.add_all([kri, parent_owner_risk, linked_control_risk, linked_control, vendor])
        await db_session.flush()
        db_session.add_all(
            [
                KeyRiskIndicator(
                    risk_id=parent_owner_risk.id,
                    metric_name="Unfiltered Cross Dept Parent Owner KRI",
                    description="Visible through parent risk ownership",
                    unit="%",
                    current_value=12.0,
                    lower_limit=1.0,
                    upper_limit=20.0,
                    reporting_owner_id=None,
                    is_archived=False,
                ),
                ControlRiskLink(risk_id=linked_control_risk.id, control_id=linked_control.id),
                KeyRiskIndicator(
                    risk_id=linked_control_risk.id,
                    metric_name="Unfiltered Cross Dept Linked Control KRI",
                    description="Visible through linked control ownership",
                    unit="%",
                    current_value=12.0,
                    lower_limit=1.0,
                    upper_limit=20.0,
                    reporting_owner_id=None,
                    is_archived=False,
                ),
            ]
        )
        await db_session.commit()

        risk_response = await client_employee.get("/api/v1/reports/risks/export?format=csv")
        control_response = await client_employee.get("/api/v1/reports/controls/export?format=csv")
        kri_response = await client_employee.get("/api/v1/reports/kris/export?format=csv")
        vendor_response = await client_employee.get("/api/v1/reports/vendors/export?format=csv")

        assert risk_response.status_code == 200
        assert control_response.status_code == 200
        assert kri_response.status_code == 200
        assert vendor_response.status_code == 200
        assert "Unfiltered Cross Dept Owned Risk" in risk_response.content.decode("utf-8")
        assert "Unfiltered Cross Dept Owned Control" in control_response.content.decode("utf-8")
        kri_payload = kri_response.content.decode("utf-8")
        assert "Unfiltered Cross Dept Reporting KRI" in kri_payload
        assert "Unfiltered Cross Dept Parent Owner KRI" in kri_payload
        assert "Unfiltered Cross Dept Linked Control KRI" in kri_payload
        assert "Unfiltered Cross Dept Owned Vendor" in vendor_response.content.decode("utf-8")

    @pytest.mark.asyncio
    async def test_summary_and_audit_exports_include_visible_cross_dept_rows(
        self,
        client_employee: AsyncClient,
        db_session: AsyncSession,
        second_department: Department,
        test_user_employee: User,
    ):
        before_response = await client_employee.get("/api/v1/reports/summary/export?format=csv")
        assert before_response.status_code == 200
        before_rows = list(csv.DictReader(StringIO(before_response.content.decode("utf-8"))))
        before_summary = {row["Metric"]: row["Value"] for row in before_rows}

        risk = Risk(
            risk_id_code="SUMMARY-VISIBLE-R-001",
            name="Summary Visible Cross Dept Risk",
            process="Finance",
            description="Visible through direct ownership",
            category="Operational",
            department_id=second_department.id,
            owner_id=test_user_employee.id,
            risk_type="operational",
            gross_probability=4,
            gross_impact=4,
            net_probability=4,
            net_impact=4,
            status="active",
        )
        control = Control(
            name="Summary Visible Cross Dept Control",
            description="Visible through control ownership",
            department_id=second_department.id,
            control_owner_id=test_user_employee.id,
            status="active",
        )
        db_session.add_all([risk, control])
        await db_session.flush()
        db_session.add(
            ControlExecution(
                control_id=control.id,
                executed_by_id=test_user_employee.id,
                result="passed",
                executed_at=datetime.now(UTC),
            )
        )
        await db_session.commit()

        summary_response = await client_employee.get("/api/v1/reports/summary/export?format=csv")
        audit_response = await client_employee.get("/api/v1/reports/audit-trail/export?format=csv")

        assert summary_response.status_code == 200
        summary_rows = list(csv.DictReader(StringIO(summary_response.content.decode("utf-8"))))
        summary = {row["Metric"]: row["Value"] for row in summary_rows}
        assert int(summary["Total Risks"]) == int(before_summary["Total Risks"]) + 1
        assert int(summary["Total Controls"]) == int(before_summary["Total Controls"]) + 1
        assert audit_response.status_code == 200
        assert "Summary Visible Cross Dept Control" in audit_response.content.decode("utf-8")

    @pytest.mark.asyncio
    async def test_audit_export_linked_risks_use_set_based_visibility(
        self,
        client_employee: AsyncClient,
        db_session: AsyncSession,
        test_department: Department,
        second_department: Department,
        test_user_employee: User,
        monkeypatch: pytest.MonkeyPatch,
    ):
        async def fail_scalar_risk_visibility(*args, **kwargs) -> bool:
            raise AssertionError("audit export linked-risk serialization must use set-based visibility")

        monkeypatch.setattr(
            audit_trail_export_module,
            "can_read_risk_id",
            fail_scalar_risk_visibility,
            raising=False,
        )

        visible_risk = Risk(
            risk_id_code="AUDIT-VISIBLE-RISK-001",
            name="Audit Visible Risk",
            process="Operations",
            description="Visible linked audit risk",
            category="Operational",
            department_id=test_department.id,
            owner_id=None,
            risk_type="operational",
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="active",
        )
        hidden_risk = Risk(
            risk_id_code="AUDIT-HIDDEN-RISK-001",
            name="Audit Hidden Risk",
            process="Finance",
            description="Hidden linked audit risk",
            category="Operational",
            department_id=second_department.id,
            owner_id=None,
            risk_type="operational",
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="active",
        )
        control = Control(
            name="Audit Linked Risk Control",
            description="Visible control with mixed linked risks",
            department_id=test_department.id,
            control_owner_id=None,
            status="active",
        )
        db_session.add_all([visible_risk, hidden_risk, control])
        await db_session.flush()
        db_session.add_all(
            [
                ControlRiskLink(risk_id=visible_risk.id, control_id=control.id),
                ControlRiskLink(risk_id=hidden_risk.id, control_id=control.id),
                ControlExecution(
                    control_id=control.id,
                    executed_by_id=test_user_employee.id,
                    result="passed",
                    executed_at=datetime.now(UTC),
                ),
            ]
        )
        await db_session.commit()

        response = await client_employee.get("/api/v1/reports/audit-trail/export?format=csv")

        assert response.status_code == 200
        payload = response.content.decode("utf-8")
        assert "Audit Visible Risk" in payload
        assert "Audit Hidden Risk" not in payload

    @pytest.mark.asyncio
    async def test_kri_as_of_export_uses_id_tiebreaker_for_latest_history(
        self,
        auth_client: AsyncClient,
        db_session: AsyncSession,
        test_risk: Risk,
    ):
        period_end = date(2026, 3, 31)
        recorded_at = datetime(2026, 4, 2, 12, 0, tzinfo=UTC)
        kri = KeyRiskIndicator(
            risk_id=test_risk.id,
            metric_name="Tie Breaker Export KRI",
            description="Export should choose newest inserted same-timestamp history row",
            unit="%",
            current_value=10.0,
            lower_limit=0.0,
            upper_limit=100.0,
            frequency="quarterly",
            is_archived=False,
        )
        db_session.add(kri)
        await db_session.flush()
        db_session.add_all(
            [
                KRIValueHistory(
                    kri_id=kri.id,
                    value=11.0,
                    lower_limit=0.0,
                    upper_limit=100.0,
                    unit="%",
                    breach_status="within",
                    period_start=date(2026, 1, 1),
                    period_end=period_end,
                    recorded_at=recorded_at,
                ),
                KRIValueHistory(
                    kri_id=kri.id,
                    value=22.0,
                    lower_limit=0.0,
                    upper_limit=100.0,
                    unit="%",
                    breach_status="within",
                    period_start=date(2026, 1, 1),
                    period_end=period_end,
                    recorded_at=recorded_at,
                ),
            ]
        )
        await db_session.commit()

        response = await auth_client.get("/api/v1/reports/kris/export?format=csv&as_of_date=2026-04-03")

        assert response.status_code == 200
        rows = list(csv.DictReader(StringIO(response.content.decode("utf-8"))))
        row = next(item for item in rows if item["Metric"] == "Tie Breaker Export KRI")
        assert row["Current Value"] == "22.0"

    @pytest.mark.asyncio
    async def test_global_as_of_risk_export_filters_on_replayed_department(
        self,
        auth_client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
    ):
        old_department = Department(name="AsOf Filter Old", code="ASOF_FILTER_OLD", description="Old dept")
        new_department = Department(name="AsOf Filter New", code="ASOF_FILTER_NEW", description="New dept")
        db_session.add_all([old_department, new_department])
        await db_session.flush()
        risk = Risk(
            risk_id_code="ASOF-FILTER-R-001",
            name="AsOf Department Filter Risk",
            process="Claims",
            description="Replayed department filter check",
            category="Operational",
            department_id=new_department.id,
            owner_id=test_user.id,
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
                changes={"department_id": {"old": old_department.id, "new": new_department.id}},
                description="Moved risk after snapshot date",
                created_at=datetime.now(UTC),
            )
        )
        await db_session.commit()

        as_of = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
        new_dept_response = await auth_client.get(
            f"/api/v1/reports/risks/export?format=csv&department_id={new_department.id}&as_of_date={as_of}"
        )
        old_dept_response = await auth_client.get(
            f"/api/v1/reports/risks/export?format=csv&department_id={old_department.id}&as_of_date={as_of}"
        )

        assert new_dept_response.status_code == 200
        assert old_dept_response.status_code == 200
        assert "AsOf Department Filter Risk" not in new_dept_response.content.decode("utf-8")
        assert "AsOf Department Filter Risk" in old_dept_response.content.decode("utf-8")

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

        kri_resp = await auth_client.get("/api/v1/reports/kris/export?format=csv")
        vendor_resp = await auth_client.get("/api/v1/reports/vendors/export?format=csv")
        assert kri_resp.status_code == 200
        assert vendor_resp.status_code == 200

        kri_excel_removed = await auth_client.get("/api/v1/reports/kris/export?format=xlsx")
        vendor_excel_removed = await auth_client.get("/api/v1/reports/vendors/export?format=xlsx")
        assert kri_excel_removed.status_code == 410
        assert vendor_excel_removed.status_code == 410

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
        response = await auth_client.get(f"/api/v1/reports/kris/export?format=csv&as_of_date={as_of}&status=archived")
        assert response.status_code == 200

        csv_payload = response.content.decode("utf-8")
        rows = list(csv.DictReader(StringIO(csv_payload)))
        kri_row = next((row for row in rows if row.get("Metric") == "As-Of KRI Replay"), None)

        assert kri_row is not None
        assert kri_row["Status"] == "archived"
        assert kri_row["Reporting Owner"] == old_owner.name
        assert kri_row["Reporting Owner"] != new_owner.name
