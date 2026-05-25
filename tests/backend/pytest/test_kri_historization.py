import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KeyRiskIndicator, OutboxEvent, Risk, User
from app.models.notification import NotificationType


@pytest_asyncio.fixture
async def test_kri(db_session: AsyncSession, test_risk: Risk, test_user: User) -> KeyRiskIndicator:
    """Create a test KRI."""
    kri = KeyRiskIndicator(
        metric_name="Test Metric",
        description="Test KRI metric for historization testing",
        risk_id=test_risk.id,
        current_value=50,
        lower_limit=10,
        upper_limit=90,
        frequency="monthly",
        reporting_owner_id=test_user.id,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    return kri


@pytest.mark.asyncio
async def test_kri_value_recording_breach(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    test_kri: KeyRiskIndicator,
):
    """Test recording a KRI value that triggers a breach outbox event."""
    # Ensure test user is the responsible person
    test_kri.reporting_owner_id = test_user.id
    db_session.add(test_kri)
    await db_session.commit()

    # Record a breaching value (too high)
    breach_value = 95
    payload = {"value": breach_value, "recorded_at": "2025-01-01T12:00:00Z", "period_end": "2024-12-31"}

    headers = {"X-Mock-User-Id": str(test_user.id)}

    response = await client.post(f"/api/v1/kris/{test_kri.id}/values", headers=headers, json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["current_value"] == breach_value

    # Verify breach delivery is queued for the outbox worker.
    result = await db_session.execute(
        select(OutboxEvent).where(
            OutboxEvent.aggregate_type == "kri",
            OutboxEvent.aggregate_id == test_kri.id,
            OutboxEvent.event_type == "kri.breach_detected",
        )
    )
    outbox_events = result.scalars().all()
    assert len(outbox_events) > 0
    assert outbox_events[0].payload["recipient_user_id"] == test_user.id
    assert "breached limits" in outbox_events[0].payload["message"]


@pytest.mark.asyncio
async def test_kri_value_recording_no_breach(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    test_kri: KeyRiskIndicator,
):
    """Test recording a KRI value within limits (no notification)."""
    # Record a normal value
    normal_value = 75
    payload = {"value": normal_value, "recorded_at": "2025-01-01T12:00:00Z", "period_end": "2024-12-31"}

    headers = {"X-Mock-User-Id": str(test_user.id)}

    response = await client.post(f"/api/v1/kris/{test_kri.id}/values", headers=headers, json=payload)

    assert response.status_code == 200

    # Verify NO notification created
    from app.models.notification import Notification

    result = await db_session.execute(
        select(Notification).where(
            Notification.user_id == test_user.id, Notification.type == NotificationType.KRI_BREACH_DETECTED
        )
    )
    notifications = result.scalars().all()
    assert len(notifications) == 0
