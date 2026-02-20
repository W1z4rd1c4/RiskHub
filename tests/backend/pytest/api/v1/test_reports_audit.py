"""
Tests for audit trail report endpoints.
"""

import csv
from datetime import UTC, datetime, timedelta
from io import StringIO

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.control import Control
from app.models.control_execution import ControlExecution
from app.models.risk import ControlRiskLink, Risk


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
async def test_audit_trail_legacy_excel_endpoint_returns_gone(
    auth_client: AsyncClient,
    audit_trail_test_data: dict,
):
    response = await auth_client.get("/api/v1/reports/audit-trail/excel")
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
