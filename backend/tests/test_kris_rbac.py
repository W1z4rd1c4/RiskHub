"""
RBAC tests for KRI endpoints.
Validates that KRI mutations require risks:* permissions.
"""
import pytest
from httpx import AsyncClient

from app.models import Risk, KeyRiskIndicator, Department
from app.models.risk import RiskStatus


@pytest.fixture
async def test_risk_for_kri(db_session, test_department: Department, test_user):
    """Create a risk for KRI testing."""
    risk = Risk(
        risk_id_code="R-KRI-TEST-001",
        name="KRI Test Risk",
        process="KRI Test Process",
        description="Risk for KRI permission testing",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)
    return risk


@pytest.fixture
async def test_kri(db_session, test_risk_for_kri: Risk):
    """Create a KRI for testing."""
    kri = KeyRiskIndicator(
        risk_id=test_risk_for_kri.id,
        metric_name="Test KRI",
        description="Test KRI description",
        unit="%",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    return kri


@pytest.mark.asyncio
async def test_admin_can_create_kri(auth_client: AsyncClient, test_risk_for_kri: Risk):
    """Admin should be able to create KRI."""
    response = await auth_client.post(
        "/api/v1/kris",
        json={
            "risk_id": test_risk_for_kri.id,
            "metric_name": "New KRI",
            "description": "New KRI description",
            "unit": "%",
            "current_value": 50.0,
            "lower_limit": 0.0,
            "upper_limit": 100.0,
        },
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_admin_can_update_kri(auth_client: AsyncClient, test_kri: KeyRiskIndicator):
    """Admin should be able to update KRI."""
    response = await auth_client.put(
        f"/api/v1/kris/{test_kri.id}",
        json={"metric_name": "Updated KRI"},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_admin_can_delete_kri(auth_client: AsyncClient, test_kri: KeyRiskIndicator):
    """Admin should be able to delete KRI."""
    response = await auth_client.delete(
        f"/api/v1/kris/{test_kri.id}?reason=Test%20deletion",
    )
    # Admin gets immediate deletion (204)
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_kri_delete_archives_not_hard_deletes(auth_client: AsyncClient, db_session, test_risk_for_kri):
    """Verify deletion archives KRI (is_archived=True) instead of hard delete."""
    from sqlalchemy import select
    
    # Create own KRI to avoid interference from other tests
    kri = KeyRiskIndicator(
        risk_id=test_risk_for_kri.id,
        metric_name="Archive Test KRI",
        description="KRI for archive verification",
        unit="%",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    kri_id = kri.id
    
    # Delete the KRI
    response = await auth_client.delete(f"/api/v1/kris/{kri_id}?reason=Test%20archive")
    assert response.status_code == 204
    
    # Verify row still exists with is_archived=True
    db_session.expire_all()
    result = await db_session.execute(
        select(KeyRiskIndicator).where(KeyRiskIndicator.id == kri_id)
    )
    kri = result.scalar_one_or_none()
    assert kri is not None, "KRI should still exist after delete (soft-delete)"
    assert kri.is_archived is True
    assert kri.archived_at is not None
    assert kri.archived_by_id is not None


@pytest.mark.asyncio
async def test_kri_history_preserved_after_archive(auth_client: AsyncClient, db_session, test_risk_for_kri):
    """Verify KRIValueHistory entries preserved after KRI archival."""
    from sqlalchemy import select
    from app.models.kri_history import KRIValueHistory
    from datetime import date
    
    # Create KRI with a history entry
    kri = KeyRiskIndicator(
        risk_id=test_risk_for_kri.id,
        metric_name="History Test KRI",
        description="KRI with history for archive test",
        unit="%",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        last_period_end=date(2025, 12, 31),
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    
    # Add history entry (must include lower_limit/upper_limit/unit per model)
    history = KRIValueHistory(
        kri_id=kri.id,
        value=50.0,
        period_start=date(2025, 12, 1),
        period_end=date(2025, 12, 31),
        recorded_by_id=None,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        breach_status="within",
    )
    db_session.add(history)
    await db_session.commit()
    
    kri_id = kri.id
    
    # Archive (delete) the KRI
    response = await auth_client.delete(f"/api/v1/kris/{kri_id}?reason=Archive+test")
    assert response.status_code == 204
    
    # Verify history still exists
    db_session.expire_all()
    result = await db_session.execute(
        select(KRIValueHistory).where(KRIValueHistory.kri_id == kri_id)
    )
    entries = result.scalars().all()
    assert len(entries) == 1, "History entries should be preserved after archive"
    assert entries[0].value == 50.0


@pytest.mark.asyncio
async def test_archived_kri_excluded_from_list(auth_client: AsyncClient, db_session, test_risk_for_kri):
    """Verify archived KRI not returned in default list."""
    from sqlalchemy import select
    
    # Create KRI
    kri = KeyRiskIndicator(
        risk_id=test_risk_for_kri.id,
        metric_name="Archive Exclusion Test KRI",
        description="KRI for archive exclusion test",
        unit="%",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    
    kri_id = kri.id
    
    # Verify it appears in list initially
    response = await auth_client.get("/api/v1/kris")
    assert response.status_code == 200
    items = response.json()["items"]
    kri_ids = [item["id"] for item in items]
    assert kri_id in kri_ids, "KRI should appear in list before archiving"
    
    # Archive the KRI
    response = await auth_client.delete(f"/api/v1/kris/{kri_id}?reason=Archive+test")
    assert response.status_code == 204
    
    # Verify it's excluded from list
    response = await auth_client.get("/api/v1/kris")
    assert response.status_code == 200
    items = response.json()["items"]
    kri_ids = [item["id"] for item in items]
    assert kri_id not in kri_ids, "Archived KRI should be excluded from default list"


# These tests use a client without risks:write/delete permissions
# The client_employee fixture has risks:read but we need to check write/delete denial

@pytest.fixture
async def test_role_no_write(db_session):
    """Create a role with only risks:read (no write/delete)."""
    from app.models import Permission, RolePermission, Role as RoleModel
    
    role = RoleModel(name="readonly", display_name="Read Only", description="Read only role")
    db_session.add(role)
    await db_session.commit()
    
    perm = Permission(resource="risks", action="read", description="Read risks only")
    db_session.add(perm)
    await db_session.commit()
    
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()
    
    return role


@pytest.fixture
async def test_user_readonly(db_session, test_department, test_role_no_write):
    """Create a user with read-only permissions."""
    from app.models import User as UserModel
    
    user = UserModel(
        name="Read Only User",
        email="readonly@test.com",
        department_id=test_department.id,
        role_id=test_role_no_write.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    from app.models import Role, RolePermission
    result = await db_session.execute(
        select(UserModel)
        .options(
            selectinload(UserModel.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(UserModel.department)
        )
        .where(UserModel.id == user.id)
    )
    return result.scalar_one()


@pytest.fixture
async def client_readonly(db_session, test_user_readonly):
    """Client for read-only user."""
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.db.session import get_db
    from app.core.config import get_settings, Settings
    
    def override_settings():
        return Settings(mock_auth_enabled=True, debug=True)
        
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings
    
    transport = ASGITransport(app=app)
    headers = {"X-Mock-User-Id": str(test_user_readonly.id)}
    async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_readonly_cannot_create_kri(client_readonly: AsyncClient, test_risk_for_kri: Risk):
    """User without risks:write should not create KRI."""
    response = await client_readonly.post(
        "/api/v1/kris",
        json={
            "risk_id": test_risk_for_kri.id,
            "metric_name": "Should Fail",
            "description": "Should Fail description",
            "unit": "%",
            "current_value": 50.0,
            "lower_limit": 0.0,
            "upper_limit": 100.0,
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_readonly_cannot_update_kri(client_readonly: AsyncClient, test_kri: KeyRiskIndicator):
    """User without risks:write should not update KRI."""
    response = await client_readonly.put(
        f"/api/v1/kris/{test_kri.id}",
        json={"metric_name": "Should Fail"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_readonly_cannot_delete_kri(client_readonly: AsyncClient, test_kri: KeyRiskIndicator):
    """User without risks:delete should not delete KRI."""
    response = await client_readonly.delete(
        f"/api/v1/kris/{test_kri.id}?reason=Should%20Fail",
    )
    assert response.status_code == 403


# Tests for all-edit approval workflow

@pytest.fixture
async def test_role_with_write(db_session):
    """Create a role with risks:write but NOT a privileged role (not CRO/Risk Manager/Admin)."""
    from app.models import Permission, RolePermission, Role as RoleModel
    from sqlalchemy import select
    
    role = RoleModel(name="dept_head", display_name="Department Head", description="Non-privileged with write")
    db_session.add(role)
    await db_session.commit()
    
    # Add risks:read and risks:write permissions
    for action in ["read", "write"]:
        perm_result = await db_session.execute(
            select(Permission).where(Permission.resource == "risks", Permission.action == action)
        )
        perm = perm_result.scalar_one_or_none()
        if not perm:
            perm = Permission(resource="risks", action=action, description=f"Risks {action}")
            db_session.add(perm)
            await db_session.commit()
        
        db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    
    await db_session.commit()
    return role


@pytest.fixture
async def test_user_dept_head(db_session, test_department, test_role_with_write):
    """Create a department head user (has risks:write but not privileged)."""
    from app.models import User as UserModel
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    from app.models import Role, RolePermission
    
    user = UserModel(
        name="Department Head",
        email="depthead@test.com",
        department_id=test_department.id,
        role_id=test_role_with_write.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    
    result = await db_session.execute(
        select(UserModel)
        .options(
            selectinload(UserModel.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(UserModel.department)
        )
        .where(UserModel.id == user.id)
    )
    return result.scalar_one()


@pytest.fixture
async def client_dept_head(db_session, test_user_dept_head):
    """Client for department head user (has write but not privileged)."""
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.db.session import get_db
    from app.core.config import get_settings, Settings
    
    def override_settings():
        return Settings(mock_auth_enabled=True, debug=True)
        
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings
    
    transport = ASGITransport(app=app)
    headers = {"X-Mock-User-Id": str(test_user_dept_head.id)}
    async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_non_privileged_edit_requires_approval(client_dept_head: AsyncClient, test_kri: KeyRiskIndicator):
    """Non-privileged user editing ANY KRI should receive 202 with approval request."""
    response = await client_dept_head.put(
        f"/api/v1/kris/{test_kri.id}",
        json={"metric_name": "Updated by Dept Head"},
    )
    
    # Should receive 202 Accepted (approval required)
    assert response.status_code == 202
    data = response.json()
    assert "approval_id" in data
    assert data["action_type"] == "edit"
    assert "pending_changes" in data


@pytest.mark.asyncio
async def test_privileged_user_can_edit_directly(auth_client: AsyncClient, test_kri: KeyRiskIndicator):
    """Privileged user (admin/CRO) should be able to edit KRI directly with 200."""
    response = await auth_client.put(
        f"/api/v1/kris/{test_kri.id}",
        json={"metric_name": "Updated by Admin"},
    )
    
    # Admin should get immediate update (200)
    assert response.status_code == 200
    data = response.json()
    assert data["metric_name"] == "Updated by Admin"

