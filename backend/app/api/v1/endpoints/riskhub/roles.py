from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.core.policy import PROTECTED_SYSTEM_ROLES
from app.db.session import get_db
from app.models import User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.role import RoleType
from app.schemas.riskhub import RoleHubCreate, RoleHubRead, RoleHubUpdate
from app.services._riskhub_config import load_role_for_update, role_to_read, validate_permission_ids

from ._shared import get_cro_user

router = APIRouter()


@router.get("/roles", response_model=list[RoleHubRead])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
    include_inactive: bool = Query(False, description="Include soft-deleted roles"),
) -> list[RoleHubRead]:
    """List all roles with permissions. CRO only."""
    from app.models.role import Role, RolePermission

    query = (
        select(Role)
        .options(
            selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(Role.users),
        )
        .order_by(Role.display_name)
    )

    if not include_inactive:
        query = query.where(Role.is_active.is_(True))

    result = await db.execute(query)
    roles = result.scalars().unique().all()

    return [
        role_to_read(r)
        for r in roles
    ]


@router.post("/roles", response_model=RoleHubRead, status_code=201)
async def create_role(
    data: RoleHubCreate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> RoleHubRead:
    """Create a new role. CRO only."""
    from app.models.role import Role, RolePermission

    # Check for duplicate name
    existing = await db.execute(select(Role).where(Role.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Role name '{data.name}' already exists")
    permissions = await validate_permission_ids(db, data.permission_ids)

    role = Role(
        name=data.name,
        display_name=data.display_name,
        description=data.description,
        is_system=False,
        is_active=True,
    )
    db.add(role)
    await db.flush()  # Get the role ID

    for perm in permissions:
        role_perm = RolePermission(role_id=role.id, permission_id=perm.id)
        db.add(role_perm)

    await db.commit()

    # Reload with relationships
    result = await db.execute(
        select(Role)
        .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
        .where(Role.id == role.id)
    )
    role = result.scalar_one()

    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.CREATE,
        entity_type=ActivityEntityType.ROLE,
        entity_id=role.id,
        entity_name=role.display_name,
        safe_entity_label=role.display_name,
        description=f"Created role: {role.display_name}",
    )
    await db.commit()

    return role_to_read(role, user_count=0)


@router.patch("/roles/{id}", response_model=RoleHubRead)
async def update_role(
    id: int,
    data: RoleHubUpdate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> RoleHubRead:
    """Update a role. CRO only."""
    from app.models.role import Role, RolePermission

    role = await load_role_for_update(db, id)

    # Core system roles are immutable
    if role.name in {RoleType.CRO, RoleType.ADMIN, RoleType.VIEWER}:
        raise HTTPException(
            status_code=400,
            detail=f"The {role.display_name} role is a core system role and cannot be modified.",
        )

    # Update basic fields
    if data.display_name is not None:
        role.display_name = data.display_name
    if data.description is not None:
        role.description = data.description

    # Update permissions if provided
    if data.permission_ids is not None:
        permissions = await validate_permission_ids(db, data.permission_ids)
        # Clear existing permissions
        await db.execute(delete(RolePermission).where(RolePermission.role_id == role.id))

        for perm in permissions:
            role_perm = RolePermission(role_id=role.id, permission_id=perm.id)
            db.add(role_perm)

    await db.commit()

    # Reload with relationships
    result = await db.execute(
        select(Role)
        .options(
            selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(Role.users),
        )
        .where(Role.id == role.id)
    )
    role = result.scalar_one()

    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.ROLE,
        entity_id=role.id,
        entity_name=role.display_name,
        safe_entity_label=role.display_name,
        description=f"Updated role: {role.display_name}",
    )
    await db.commit()

    return role_to_read(role)


@router.delete("/roles/{id}")
async def delete_role(
    id: int,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> dict:
    """Soft-delete a role. CRO only. Cannot delete system roles or roles with users."""
    role = await load_role_for_update(db, id)

    # Protected roles cannot be deleted
    if role.is_system or role.name in PROTECTED_SYSTEM_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete protected system role: {role.display_name}",
        )

    if not role.is_active:
        raise HTTPException(status_code=400, detail="Role is already deleted")

    active_users = [u for u in role.users if u.is_active]
    if active_users:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete role with {len(active_users)} active users. Reassign users first.",
        )

    role.is_active = False
    await db.commit()

    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.DELETE,
        entity_type=ActivityEntityType.ROLE,
        entity_id=role.id,
        entity_name=role.display_name,
        safe_entity_label=role.display_name,
        description=f"Deleted role: {role.display_name}",
    )
    await db.commit()

    return {"status": "deleted", "id": id}


@router.post("/roles/{id}/restore", response_model=RoleHubRead)
async def restore_role(
    id: int,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> RoleHubRead:
    """Restore a soft-deleted role. CRO only."""
    role = await load_role_for_update(db, id)

    if role.is_active:
        raise HTTPException(status_code=400, detail="Role is not deleted")

    role.is_active = True
    await db.commit()
    await db.refresh(role)

    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.ROLE,
        entity_id=role.id,
        entity_name=role.display_name,
        safe_entity_label=role.display_name,
        safe_description="Restored role",
        safe_description_siem="Restored role",
        description=f"Restored role: {role.display_name}",
    )
    await db.commit()

    return role_to_read(role, user_count=0)
