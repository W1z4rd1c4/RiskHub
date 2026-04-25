from __future__ import annotations

import csv
from datetime import UTC, datetime
from io import StringIO

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, ControlRiskLink, Department, Risk, User


def _parse_csv(response_text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(StringIO(response_text)))


@pytest.mark.asyncio
async def test_export_controls_csv_contract(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    risk = Risk(
        risk_id_code="R-CONTROL-CONTRACT",
        name="Control Linked Risk",
        process="Operations",
        description="Linked risk for control export",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    control = Control(
        name="Contract Export Control",
        description="Control export contract",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=4,
        status="active",
    )
    db_session.add_all([risk, control])
    await db_session.flush()
    db_session.add(ControlRiskLink(control_id=control.id, risk_id=risk.id))
    await db_session.commit()

    as_of = datetime.now(UTC).date().isoformat()
    response = await auth_client.get(f"/api/v1/reports/controls/export?format=csv&as_of_date={as_of}")

    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    row = next(row for row in _parse_csv(response.text) if row["Name"] == "Contract Export Control")
    assert row["Description"] == "Control export contract"
    assert row["Department"] == test_department.name
    assert row["Owner"] == test_user.name
    assert row["Frequency"] == "monthly"
    assert row["Form"] == "manual"
    assert row["Risk Level"] == "4"
    assert row["Status"] == "active"
    assert row["Linked Risk"] == "Control Linked Risk"
    assert row["Linked Risk ID"] == "R-CONTROL-CONTRACT"
    assert row["Linked Risks"] == "1"
