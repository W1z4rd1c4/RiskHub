from __future__ import annotations

import csv
from datetime import UTC, datetime
from io import StringIO

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, KeyRiskIndicator, Risk, User


def _parse_csv(response_text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(StringIO(response_text)))


@pytest.mark.asyncio
async def test_export_kris_csv_contract(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    risk = Risk(
        risk_id_code="R-KRI-CONTRACT",
        name="KRI Linked Risk",
        process="Operations",
        description="Linked risk for KRI export",
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
    db_session.add(risk)
    await db_session.flush()
    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Contract Export KRI",
        description="KRI export contract",
        current_value=42.0,
        lower_limit=10.0,
        upper_limit=90.0,
        unit="%",
        frequency="monthly",
        reporting_owner_id=test_user.id,
        is_archived=False,
    )
    db_session.add(kri)
    await db_session.commit()

    as_of = datetime.now(UTC).date().isoformat()
    response = await auth_client.get(f"/api/v1/reports/kris/export?format=csv&as_of_date={as_of}")

    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    row = next(row for row in _parse_csv(response.text) if row["Metric"] == "Contract Export KRI")
    assert row["Risk"] == "KRI Linked Risk"
    assert row["Risk ID"] == "R-KRI-CONTRACT"
    assert row["Department"] == test_department.name
    assert row["Current Value"] == "42.0"
    assert row["Lower Limit"] == "10.0"
    assert row["Upper Limit"] == "90.0"
    assert row["Unit"] == "%"
    assert row["Breach"] == "within"
    assert row["Frequency"] == "monthly"
    assert row["Status"] == "active"
    assert row["Reporting Owner"] == test_user.name
