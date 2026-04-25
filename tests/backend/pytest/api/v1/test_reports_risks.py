from __future__ import annotations

import csv
from datetime import UTC, datetime
from io import StringIO

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Risk, User


def _parse_csv(response_text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(StringIO(response_text)))


@pytest.mark.asyncio
async def test_export_risks_csv_contract(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    risk = Risk(
        risk_id_code="R-CONTRACT-001",
        name="Contract Export Risk",
        process="Operations",
        description="Risk export contract",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=4,
        gross_impact=5,
        gross_score=20,
        net_probability=2,
        net_impact=3,
        net_score=6,
        status="active",
        is_priority=True,
    )
    db_session.add(risk)
    await db_session.commit()

    as_of = datetime.now(UTC).date().isoformat()
    response = await auth_client.get(f"/api/v1/reports/risks/export?format=csv&as_of_date={as_of}")

    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    row = next(row for row in _parse_csv(response.text) if row["Risk ID"] == "R-CONTRACT-001")
    assert row["Name"] == "Contract Export Risk"
    assert row["Process"] == "Operations"
    assert row["Type"] == "operational"
    assert row["Gross Score"] == "20"
    assert row["Net Score"] == "6"
    assert row["Priority"] == "yes"
    assert row["Owner"] == test_user.name
    assert row["Department"] == test_department.name
