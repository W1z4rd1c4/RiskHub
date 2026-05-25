from __future__ import annotations

import inspect
from datetime import UTC, date, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency
from app.models.risk import Risk
from app.services._kri_history import clock, queries


async def _create_period_query_kri(
    db: AsyncSession,
    *,
    risk: Risk,
    reporting_owner: User,
    metric_name: str,
) -> KeyRiskIndicator:
    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name=metric_name,
        description=f"{metric_name} description",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        reporting_owner_id=reporting_owner.id,
        last_period_end=None,
        created_at=datetime(2025, 1, 1, tzinfo=UTC),
    )
    db.add(kri)
    await db.commit()
    await db.refresh(kri)
    return kri


@pytest.mark.asyncio
async def test_overdue_kri_period_row_preserves_shape(
    monkeypatch: pytest.MonkeyPatch,
    db_session: AsyncSession,
    test_risk: Risk,
    test_user_cro: User,
) -> None:
    monkeypatch.setattr(clock, "today", lambda: date(2025, 2, 20))
    kri = await _create_period_query_kri(
        db_session,
        risk=test_risk,
        reporting_owner=test_user_cro,
        metric_name="W7.4c Overdue KRI",
    )

    rows = await queries.get_overdue_kris(db_session)
    row = next(item for item in rows if item["kri_id"] == kri.id)

    assert row == {
        "kri_id": kri.id,
        "metric_name": "W7.4c Overdue KRI",
        "frequency": KRIFrequency.monthly.value,
        "period_end": "2025-01-31",
        "due_date": "2025-02-15",
        "days_overdue": 5,
        "reporting_owner_id": test_user_cro.id,
        "reporting_owner_name": test_user_cro.name,
        "risk_id": test_risk.id,
        "department_id": test_risk.department_id,
    }


@pytest.mark.asyncio
async def test_due_soon_kri_period_row_preserves_shape(
    monkeypatch: pytest.MonkeyPatch,
    db_session: AsyncSession,
    test_risk: Risk,
    test_user_cro: User,
) -> None:
    monkeypatch.setattr(clock, "today", lambda: date(2025, 1, 28))
    kri = await _create_period_query_kri(
        db_session,
        risk=test_risk,
        reporting_owner=test_user_cro,
        metric_name="W7.4c Due Soon KRI",
    )

    rows = await queries.get_due_soon_kris(db_session)
    row = next(item for item in rows if item["kri_id"] == kri.id)

    assert row == {
        "kri_id": kri.id,
        "metric_name": "W7.4c Due Soon KRI",
        "frequency": KRIFrequency.monthly.value,
        "period_end": "2025-01-31",
        "due_date": "2025-02-15",
        "days_until_due": 3,
        "reporting_owner_id": test_user_cro.id,
        "reporting_owner_name": test_user_cro.name,
        "risk_id": test_risk.id,
        "department_id": test_risk.department_id,
    }


def test_kri_period_due_rows_share_builder() -> None:
    source = inspect.getsource(queries)

    assert hasattr(queries, "_build_kri_period_due_row")
    assert source.count("_build_kri_period_due_row(") == 3
