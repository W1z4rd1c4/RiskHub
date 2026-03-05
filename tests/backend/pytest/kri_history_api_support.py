"""Shared fixtures for split KRI history API tests."""

from datetime import UTC, date, datetime, timedelta

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency
from app.models.kri_history import KRIValueHistory


@pytest_asyncio.fixture
async def test_kri_for_api(db_session: AsyncSession, test_risk):
    """Create a KRI for API testing."""
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="API Test KRI",
        description="API Test KRI Description",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.quarterly.value,
        created_at=datetime.now(UTC) - timedelta(days=10),
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    return kri


@pytest_asyncio.fixture
async def test_kri_with_history_for_api(db_session: AsyncSession, test_risk, test_user_cro):
    """Create a KRI with existing history for API testing."""
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="KRI With History For API",
        description="KRI With History Description",
        current_value=45.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        created_at=datetime.now(UTC) - timedelta(days=60),
        last_period_end=date.today() - timedelta(days=30),
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    history = KRIValueHistory(
        kri_id=kri.id,
        period_start=date.today() - timedelta(days=60),
        period_end=date.today() - timedelta(days=30),
        recorded_at=datetime.now(UTC) - timedelta(days=25),
        recorded_by_id=test_user_cro.id,
        value=45.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        breach_status="within",
    )
    db_session.add(history)
    await db_session.commit()

    return kri
