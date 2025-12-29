import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import User, Department, Role
from app.models.directory_user import DirectoryUser


@pytest.mark.asyncio
async def test_directory_sync_preview_counts(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee: Role,
):
    """Preview sync should report creates for new directory users."""
    dir_users = [
        DirectoryUser(
            external_id="dir-100",
            email="alice@example.com",
            display_name="Alice Novak",
            department="Finance",
            account_enabled=True,
        ),
        DirectoryUser(
            external_id="dir-101",
            email="bob@example.com",
            display_name="Bob Novak",
            department="IT",
            account_enabled=True,
        ),
    ]
    db_session.add_all(dir_users)
    await db_session.commit()

    response = await auth_client.post("/api/v1/directory/sync/preview")
    assert response.status_code == 200

    data = response.json()
    assert data["created_count"] == 2
    assert data["updated_count"] == 0
    assert data["deactivated_count"] == 0
    assert data["error_count"] == 0
    assert len(data["diffs"]) == 2


@pytest.mark.asyncio
async def test_directory_sync_apply_creates_users_and_manager(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee: Role,
):
    """Apply sync should create users, departments, and manager relationships."""
    manager = DirectoryUser(
        external_id="dir-boss",
        email="boss@example.com",
        display_name="Boss Manager",
        department="Operations",
        account_enabled=True,
    )
    worker = DirectoryUser(
        external_id="dir-worker",
        email="worker@example.com",
        display_name="Worker One",
        department="Operations",
        manager_external_id="dir-boss",
        account_enabled=True,
    )
    db_session.add_all([manager, worker])
    await db_session.commit()

    response = await auth_client.post("/api/v1/directory/sync/apply")
    assert response.status_code == 200

    boss_user = (await db_session.execute(select(User).where(User.email == "boss@example.com"))).scalar_one()
    worker_user = (await db_session.execute(select(User).where(User.email == "worker@example.com"))).scalar_one()

    assert boss_user.role_id == test_role_employee.id
    assert worker_user.role_id == test_role_employee.id
    assert worker_user.manager_id == boss_user.id

    dept = (await db_session.execute(select(Department).where(Department.name == "Operations"))).scalar_one()
    assert worker_user.department_id == dept.id


@pytest.mark.asyncio
async def test_directory_sync_updates_existing_user_preserves_role(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Existing user updates should not overwrite role_id."""
    original_role_id = test_user.role_id

    dir_user = DirectoryUser(
        external_id="dir-admin",
        email=test_user.email,
        display_name="Updated Admin",
        department="Security",
        account_enabled=True,
    )
    db_session.add(dir_user)
    await db_session.commit()

    response = await auth_client.post("/api/v1/directory/sync/apply")
    assert response.status_code == 200

    await db_session.refresh(test_user)
    assert test_user.name == "Updated Admin"
    assert test_user.role_id == original_role_id

    dept = (await db_session.execute(select(Department).where(Department.name == "Security"))).scalar_one()
    assert test_user.department_id == dept.id


@pytest.mark.asyncio
async def test_directory_sync_deactivates_user(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee: Role,
    test_department: Department,
):
    """Directory users with account_enabled=false should deactivate users."""
    user = User(
        name="Disabled User",
        email="disabled@example.com",
        role_id=test_role_employee.id,
        department_id=test_department.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    dir_user = DirectoryUser(
        external_id="dir-disabled",
        email="disabled@example.com",
        display_name="Disabled User",
        department=test_department.name,
        account_enabled=False,
    )
    db_session.add(dir_user)
    await db_session.commit()

    response = await auth_client.post("/api/v1/directory/sync/apply")
    assert response.status_code == 200

    await db_session.refresh(user)
    assert user.is_active is False


# === Webhook Authentication Tests ===

@pytest.mark.asyncio
async def test_webhook_rejects_missing_signature(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
):
    """Webhook should reject requests without signature when secret is configured."""
    # Set webhook secret via environment variable
    monkeypatch.setenv("WEBHOOK_SECRET", "test-secret-key")
    
    # Clear the cached settings to pick up new env var
    from app.core.config import get_settings
    get_settings.cache_clear()
    
    payload = {
        "event_type": "user.created",
        "data": {
            "external_id": "test-user-1",
            "email": "test@example.com",
            "display_name": "Test User",
            "department": "IT",
            "account_enabled": True,
        }
    }
    
    response = await client.post(
        "/api/v1/directory/webhook",
        json=payload,
    )
    
    assert response.status_code == 401
    assert "Missing X-Webhook-Signature" in response.json()["detail"]
    
    # Clear cache to reset for other tests
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_webhook_rejects_invalid_signature(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
):
    """Webhook should reject requests with invalid signature."""
    monkeypatch.setenv("WEBHOOK_SECRET", "test-secret-key")
    
    from app.core.config import get_settings
    get_settings.cache_clear()
    
    payload = {
        "event_type": "user.created",
        "data": {
            "external_id": "test-user-1",
            "email": "test@example.com",
            "display_name": "Test User",
            "department": "IT",
            "account_enabled": True,
        }
    }
    
    response = await client.post(
        "/api/v1/directory/webhook",
        json=payload,
        headers={"X-Webhook-Signature": "sha256=invalid-signature-here"},
    )
    
    assert response.status_code == 401
    assert "Invalid webhook signature" in response.json()["detail"]
    
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_webhook_accepts_valid_signature(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee: Role,
    monkeypatch,
):
    """Webhook should accept requests with valid HMAC-SHA256 signature."""
    import hmac
    import hashlib
    import json
    
    secret = "test-secret-key"
    monkeypatch.setenv("WEBHOOK_SECRET", secret)
    
    from app.core.config import get_settings
    get_settings.cache_clear()
    
    payload = {
        "event_type": "user.created",
        "timestamp": "2025-01-01T00:00:00Z",
        "data": {
            "external_id": "webhook-test-user",
            "email": "webhook-test@example.com",
            "display_name": "Webhook Test User",
            "department": "IT",
            "account_enabled": True,
        }
    }
    
    # Compute valid signature
    payload_bytes = json.dumps(payload).encode()
    signature = "sha256=" + hmac.new(
        secret.encode(),
        payload_bytes,
        hashlib.sha256
    ).hexdigest()
    
    response = await client.post(
        "/api/v1/directory/webhook",
        content=payload_bytes,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
        },
    )
    
    assert response.status_code == 200
    assert response.json()["status"] == "processed"
    
    get_settings.cache_clear()


