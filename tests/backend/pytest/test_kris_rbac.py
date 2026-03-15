"""
RBAC tests for KRI endpoints.
Validates that KRI mutations require risks:* permissions.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select

from app.models import ApprovalRequest, Department, KeyRiskIndicator, Risk, Vendor, VendorKRILink, VendorRiskLink
from app.models.risk import RiskStatus


@pytest_asyncio.fixture
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


@pytest_asyncio.fixture
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


@pytest_asyncio.fixture
async def test_vendor_for_kri(db_session, test_department: Department, test_user):
    vendor = Vendor(
        name="KRI Vendor Alpha",
        process="KRI Test Process",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="outsourcing",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=True,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)
    return vendor


@pytest_asyncio.fixture
async def second_test_vendor_for_kri(db_session, test_department: Department, test_user):
    vendor = Vendor(
        name="KRI Vendor Beta",
        process="KRI Test Process",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="outsourcing",
        risk_score_1_5=2,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=True,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)
    return vendor


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
async def test_admin_can_create_kri_with_vendor_links_atomically(
    auth_client: AsyncClient,
    db_session,
    test_risk_for_kri: Risk,
    test_vendor_for_kri: Vendor,
):
    response = await auth_client.post(
        "/api/v1/kris",
        json={
            "risk_id": test_risk_for_kri.id,
            "metric_name": "Atomic Vendor KRI",
            "description": "KRI created with vendor assignment",
            "unit": "%",
            "current_value": 50.0,
            "lower_limit": 0.0,
            "upper_limit": 100.0,
            "linked_vendor_ids": [test_vendor_for_kri.id],
            "ensure_parent_risk_vendor_ids": [test_vendor_for_kri.id],
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert [vendor["id"] for vendor in data["linked_vendors"]] == [test_vendor_for_kri.id]

    kri_id = data["id"]
    kri_link = (
        await db_session.execute(
            select(VendorKRILink).where(
                VendorKRILink.vendor_id == test_vendor_for_kri.id,
                VendorKRILink.kri_id == kri_id,
            )
        )
    ).scalar_one_or_none()
    risk_link = (
        await db_session.execute(
            select(VendorRiskLink).where(
                VendorRiskLink.vendor_id == test_vendor_for_kri.id,
                VendorRiskLink.risk_id == test_risk_for_kri.id,
            )
        )
    ).scalar_one_or_none()

    assert kri_link is not None
    assert risk_link is not None


@pytest.mark.asyncio
async def test_create_kri_with_unauthorized_vendor_assignment_is_rejected_without_persisting(
    client_dept_head: AsyncClient,
    db_session,
    test_risk_for_kri: Risk,
    test_vendor_for_kri: Vendor,
):
    metric_name = "Unauthorized Vendor Assignment"

    response = await client_dept_head.post(
        "/api/v1/kris",
        json={
            "risk_id": test_risk_for_kri.id,
            "metric_name": metric_name,
            "description": "Should fail because vendor write is missing.",
            "unit": "%",
            "current_value": 50.0,
            "lower_limit": 0.0,
            "upper_limit": 100.0,
            "linked_vendor_ids": [test_vendor_for_kri.id],
        },
    )

    assert response.status_code == 403
    persisted = (
        await db_session.execute(
            select(KeyRiskIndicator).where(KeyRiskIndicator.metric_name == metric_name)
        )
    ).scalar_one_or_none()
    assert persisted is None


@pytest.mark.asyncio
async def test_admin_update_reconciles_vendor_links_atomically(
    auth_client: AsyncClient,
    db_session,
    test_kri: KeyRiskIndicator,
    test_vendor_for_kri: Vendor,
    second_test_vendor_for_kri: Vendor,
):
    db_session.add(VendorKRILink(vendor_id=test_vendor_for_kri.id, kri_id=test_kri.id))
    await db_session.commit()

    response = await auth_client.put(
        f"/api/v1/kris/{test_kri.id}",
        json={
            "metric_name": "Updated with Vendors",
            "linked_vendor_ids": [second_test_vendor_for_kri.id],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["metric_name"] == "Updated with Vendors"
    assert [vendor["id"] for vendor in data["linked_vendors"]] == [second_test_vendor_for_kri.id]

    result = await db_session.execute(
        select(VendorKRILink.vendor_id)
        .where(VendorKRILink.kri_id == test_kri.id)
        .order_by(VendorKRILink.vendor_id.asc())
    )
    assert list(result.scalars().all()) == [second_test_vendor_for_kri.id]


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
    result = await db_session.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.id == kri_id))
    kri = result.scalar_one_or_none()
    assert kri is not None, "KRI should still exist after delete (soft-delete)"
    assert kri.is_archived is True
    assert kri.archived_at is not None
    assert kri.archived_by_id is not None


@pytest.mark.asyncio
async def test_kri_history_preserved_after_archive(auth_client: AsyncClient, db_session, test_risk_for_kri):
    """Verify KRIValueHistory entries preserved after KRI archival."""
    from datetime import date

    from sqlalchemy import select

    from app.models.kri_history import KRIValueHistory

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
    result = await db_session.execute(select(KRIValueHistory).where(KRIValueHistory.kri_id == kri_id))
    entries = result.scalars().all()
    assert len(entries) == 1, "History entries should be preserved after archive"
    assert entries[0].value == 50.0


@pytest.mark.asyncio
async def test_archived_kri_excluded_from_list(auth_client: AsyncClient, db_session, test_risk_for_kri):
    """Verify archived KRI not returned in default list."""

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


@pytest.mark.asyncio
async def test_kri_restore_clears_archive_metadata_and_allows_list_after_restore(
    auth_client: AsyncClient,
    db_session,
    test_risk_for_kri: Risk,
):
    """Restoring an archived KRI clears metadata and makes it visible in default list."""
    # Create a KRI and archive it via the API (sets archived_at/by_id)
    kri = KeyRiskIndicator(
        risk_id=test_risk_for_kri.id,
        metric_name="Restore Test KRI",
        description="KRI for restore verification",
        unit="%",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    kri_id = kri.id

    response = await auth_client.delete(f"/api/v1/kris/{kri_id}?reason=Test%20archive%20for%20restore")
    assert response.status_code == 204

    # NOTE: avoid db_session.expire_all() here because auth_client overrides deps.get_current_user
    # with a concrete ORM instance; expiring the session would cause relationship lazy-loads during
    # permission checks, which is incompatible with SQLAlchemy async (MissingGreenlet).
    assert kri.is_archived is True
    assert kri.archived_at is not None
    assert kri.archived_by_id is not None

    # Restore
    response = await auth_client.post(f"/api/v1/kris/{kri_id}/restore")
    assert response.status_code == 200
    data = response.json()
    assert data["is_archived"] is False
    assert data["archived_at"] is None
    assert data["archived_by_id"] is None

    # Verify default list includes it again
    response = await auth_client.get("/api/v1/kris")
    assert response.status_code == 200
    items = response.json()["items"]
    kri_ids = [item["id"] for item in items]
    assert kri_id in kri_ids


@pytest.mark.asyncio
async def test_kri_restore_requires_risks_delete(
    client_readonly: AsyncClient,
    db_session,
    test_risk_for_kri: Risk,
):
    """User without risks:delete cannot restore an archived KRI."""
    # Create archived KRI directly (permission check should block before handler runs)
    kri = KeyRiskIndicator(
        risk_id=test_risk_for_kri.id,
        metric_name="RBAC Restore KRI",
        description="KRI for restore RBAC test",
        unit="%",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        is_archived=True,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    kri_id = kri.id

    response = await client_readonly.post(f"/api/v1/kris/{kri_id}/restore")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_kri_restore_rejects_not_archived(auth_client: AsyncClient, test_kri: KeyRiskIndicator):
    """Restore endpoint should reject KRIs that are not archived."""
    response = await auth_client.post(f"/api/v1/kris/{test_kri.id}/restore")
    assert response.status_code == 400


# These tests use a client without risks:write/delete permissions
# The client_employee fixture has risks:read but we need to check write/delete denial


@pytest_asyncio.fixture
async def test_role_no_write(db_session):
    """Create a role with only risks:read (no write/delete)."""
    from app.models import Permission, RolePermission
    from app.models import Role as RoleModel

    role = RoleModel(name="readonly", display_name="Read Only", description="Read only role")
    db_session.add(role)
    await db_session.commit()

    perm = Permission(resource="risks", action="read", description="Read risks only")
    db_session.add(perm)
    await db_session.commit()

    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()

    return role


@pytest_asyncio.fixture
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

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models import Role, RolePermission

    result = await db_session.execute(
        select(UserModel)
        .options(
            selectinload(UserModel.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(UserModel.department),
        )
        .where(UserModel.id == user.id)
    )
    return result.scalar_one()


@pytest_asyncio.fixture
async def client_readonly(db_session, test_user_readonly):
    """Client for read-only user."""
    from httpx import ASGITransport, AsyncClient

    from app.core.config import Settings, get_settings
    from app.db.session import get_db
    from app.main import app

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


@pytest_asyncio.fixture
async def test_role_with_write(db_session):
    """Create a role with risks:write but NOT a privileged role (not CRO/Risk Manager/Admin)."""
    from sqlalchemy import select

    from app.models import Permission, RolePermission
    from app.models import Role as RoleModel

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


@pytest_asyncio.fixture
async def test_user_dept_head(db_session, test_department, test_role_with_write):
    """Create a department head user (has risks:write but not privileged)."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models import Role, RolePermission
    from app.models import User as UserModel

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
            selectinload(UserModel.department),
        )
        .where(UserModel.id == user.id)
    )
    return result.scalar_one()


@pytest_asyncio.fixture
async def client_dept_head(db_session, test_user_dept_head):
    """Client for department head user (has write but not privileged)."""
    from httpx import ASGITransport, AsyncClient

    from app.core.config import Settings, get_settings
    from app.db.session import get_db
    from app.main import app

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


@pytest_asyncio.fixture
async def test_role_with_write_and_vendor_links(db_session):
    from sqlalchemy import select

    from app.models import Permission, Role as RoleModel, RolePermission

    role = RoleModel(
        name="dept_head_vendor_links",
        display_name="Department Head Vendor Links",
        description="Non-privileged with risk and vendor write permissions",
    )
    db_session.add(role)
    await db_session.commit()

    for resource, action in [
        ("risks", "read"),
        ("risks", "write"),
        ("vendors", "read"),
        ("vendors", "write"),
    ]:
        perm_result = await db_session.execute(
            select(Permission).where(Permission.resource == resource, Permission.action == action)
        )
        perm = perm_result.scalar_one_or_none()
        if not perm:
            perm = Permission(resource=resource, action=action, description=f"{resource} {action}")
            db_session.add(perm)
            await db_session.commit()
        db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))

    await db_session.commit()
    return role


@pytest_asyncio.fixture
async def test_user_dept_head_vendor_links(db_session, test_department, test_role_with_write_and_vendor_links):
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models import Role, RolePermission
    from app.models import User as UserModel

    user = UserModel(
        name="Department Head Vendor Links",
        email="depthead-vendors@test.com",
        department_id=test_department.id,
        role_id=test_role_with_write_and_vendor_links.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    result = await db_session.execute(
        select(UserModel)
        .options(
            selectinload(UserModel.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(UserModel.department),
        )
        .where(UserModel.id == user.id)
    )
    return result.scalar_one()


@pytest_asyncio.fixture
async def client_dept_head_vendor_links(db_session, test_user_dept_head_vendor_links):
    from httpx import ASGITransport, AsyncClient

    from app.core.config import Settings, get_settings
    from app.db.session import get_db
    from app.main import app

    def override_settings():
        return Settings(mock_auth_enabled=True, debug=True)

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings

    transport = ASGITransport(app=app)
    headers = {"X-Mock-User-Id": str(test_user_dept_head_vendor_links.id)}
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
async def test_non_privileged_vendor_link_edit_is_approval_gated_and_applies_on_approval(
    client: AsyncClient,
    db_session,
    test_department,
    test_role_with_write_and_vendor_links,
    test_kri: KeyRiskIndicator,
    test_vendor_for_kri: Vendor,
    second_test_vendor_for_kri: Vendor,
    test_user,
):
    from app.models import User
    from app.models.user import AccessScope

    non_privileged_user = User(
        name="Department Head Vendor Links Inline",
        email="depthead-vendor-inline@test.com",
        department_id=test_department.id,
        role_id=test_role_with_write_and_vendor_links.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add(non_privileged_user)
    await db_session.commit()
    await db_session.refresh(non_privileged_user)

    db_session.add(VendorKRILink(vendor_id=test_vendor_for_kri.id, kri_id=test_kri.id))
    await db_session.commit()

    response = await client.put(
        f"/api/v1/kris/{test_kri.id}",
        headers={"X-Mock-User-Id": str(non_privileged_user.id)},
        json={
            "unit": "count",
            "frequency": "monthly",
            "linked_vendor_ids": [second_test_vendor_for_kri.id],
        },
    )

    assert response.status_code == 202
    data = response.json()
    assert data["pending_changes"]["unit"] == {"old": "%", "new": "count"}
    assert data["pending_changes"]["frequency"] == {"old": "quarterly", "new": "monthly"}
    assert data["pending_changes"]["linked_vendor_ids"] == {
        "old": [test_vendor_for_kri.id],
        "new": [second_test_vendor_for_kri.id],
    }

    await db_session.refresh(test_kri)
    assert test_kri.unit == "%"
    assert test_kri.frequency == "quarterly"
    current_vendor_ids = (
        await db_session.execute(
            select(VendorKRILink.vendor_id)
            .where(VendorKRILink.kri_id == test_kri.id)
            .order_by(VendorKRILink.vendor_id.asc())
        )
    ).scalars().all()
    assert list(current_vendor_ids) == [test_vendor_for_kri.id]

    approval = await db_session.get(ApprovalRequest, data["approval_id"])
    assert approval is not None

    approve_response = await client.post(
        f"/api/v1/approvals/{approval.id}/approve",
        headers={"X-Mock-User-Id": str(test_user.id)},
        json={"resolution_notes": "Approved vendor reassignment"},
    )
    assert approve_response.status_code == 200

    await db_session.refresh(test_kri)
    assert test_kri.unit == "count"
    assert test_kri.frequency == "monthly"
    current_vendor_ids = (
        await db_session.execute(
            select(VendorKRILink.vendor_id)
            .where(VendorKRILink.kri_id == test_kri.id)
            .order_by(VendorKRILink.vendor_id.asc())
        )
    ).scalars().all()
    assert list(current_vendor_ids) == [second_test_vendor_for_kri.id]


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


# =============================================================================
# Cross-Department KRI History Access (Phase 154-02)
# Validates reporting owner and risk owner can access KRI history cross-department
# =============================================================================


@pytest_asyncio.fixture
async def cross_dept_for_kri(db_session):
    """Create a second department for cross-dept KRI tests."""
    dept = Department(
        name="Analytics Department",
        description="Second department for KRI cross-dept tests",
        code="ANALYTICS",
        is_active=True,
    )
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)
    return dept


@pytest_asyncio.fixture
async def cross_dept_risk_for_kri(db_session, cross_dept_for_kri: Department, test_user):
    """Create a risk in cross-dept for KRI testing."""
    risk = Risk(
        risk_id_code="R-XDEPT-KRI",
        name="Cross-Dept KRI Risk",
        process="Cross-Dept KRI Process",
        description="Risk in different department for KRI history test",
        department_id=cross_dept_for_kri.id,  # Different department
        owner_id=test_user.id,  # Owned by test_user (from main dept)
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


@pytest_asyncio.fixture
async def cross_dept_kri_with_reporting_owner(db_session, cross_dept_risk_for_kri: Risk, test_user):
    """Create a KRI in cross-dept with test_user as reporting owner."""
    kri = KeyRiskIndicator(
        risk_id=cross_dept_risk_for_kri.id,
        metric_name="Cross-Dept KRI",
        description="KRI in different department",
        unit="%",
        current_value=75.0,
        lower_limit=0.0,
        upper_limit=100.0,
        reporting_owner_id=test_user.id,  # test_user is from main dept
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    return kri


@pytest.mark.asyncio
async def test_reporting_owner_can_view_kri_history_cross_department(
    auth_client: AsyncClient,
    db_session,
    cross_dept_kri_with_reporting_owner: KeyRiskIndicator,
):
    """
    KRI reporting owner can view history for their KRI even in different department.
    Per BUSINESS_LOGIC.md §7.1 and Phase 154-02 fix.
    """
    from datetime import date

    from app.models.kri_history import KRIValueHistory

    kri = cross_dept_kri_with_reporting_owner

    # Add a history entry
    history = KRIValueHistory(
        kri_id=kri.id,
        value=75.0,
        period_start=date(2025, 12, 1),
        period_end=date(2025, 12, 31),
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        breach_status="within",
    )
    db_session.add(history)
    await db_session.commit()

    # Reporting owner (test_user via auth_client) can view history cross-department
    response = await auth_client.get(f"/api/v1/kris/{kri.id}/history")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


@pytest.mark.asyncio
async def test_risk_owner_can_view_kri_history_cross_department(
    auth_client: AsyncClient,
    db_session,
    cross_dept_risk_for_kri: Risk,
):
    """
    Risk owner can view history for KRIs linked to their risk even in different department.
    Per BUSINESS_LOGIC.md §7.1 and Phase 154-02 fix.
    """
    from datetime import date

    from app.models.kri_history import KRIValueHistory

    # Create KRI without explicit reporting owner (falls back to risk owner)
    kri = KeyRiskIndicator(
        risk_id=cross_dept_risk_for_kri.id,
        metric_name="Risk Owner KRI",
        description="KRI for risk owner history test",
        unit="count",
        current_value=10.0,
        lower_limit=0.0,
        upper_limit=50.0,
        reporting_owner_id=None,  # No explicit reporting owner
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    # Add a history entry
    history = KRIValueHistory(
        kri_id=kri.id,
        value=10.0,
        period_start=date(2025, 11, 1),
        period_end=date(2025, 11, 30),
        lower_limit=0.0,
        upper_limit=50.0,
        unit="count",
        breach_status="within",
    )
    db_session.add(history)
    await db_session.commit()

    # Risk owner (test_user via auth_client) can view history cross-department
    response = await auth_client.get(f"/api/v1/kris/{kri.id}/history")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_read_scoped_user_can_list_archived_kri_with_include_archived(
    client_readonly: AsyncClient,
    db_session,
    test_risk_for_kri: Risk,
):
    """Read-scoped users can include archived KRIs without privileged role checks."""
    from datetime import UTC, datetime

    archived_kri = KeyRiskIndicator(
        risk_id=test_risk_for_kri.id,
        metric_name="Archived Read Scope KRI",
        description="Archived KRI for read scope include_archived test",
        unit="%",
        current_value=33.0,
        lower_limit=0.0,
        upper_limit=100.0,
        is_archived=True,
        archived_at=datetime.now(UTC),
    )
    db_session.add(archived_kri)
    await db_session.commit()
    await db_session.refresh(archived_kri)

    default_resp = await client_readonly.get("/api/v1/kris")
    assert default_resp.status_code == 200
    default_ids = {item["id"] for item in default_resp.json()["items"]}
    assert archived_kri.id not in default_ids

    include_resp = await client_readonly.get("/api/v1/kris?include_archived=true")
    assert include_resp.status_code == 200
    include_ids = {item["id"] for item in include_resp.json()["items"]}
    assert archived_kri.id in include_ids


@pytest.mark.asyncio
async def test_read_scoped_user_can_get_archived_kri_detail_with_include_archived(
    client_readonly: AsyncClient,
    db_session,
    test_risk_for_kri: Risk,
):
    """Archived KRI detail is hidden by default and available when include_archived=true."""
    from datetime import UTC, datetime

    archived_kri = KeyRiskIndicator(
        risk_id=test_risk_for_kri.id,
        metric_name="Archived Detail KRI",
        description="Archived KRI detail visibility test",
        unit="%",
        current_value=22.0,
        lower_limit=0.0,
        upper_limit=100.0,
        is_archived=True,
        archived_at=datetime.now(UTC),
    )
    db_session.add(archived_kri)
    await db_session.commit()
    await db_session.refresh(archived_kri)

    hidden = await client_readonly.get(f"/api/v1/kris/{archived_kri.id}")
    assert hidden.status_code == 404

    visible = await client_readonly.get(f"/api/v1/kris/{archived_kri.id}?include_archived=true")
    assert visible.status_code == 200
    assert visible.json()["id"] == archived_kri.id
