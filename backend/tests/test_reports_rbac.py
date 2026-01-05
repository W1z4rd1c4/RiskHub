"""
RBAC tests for report endpoints.
Tests department scoping and permission enforcement.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, Risk, Department, User, Role, Permission, RolePermission


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
