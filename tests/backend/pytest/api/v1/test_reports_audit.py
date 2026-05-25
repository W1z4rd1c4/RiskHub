"""
Tests for audit trail report endpoints.
"""

import csv
from datetime import UTC, date, datetime, timedelta
from io import StringIO

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import visitors
from sqlalchemy.sql.elements import BindParameter

from app.api.v1.endpoints.reports._export_context import ReportExportContext
from app.models import Department
from app.models.control import Control
from app.models.control_execution import ControlExecution
from app.models.risk import ControlRiskLink, Risk
from app.services._reporting.excel import _audit_trail_query


@pytest_asyncio.fixture
async def audit_trail_test_data(db_session: AsyncSession, test_user, test_department):
    """Create test data for audit trail report endpoints."""
    # Create a control
    control = Control(
        name="Test Control for Audit",
        description="A test control for audit trail verification",
        status="active",
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        department_id=test_department.id,
    )
    db_session.add(control)
    await db_session.flush()

    # Create a risk and link it
    risk = Risk(
        name="Audit Test Risk",
        description="Test Risk for Audit",
        risk_id_code="R-AUDIT-001",
        department_id=test_department.id,
        owner_id=test_user.id,
        process="Audit Test Process",
        category="Operational",
        risk_type="operational",
        status="active",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk)
    await db_session.flush()

    link = ControlRiskLink(control_id=control.id, risk_id=risk.id)
    db_session.add(link)
    await db_session.flush()

    # Create control executions with different results
    exe_passed = ControlExecution(
        control_id=control.id,
        executed_by_id=test_user.id,
        result="passed",
        findings="All checks passed successfully",
        evidence_reference="/documents/evidence/placeholder-pdf-036.pdf",
        executed_at=datetime.now(UTC),
        next_scheduled=datetime.now(UTC) + timedelta(days=30),
    )
    exe_failed = ControlExecution(
        control_id=control.id,
        executed_by_id=test_user.id,
        result="failed",
        findings="Critical issue found in the control",
        executed_at=datetime.now(UTC) - timedelta(days=7),
    )

    db_session.add_all([exe_passed, exe_failed])
    await db_session.commit()

    return {"control": control, "risk": risk, "exe_passed": exe_passed, "exe_failed": exe_failed}


@pytest.mark.asyncio
async def test_download_audit_trail_csv(
    auth_client: AsyncClient,
    audit_trail_test_data: dict,
):
    """Test GET /reports/audit-trail/export returns CSV."""
    response = await auth_client.get("/api/v1/reports/audit-trail/export?format=csv")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    payload = response.content.decode("utf-8")
    assert "Control Name" in payload


@pytest.mark.asyncio
async def test_audit_trail_filter_by_result(
    auth_client: AsyncClient,
    audit_trail_test_data: dict,
):
    """Test that result filter returns 200."""
    response_passed = await auth_client.get("/api/v1/reports/audit-trail/export?format=csv&result=passed")
    assert response_passed.status_code == 200
    assert "text/csv" in response_passed.headers["content-type"]


@pytest.mark.asyncio
async def test_audit_trail_export_accepts_naive_datetime_query_strings(
    auth_client: AsyncClient,
    audit_trail_test_data: dict,
):
    from_date = (datetime.now(UTC) - timedelta(days=1)).replace(tzinfo=None).isoformat(timespec="seconds")
    to_date = (datetime.now(UTC) + timedelta(days=1)).replace(tzinfo=None).isoformat(timespec="seconds")

    response = await auth_client.get(
        f"/api/v1/reports/audit-trail/export?format=csv&from_date={from_date}&to_date={to_date}"
    )

    assert response.status_code == 200
    payload = response.content.decode("utf-8")
    assert "All checks passed successfully" in payload
    assert "Critical issue found in the control" not in payload


def test_audit_trail_query_coerces_naive_datetime_filters_to_utc(test_user):
    context = ReportExportContext(
        current_user=test_user,
        department_id=None,
        department_ids=None,
        export_date=date(2026, 5, 1),
    )

    query = _audit_trail_query(
        context,
        result_filter=None,
        control_id=None,
        from_date=datetime(2026, 5, 1, 9, 0),
        to_date=datetime(2026, 5, 1, 17, 0),
    )

    datetime_bind_values: list[datetime] = []

    def collect_datetime_bind(bind: BindParameter) -> None:
        if isinstance(bind.value, datetime):
            datetime_bind_values.append(bind.value)

    visitors.traverse(query, {}, {"bindparam": collect_datetime_bind})

    assert datetime_bind_values == [
        datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
        datetime(2026, 5, 1, 17, 0, tzinfo=UTC),
    ]


@pytest.mark.asyncio
async def test_audit_trail_department_scoping(
    auth_client: AsyncClient,
    audit_trail_test_data: dict,
    test_department,
):
    """Test that department_id filter works."""
    response = await auth_client.get(
        f"/api/v1/reports/audit-trail/export?format=csv&department_id={test_department.id}"
    )
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]


@pytest.mark.asyncio
async def test_audit_trail_linked_risks_prefers_risk_name(
    auth_client: AsyncClient,
    audit_trail_test_data: dict,
):
    response = await auth_client.get("/api/v1/reports/audit-trail/export?format=csv")
    assert response.status_code == 200

    rows = list(csv.DictReader(StringIO(response.content.decode("utf-8"))))
    assert rows
    linked_risks_value = rows[0].get("Linked Risks", "")

    assert "Audit Test Risk" in linked_risks_value
    assert "Audit Test Process" not in linked_risks_value


@pytest.mark.asyncio
async def test_scoped_audit_trail_filters_linked_risks_by_visibility(
    client_employee: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user,
    test_user_employee,
):
    other_department = Department(name="Audit Hidden Department", code="AHID", description="Hidden")
    db_session.add(other_department)
    await db_session.flush()

    control = Control(
        name="Scoped Audit Control",
        description="Visible execution control",
        status="active",
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        department_id=test_department.id,
    )
    visible_risk = Risk(
        name="Visible Audit Linked Risk",
        description="Visible linked risk",
        risk_id_code="R-AUD-VIS",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        process="Visible",
        category="Operational",
        risk_type="operational",
        status="active",
        gross_probability=2,
        gross_impact=2,
        net_probability=1,
        net_impact=1,
    )
    hidden_risk = Risk(
        name="Hidden Audit Linked Risk",
        description="Hidden linked risk",
        risk_id_code="R-AUD-HID",
        department_id=other_department.id,
        owner_id=test_user.id,
        process="Hidden",
        category="Operational",
        risk_type="operational",
        status="active",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    db_session.add_all([control, visible_risk, hidden_risk])
    await db_session.flush()

    db_session.add_all(
        [
            ControlRiskLink(control_id=control.id, risk_id=visible_risk.id),
            ControlRiskLink(control_id=control.id, risk_id=hidden_risk.id),
            ControlExecution(
                control_id=control.id,
                executed_by_id=test_user_employee.id,
                result="passed",
                findings="Scoped audit result",
                executed_at=datetime.now(UTC),
            ),
        ]
    )
    await db_session.commit()

    response = await client_employee.get("/api/v1/reports/audit-trail/export?format=csv")
    assert response.status_code == 200

    rows = list(csv.DictReader(StringIO(response.content.decode("utf-8"))))
    scoped_row = next(row for row in rows if row["Control Name"] == "Scoped Audit Control")
    linked_risks = scoped_row["Linked Risks"]
    assert "Visible Audit Linked Risk" in linked_risks
    assert "Hidden Audit Linked Risk" not in linked_risks
    assert "R-AUD-HID" not in linked_risks


@pytest.mark.asyncio
async def test_audit_trail_xlsx_export_returns_gone(
    auth_client: AsyncClient,
    audit_trail_test_data: dict,
):
    response = await auth_client.get("/api/v1/reports/audit-trail/export?format=xlsx")
    assert response.status_code == 410
    detail = response.json()["detail"]
    assert detail["code"] == "excel_export_removed"


@pytest.mark.asyncio
async def test_audit_trail_pdf_endpoint_removed(
    auth_client: AsyncClient,
    audit_trail_test_data: dict,
):
    response = await auth_client.get("/api/v1/reports/audit-trail/pdf")
    assert response.status_code == 404
