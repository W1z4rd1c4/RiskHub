import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.role import Permission, Role, RolePermission, RoleType


@pytest.mark.asyncio
async def test_list_roles_cro_only(
    client_cro: AsyncClient,
    client_employee: AsyncClient,
):
    """Test that only CRO can list roles."""
    # Authenticate as CRO
    response = await client_cro.get("/api/v1/riskhub/roles")
    assert response.status_code == 200

    # Authenticate as Employee (should fail)
    response = await client_employee.get("/api/v1/riskhub/roles")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_role(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Test creating a new role with permissions."""
    data = {"name": "new_role", "display_name": "New Role", "description": "Test role", "permission_ids": []}

    response = await client_cro.post("/api/v1/riskhub/roles", json=data)
    assert response.status_code == 201
    result = response.json()
    assert result["name"] == "new_role"
    assert result["is_system"] is False
    assert result["is_active"] is True


@pytest.mark.asyncio
async def test_delete_role_soft(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Test soft deletion of a role."""
    # Create role first
    role = Role(name="to_delete", display_name="To Delete", is_system=False, is_active=True)
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    response = await client_cro.delete(f"/api/v1/riskhub/roles/{role.id}")
    assert response.status_code == 200

    # Verify it's soft deleted
    result = await db_session.execute(select(Role).where(Role.id == role.id))
    updated_role = result.scalar_one()
    assert updated_role.is_active is False


@pytest.mark.asyncio
async def test_delete_protected_role_is_blocked(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Protected roles cannot be deleted even if not marked as system roles."""
    role = Role(name=RoleType.VIEWER, display_name="Viewer", is_system=False, is_active=True)
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    response = await client_cro.delete(f"/api/v1/riskhub/roles/{role.id}")
    assert response.status_code == 400
    assert "Cannot delete protected system role" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_role_invalid_permission_ids(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Test that invalid permission IDs return 400."""
    data = {
        "name": "invalid_perms",
        "display_name": "Invalid Perms Role",
        "description": "Test role with bad permissions",
        "permission_ids": [99999, 99998],  # Non-existent IDs
    }

    response = await client_cro.post("/api/v1/riskhub/roles", json=data)
    assert response.status_code == 400
    assert "Unknown permission IDs" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_role_invalid_permission_ids(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Test that updating role with invalid permission IDs returns 400."""
    # Create role first
    role = Role(name="to_update_perms", display_name="To Update Perms", is_system=False, is_active=True)
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    data = {
        "permission_ids": [99999, 99998]  # Non-existent IDs
    }

    response = await client_cro.patch(f"/api/v1/riskhub/roles/{role.id}", json=data)
    assert response.status_code == 400
    assert "Unknown permission IDs" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_role_invalid_permission_ids_preserves_existing_permissions(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Permission replacement validates all IDs before clearing existing role permissions."""
    permission = Permission(resource="reports", action="read", description="Read reports")
    role = Role(name="stable_perms", display_name="Stable Perms", is_system=False, is_active=True)
    db_session.add_all([permission, role])
    await db_session.commit()
    await db_session.refresh(permission)
    await db_session.refresh(role)
    db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await db_session.commit()

    response = await client_cro.patch(f"/api/v1/riskhub/roles/{role.id}", json={"permission_ids": [99999]})
    assert response.status_code == 400

    rows = (
        await db_session.execute(select(RolePermission).where(RolePermission.role_id == role.id))
    ).scalars().all()
    assert [row.permission_id for row in rows] == [permission.id]


@pytest.mark.asyncio
async def test_create_role_with_valid_permissions(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Test that creating a role with valid permission IDs succeeds."""
    from app.models.role import Permission

    # Get actual permission IDs
    result = await db_session.execute(select(Permission).limit(2))
    permissions = result.scalars().all()

    if permissions:  # Only test if permissions exist
        perm_ids = [p.id for p in permissions]
        data = {"name": "valid_perms", "display_name": "Valid Perms Role", "permission_ids": perm_ids}

        response = await client_cro.post("/api/v1/riskhub/roles", json=data)
        assert response.status_code == 201
        assert len(response.json()["permissions"]) == len(perm_ids)
