import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.global_config import GlobalConfig


@pytest.mark.asyncio
async def test_public_config_allowlisted_key(
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    db_session: AsyncSession,
):
    """Test that allowlisted keys are accessible to any authenticated user."""
    # First, ensure the config exists (create if not)
    existing = await db_session.execute(
        select(GlobalConfig).where(GlobalConfig.key == "kri_reminder_days_before")
    )
    config = existing.scalar_one_or_none()
    
    if not config:
        config = GlobalConfig(
            key="kri_reminder_days_before",
            value="3",
            value_type="int",
            category="kri",
            display_name="KRI Reminder Days Before",
            is_editable=True
        )
        db_session.add(config)
        await db_session.commit()
    
    # Employee should be able to read allowlisted key
    response = await client_employee.get("/api/v1/riskhub/public-config/kri_reminder_days_before")
    assert response.status_code == 200
    assert response.json()["key"] == "kri_reminder_days_before"


@pytest.mark.asyncio
async def test_public_config_non_allowlisted_key_blocked(
    client_employee: AsyncClient,
    db_session: AsyncSession,
):
    """Test that non-allowlisted keys are blocked for non-CRO users."""
    # Create a non-allowlisted config key
    existing = await db_session.execute(
        select(GlobalConfig).where(GlobalConfig.key == "internal_secret_key")
    )
    config = existing.scalar_one_or_none()
    
    if not config:
        config = GlobalConfig(
            key="internal_secret_key",
            value="secret_value",
            value_type="string",
            category="system",
            display_name="Internal Secret",
            is_editable=False
        )
        db_session.add(config)
        await db_session.commit()
    
    # Employee should NOT be able to read non-allowlisted key
    response = await client_employee.get("/api/v1/riskhub/public-config/internal_secret_key")
    assert response.status_code == 403
    assert "not publicly accessible" in response.json()["detail"]


@pytest.mark.asyncio
async def test_public_config_cro_can_access_any_key(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Test that CRO users can access any config key."""
    # Create a non-allowlisted config key
    existing = await db_session.execute(
        select(GlobalConfig).where(GlobalConfig.key == "cro_secret_key")
    )
    config = existing.scalar_one_or_none()
    
    if not config:
        config = GlobalConfig(
            key="cro_secret_key",
            value="cro_secret_value",
            value_type="string",
            category="system",
            display_name="CRO Secret",
            is_editable=False
        )
        db_session.add(config)
        await db_session.commit()
    
    # CRO should be able to read any key
    response = await client_cro.get("/api/v1/riskhub/public-config/cro_secret_key")
    assert response.status_code == 200
    assert response.json()["key"] == "cro_secret_key"


@pytest.mark.asyncio
async def test_public_config_nonexistent_key(
    client_cro: AsyncClient,
):
    """Test that nonexistent keys return 404."""
    response = await client_cro.get("/api/v1/riskhub/public-config/nonexistent_key_12345")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]
