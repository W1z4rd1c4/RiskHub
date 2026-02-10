"""Risk Hub API endpoints for CRO business configuration."""
from datetime import datetime, UTC
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import User, RiskTypeConfig, GlobalConfig, ApprovalScenario, Risk
from app.models.role import RoleType
from app.api.deps import get_current_user
from app.core.activity_logger import log_activity
from app.core.policy import PROTECTED_SYSTEM_ROLES, PUBLIC_CONFIG_ALLOWLIST
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.riskhub import (
    RiskTypeRead, RiskTypeCreate, RiskTypeUpdate, PublicRiskTypeRead,
    GlobalConfigRead, GlobalConfigUpdate,
    ApprovalScenarioRead, ApprovalScenarioUpdate,
    RoleHubRead, RoleHubCreate, RoleHubUpdate, PermissionHubRead,
    DepartmentHubRead, DepartmentHubCreate, DepartmentHubUpdate,
)

router = APIRouter()

async def _ensure_total_assets_value_config(db: AsyncSession) -> None:
    """
    Ensure the `total_assets_value` config exists.

    This key is used across the UI (financial loss ranges). In some dev environments
    migrations may be skipped/reset; this guard inserts the default row if missing
    so the Risk Hub "System Settings" UI can always display it.
    """
    result = await db.execute(select(GlobalConfig).where(GlobalConfig.key == "total_assets_value"))
    existing = result.scalar_one_or_none()
    if existing:
        return

    db.add(
        GlobalConfig(
            key="total_assets_value",
            value="10000000000",
            value_type="int",
            category="risk_thresholds",
            display_name="Total Assets Value",
            description="Company total asset value used to calculate financial loss thresholds for risk impact levels",
            min_value=1000000,
            max_value=None,
            is_editable=True,
        )
    )
    try:
        await db.commit()
    except IntegrityError:
        # Another request may have inserted it concurrently.
        await db.rollback()


# ============================================================================
# Dependencies
# ============================================================================

def require_cro(current_user: User) -> User:
    """Check that user has CRO role. Raises 403 if not."""
    if current_user.role.name not in RoleType.cro_only_roles():
        raise HTTPException(
            status_code=403, 
            detail="Risk Hub access requires CRO role"
        )
    return current_user


def get_cro_user(current_user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency: authenticated user with CRO role."""
    return require_cro(current_user)





# ============================================================================
# Risk Types Endpoints
# ============================================================================

@router.get("/risk-types", response_model=list[RiskTypeRead])
async def list_risk_types(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
    include_inactive: bool = Query(False, description="Include soft-deleted types")
) -> list[RiskTypeRead]:
    """
    List all risk types with dynamically computed risk counts.
    CRO only.
    """
    
    query = select(RiskTypeConfig).order_by(RiskTypeConfig.sort_order, RiskTypeConfig.display_name)
    
    if not include_inactive:
        query = query.where(RiskTypeConfig.is_active == True)
    
    result = await db.execute(query)
    types = result.scalars().all()
    
    # Compute risk counts dynamically from the risks table
    count_result = await db.execute(
        select(Risk.risk_type, func.count(Risk.id))
        .where(Risk.status != "archived")
        .group_by(Risk.risk_type)
    )
    risk_counts = {row[0]: row[1] for row in count_result.all()}
    
    return [
        RiskTypeRead(
            id=t.id,
            code=t.code,
            display_name=t.display_name,
            description=t.description,
            color=t.color,
            icon=t.icon,
            sort_order=t.sort_order,
            is_active=t.is_active,
            is_system=t.is_system,
            risk_count=risk_counts.get(t.code, 0),
            created_at=t.created_at.isoformat(),
            updated_at=t.updated_at.isoformat()
        )
        for t in types
    ]


@router.post("/risk-types", response_model=RiskTypeRead, status_code=201)
async def create_risk_type(
    data: RiskTypeCreate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> RiskTypeRead:
    """
    Create a new risk type.
    CRO only.
    """
    
    # Check for duplicate code
    existing = await db.execute(
        select(RiskTypeConfig).where(RiskTypeConfig.code == data.code)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Risk type code '{data.code}' already exists")
    
    risk_type = RiskTypeConfig(
        code=data.code,
        display_name=data.display_name,
        description=data.description,
        color=data.color,
        icon=data.icon,
        sort_order=data.sort_order,
        is_active=True,
        is_system=False,
        risk_count=0
    )
    
    db.add(risk_type)
    await db.commit()
    await db.refresh(risk_type)
    
    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.CREATE,
        entity_type=ActivityEntityType.CONFIG,
        entity_id=risk_type.id,
        entity_name=risk_type.display_name,
        description=f"Created risk type: {risk_type.display_name}"
    )
    await db.commit()  # Persist activity log
    
    return RiskTypeRead(
        id=risk_type.id,
        code=risk_type.code,
        display_name=risk_type.display_name,
        description=risk_type.description,
        color=risk_type.color,
        icon=risk_type.icon,
        sort_order=risk_type.sort_order,
        is_active=risk_type.is_active,
        is_system=risk_type.is_system,
        risk_count=risk_type.risk_count,
        created_at=risk_type.created_at.isoformat(),
        updated_at=risk_type.updated_at.isoformat()
    )


@router.patch("/risk-types/{id}", response_model=RiskTypeRead)
async def update_risk_type(
    id: int,
    data: RiskTypeUpdate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> RiskTypeRead:
    """
    Update a risk type.
    CRO only. Cannot change code of system types.
    """
    
    result = await db.execute(select(RiskTypeConfig).where(RiskTypeConfig.id == id))
    risk_type = result.scalar_one_or_none()
    
    if not risk_type:
        raise HTTPException(status_code=404, detail="Risk type not found")
    
    # Apply updates
    if data.display_name is not None:
        risk_type.display_name = data.display_name
    if data.description is not None:
        risk_type.description = data.description
    if data.color is not None:
        risk_type.color = data.color
    if data.icon is not None:
        risk_type.icon = data.icon
    if data.sort_order is not None:
        risk_type.sort_order = data.sort_order
    
    await db.commit()
    await db.refresh(risk_type)
    
    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.CONFIG,
        entity_id=risk_type.id,
        entity_name=risk_type.display_name,
        description=f"Updated risk type: {risk_type.display_name}"
    )
    await db.commit()  # Persist activity log
    
    return RiskTypeRead(
        id=risk_type.id,
        code=risk_type.code,
        display_name=risk_type.display_name,
        description=risk_type.description,
        color=risk_type.color,
        icon=risk_type.icon,
        sort_order=risk_type.sort_order,
        is_active=risk_type.is_active,
        is_system=risk_type.is_system,
        risk_count=risk_type.risk_count,
        created_at=risk_type.created_at.isoformat(),
        updated_at=risk_type.updated_at.isoformat()
    )


@router.delete("/risk-types/{id}")
async def delete_risk_type(
    id: int,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> dict:
    """
    Soft-delete a risk type.
    CRO only. Cannot delete system types.
    If risks use this type, they become orphaned.
    """
    
    result = await db.execute(select(RiskTypeConfig).where(RiskTypeConfig.id == id))
    risk_type = result.scalar_one_or_none()
    
    if not risk_type:
        raise HTTPException(status_code=404, detail="Risk type not found")
    
    if risk_type.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system risk types")
    
    if not risk_type.is_active:
        raise HTTPException(status_code=400, detail="Risk type is already deleted")
    
    # TODO: Create orphaned items for risks using this type
    # This would be implemented in a future step when the Risk model has risk_type_id FK
    
    risk_type.is_active = False
    await db.commit()
    
    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.DELETE,
        entity_type=ActivityEntityType.CONFIG,
        entity_id=risk_type.id,
        entity_name=risk_type.display_name,
        description=f"Deleted risk type: {risk_type.display_name} (affecting {risk_type.risk_count} risks)"
    )
    await db.commit()  # Persist activity log
    
    return {"status": "deleted", "id": id, "affected_risks": risk_type.risk_count}


@router.post("/risk-types/{id}/restore", response_model=RiskTypeRead)
async def restore_risk_type(
    id: int,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> RiskTypeRead:
    """
    Restore a soft-deleted risk type.
    CRO only.
    """
    
    result = await db.execute(select(RiskTypeConfig).where(RiskTypeConfig.id == id))
    risk_type = result.scalar_one_or_none()
    
    if not risk_type:
        raise HTTPException(status_code=404, detail="Risk type not found")
    
    if risk_type.is_active:
        raise HTTPException(status_code=400, detail="Risk type is not deleted")
    
    risk_type.is_active = True
    await db.commit()
    await db.refresh(risk_type)
    
    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.CONFIG,
        entity_id=risk_type.id,
        entity_name=risk_type.display_name,
        description=f"Restored risk type: {risk_type.display_name}"
    )
    await db.commit()  # Persist activity log
    
    return RiskTypeRead(
        id=risk_type.id,
        code=risk_type.code,
        display_name=risk_type.display_name,
        description=risk_type.description,
        color=risk_type.color,
        icon=risk_type.icon,
        sort_order=risk_type.sort_order,
        is_active=risk_type.is_active,
        is_system=risk_type.is_system,
        risk_count=risk_type.risk_count,
        created_at=risk_type.created_at.isoformat(),
        updated_at=risk_type.updated_at.isoformat()
    )




# ============================================================================
# Global Config Endpoints
# ============================================================================

@router.get("/config", response_model=dict[str, list[GlobalConfigRead]])
async def list_all_configs(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> dict[str, list[GlobalConfigRead]]:
    """
    List all configs grouped by category.
    CRO only.
    """

    await _ensure_total_assets_value_config(db)
    
    result = await db.execute(
        select(GlobalConfig)
        .options(selectinload(GlobalConfig.updated_by))
        .order_by(GlobalConfig.category, GlobalConfig.display_name)
    )
    configs = result.scalars().all()
    
    grouped: dict[str, list[GlobalConfigRead]] = {}
    for c in configs:
        config_read = GlobalConfigRead(
            id=c.id,
            key=c.key,
            value=c.value,
            value_type=c.value_type,
            category=c.category,
            display_name=c.display_name,
            description=c.description,
            min_value=c.min_value,
            max_value=c.max_value,
            is_editable=c.is_editable,
            updated_at=c.updated_at.isoformat(),
            updated_by_name=c.updated_by.name if c.updated_by else None
        )
        if c.category not in grouped:
            grouped[c.category] = []
        grouped[c.category].append(config_read)
    
    return grouped


@router.get("/config/{category}", response_model=list[GlobalConfigRead])
async def list_config_category(
    category: str,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> list[GlobalConfigRead]:
    """
    List configs for a specific category.
    CRO only.
    """

    if category == "risk_thresholds":
        await _ensure_total_assets_value_config(db)
    
    result = await db.execute(
        select(GlobalConfig)
        .options(selectinload(GlobalConfig.updated_by))
        .where(GlobalConfig.category == category)
        .order_by(GlobalConfig.display_name)
    )
    configs = result.scalars().all()
    
    return [
        GlobalConfigRead(
            id=c.id,
            key=c.key,
            value=c.value,
            value_type=c.value_type,
            category=c.category,
            display_name=c.display_name,
            description=c.description,
            min_value=c.min_value,
            max_value=c.max_value,
            is_editable=c.is_editable,
            updated_at=c.updated_at.isoformat(),
            updated_by_name=c.updated_by.name if c.updated_by else None
        )
        for c in configs
    ]


@router.patch("/config/{key}", response_model=GlobalConfigRead)
async def update_config(
    key: str,
    data: GlobalConfigUpdate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> GlobalConfigRead:
    """
    Update a config value.
    CRO only. Validates against min/max for int types.
    """
    
    result = await db.execute(
        select(GlobalConfig)
        .options(selectinload(GlobalConfig.updated_by))
        .where(GlobalConfig.key == key)
    )
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(status_code=404, detail=f"Config key '{key}' not found")
    
    if not config.is_editable:
        raise HTTPException(status_code=400, detail="This config value cannot be edited")
    
    # Validate value based on type
    if config.value_type == "int":
        try:
            int_val = int(data.value)
            if config.min_value is not None and int_val < config.min_value:
                raise HTTPException(status_code=400, detail=f"Value must be >= {config.min_value}")
            if config.max_value is not None and int_val > config.max_value:
                raise HTTPException(status_code=400, detail=f"Value must be <= {config.max_value}")
        except ValueError:
            raise HTTPException(status_code=400, detail="Value must be an integer")
    elif config.value_type == "bool":
        if data.value.lower() not in ("true", "false", "1", "0"):
            raise HTTPException(status_code=400, detail="Value must be true or false")
    
    old_value = config.value
    config.value = data.value
    config.updated_by_id = cro_user.id
    
    await db.commit()
    await db.refresh(config)
    
    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.CONFIG,
        entity_id=config.id,
        entity_name=config.display_name,
        description=f"Config '{key}' changed from '{old_value}' to '{data.value}'"
    )
    
    return GlobalConfigRead(
        id=config.id,
        key=config.key,
        value=config.value,
        value_type=config.value_type,
        category=config.category,
        display_name=config.display_name,
        description=config.description,
        min_value=config.min_value,
        max_value=config.max_value,
        is_editable=config.is_editable,
        updated_at=config.updated_at.isoformat(),
        updated_by_name=cro_user.name
    )




# ============================================================================
# Approval Scenarios Endpoints
# ============================================================================

@router.get("/approval-scenarios", response_model=list[ApprovalScenarioRead])
async def list_approval_scenarios(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> list[ApprovalScenarioRead]:
    """
    List all approval scenarios.
    CRO only.
    """
    
    result = await db.execute(
        select(ApprovalScenario)
        .options(selectinload(ApprovalScenario.updated_by))
        .order_by(ApprovalScenario.display_name)
    )
    scenarios = result.scalars().all()
    
    return [
        ApprovalScenarioRead(
            id=s.id,
            key=s.key,
            display_name=s.display_name,
            description=s.description,
            requires_approval=s.requires_approval,
            approver_roles=s.get_approver_roles(),
            updated_at=s.updated_at.isoformat(),
            updated_by_name=s.updated_by.name if s.updated_by else None
        )
        for s in scenarios
    ]


@router.patch("/approval-scenarios/{key}", response_model=ApprovalScenarioRead)
async def update_approval_scenario(
    key: str,
    data: ApprovalScenarioUpdate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> ApprovalScenarioRead:
    """
    Update an approval scenario.
    CRO only. Cannot create new scenarios.
    """
    
    result = await db.execute(
        select(ApprovalScenario)
        .options(selectinload(ApprovalScenario.updated_by))
        .where(ApprovalScenario.key == key)
    )
    scenario = result.scalar_one_or_none()
    
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Approval scenario '{key}' not found")
    
    changes = []
    
    if data.requires_approval is not None:
        old_val = scenario.requires_approval
        scenario.requires_approval = data.requires_approval
        changes.append(f"requires_approval: {old_val} → {data.requires_approval}")
    
    if data.approver_roles is not None:
        old_roles = scenario.get_approver_roles()
        scenario.set_approver_roles(data.approver_roles)
        changes.append(f"approver_roles: {old_roles} → {data.approver_roles}")
    
    scenario.updated_by_id = cro_user.id
    
    await db.commit()
    await db.refresh(scenario)
    
    if changes:
        await log_activity(
            db=db,
            actor=cro_user,
            action=ActivityAction.UPDATE,
            entity_type=ActivityEntityType.CONFIG,
            entity_id=scenario.id,
            entity_name=scenario.display_name,
            description=f"Approval scenario '{key}' updated: {', '.join(changes)}"
        )
    
    return ApprovalScenarioRead(
        id=scenario.id,
        key=scenario.key,
        display_name=scenario.display_name,
        description=scenario.description,
        requires_approval=scenario.requires_approval,
        approver_roles=scenario.get_approver_roles(),
        updated_at=scenario.updated_at.isoformat(),
        updated_by_name=cro_user.name
    )


# ============================================================================
# Public Config Endpoint (for all authenticated users)
# ============================================================================

@router.get("/public-config/{key}")
async def get_public_config(
    key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Get a single config value.
    Any authenticated user can read allowlisted config values only.
    CRO users can read any config value.
    """
    # CRO can read any key; non-CRO limited to allowlist
    is_cro = bool(current_user.role and current_user.role.name == RoleType.CRO)
    
    if not is_cro and key not in PUBLIC_CONFIG_ALLOWLIST:
        raise HTTPException(
            status_code=403,
            detail=f"Config key '{key}' is not publicly accessible"
        )

    if key == "total_assets_value":
        await _ensure_total_assets_value_config(db)
    
    result = await db.execute(
        select(GlobalConfig).where(GlobalConfig.key == key)
    )
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(status_code=404, detail=f"Config key '{key}' not found")
    
    return {
        "key": config.key,
        "value": config.get_typed_value(),
        "value_type": config.value_type
    }


# ============================================================================
# Public Risk Types Endpoint (for all authenticated users)
# ============================================================================



@router.get("/public-risk-types", response_model=list[PublicRiskTypeRead])
async def list_public_risk_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> list[PublicRiskTypeRead]:
    """
    List active risk types for UI display.
    Any authenticated user can access this endpoint.
    Only returns active types with minimal fields (no admin metadata).
    """
    result = await db.execute(
        select(RiskTypeConfig)
        .where(RiskTypeConfig.is_active == True)
        .order_by(RiskTypeConfig.sort_order, RiskTypeConfig.display_name)
    )
    types = result.scalars().all()
    
    return [
        PublicRiskTypeRead(
            code=t.code,
            display_name=t.display_name,
            color=t.color,
            icon=t.icon,
            sort_order=t.sort_order
        )
        for t in types
    ]




# ============================================================================
# Role Management Endpoints
# ============================================================================

@router.get("/permissions", response_model=list[PermissionHubRead])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> list[PermissionHubRead]:
    """List all available permissions for role assignment. CRO only."""
    from app.models.role import Permission
    
    
    result = await db.execute(select(Permission).order_by(Permission.resource, Permission.action))
    permissions = result.scalars().all()
    
    return [
        PermissionHubRead(
            id=p.id,
            resource=p.resource,
            action=p.action,
            description=p.description
        )
        for p in permissions
    ]


@router.get("/roles", response_model=list[RoleHubRead])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
    include_inactive: bool = Query(False, description="Include soft-deleted roles")
) -> list[RoleHubRead]:
    """List all roles with permissions. CRO only."""
    from app.models.role import Role, RolePermission, Permission
    
    query = select(Role).options(
        selectinload(Role.permissions).selectinload(RolePermission.permission),
        selectinload(Role.users)
    ).order_by(Role.display_name)
    
    if not include_inactive:
        query = query.where(Role.is_active == True)
    
    result = await db.execute(query)
    roles = result.scalars().unique().all()
    
    return [
        RoleHubRead(
            id=r.id,
            name=r.name,
            display_name=r.display_name,
            description=r.description,
            is_system=r.is_system,
            is_active=r.is_active,
            user_count=len([u for u in r.users if u.is_active]),
            permissions=[f"{rp.permission.resource}:{rp.permission.action}" for rp in r.permissions]
        )
        for r in roles
    ]


@router.post("/roles", response_model=RoleHubRead, status_code=201)
async def create_role(
    data: RoleHubCreate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> RoleHubRead:
    """Create a new role. CRO only."""
    from app.models.role import Role, RolePermission, Permission
    
    # Check for duplicate name
    existing = await db.execute(select(Role).where(Role.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Role name '{data.name}' already exists")
    
    role = Role(
        name=data.name,
        display_name=data.display_name,
        description=data.description,
        is_system=False,
        is_active=True
    )
    db.add(role)
    await db.flush()  # Get the role ID
    
    # Add permissions (with validation)
    if data.permission_ids:
        perms_result = await db.execute(
            select(Permission).where(Permission.id.in_(data.permission_ids))
        )
        permissions = perms_result.scalars().all()
        found_ids = {p.id for p in permissions}
        missing_ids = set(data.permission_ids) - found_ids
        if missing_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown permission IDs: {sorted(missing_ids)}"
            )
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
        description=f"Created role: {role.display_name}"
    )
    
    
    return RoleHubRead(
        id=role.id,
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        is_system=role.is_system,
        is_active=role.is_active,
        user_count=0,
        permissions=[f"{rp.permission.resource}:{rp.permission.action}" for rp in role.permissions]
    )


@router.patch("/roles/{id}", response_model=RoleHubRead)
async def update_role(
    id: int,
    data: RoleHubUpdate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> RoleHubRead:
    """Update a role. CRO only."""
    from app.models.role import Role, RolePermission, Permission
    
    result = await db.execute(
        select(Role)
        .options(
            selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(Role.users)
        )
        .where(Role.id == id)
    )
    role = result.scalar_one_or_none()
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Core system roles are immutable
    if role.name in {RoleType.CRO, RoleType.ADMIN, RoleType.VIEWER}:
        raise HTTPException(
            status_code=400,
            detail=f"The {role.display_name} role is a core system role and cannot be modified."
        )
    
    # Update basic fields
    if data.display_name is not None:
        role.display_name = data.display_name
    if data.description is not None:
        role.description = data.description
    
    # Update permissions if provided
    if data.permission_ids is not None:
        # Clear existing permissions
        await db.execute(
            RolePermission.__table__.delete().where(RolePermission.role_id == role.id)
        )
        
        # Add new permissions (with validation)
        if data.permission_ids:
            perms_result = await db.execute(
                select(Permission).where(Permission.id.in_(data.permission_ids))
            )
            permissions = perms_result.scalars().all()
            found_ids = {p.id for p in permissions}
            missing_ids = set(data.permission_ids) - found_ids
            if missing_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown permission IDs: {sorted(missing_ids)}"
                )
            for perm in permissions:
                role_perm = RolePermission(role_id=role.id, permission_id=perm.id)
                db.add(role_perm)
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(Role)
        .options(
            selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(Role.users)
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
        description=f"Updated role: {role.display_name}"
    )
    
    
    return RoleHubRead(
        id=role.id,
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        is_system=role.is_system,
        is_active=role.is_active,
        user_count=len([u for u in role.users if u.is_active]),
        permissions=[f"{rp.permission.resource}:{rp.permission.action}" for rp in role.permissions]
    )


@router.delete("/roles/{id}")
async def delete_role(
    id: int,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> dict:
    """Soft-delete a role. CRO only. Cannot delete system roles or roles with users."""
    from app.models.role import Role
    
    result = await db.execute(
        select(Role).options(selectinload(Role.users)).where(Role.id == id)
    )
    role = result.scalar_one_or_none()
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Protected roles cannot be deleted
    if role.is_system or role.name in PROTECTED_SYSTEM_ROLES:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete protected system role: {role.display_name}"
        )
    
    if not role.is_active:
        raise HTTPException(status_code=400, detail="Role is already deleted")
    
    active_users = [u for u in role.users if u.is_active]
    if active_users:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete role with {len(active_users)} active users. Reassign users first."
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
        description=f"Deleted role: {role.display_name}"
    )
    
    
    return {"status": "deleted", "id": id}


@router.post("/roles/{id}/restore", response_model=RoleHubRead)
async def restore_role(
    id: int,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> RoleHubRead:
    """Restore a soft-deleted role. CRO only."""
    from app.models.role import Role, RolePermission
    
    result = await db.execute(
        select(Role)
        .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
        .where(Role.id == id)
    )
    role = result.scalar_one_or_none()
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
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
        description=f"Restored role: {role.display_name}"
    )
    
    
    return RoleHubRead(
        id=role.id,
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        is_system=role.is_system,
        is_active=role.is_active,
        user_count=0,
        permissions=[f"{rp.permission.resource}:{rp.permission.action}" for rp in role.permissions]
    )




# ============================================================================
# Department Management Endpoints
# ============================================================================

@router.get("/departments", response_model=list[DepartmentHubRead])
async def list_departments_hub(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
    include_inactive: bool = Query(False, description="Include soft-deleted departments")
) -> list[DepartmentHubRead]:
    """List all departments with stats. CRO only."""
    from app.models.department import Department
    from app.models import Risk, Control, User
    
    query = select(Department).options(selectinload(Department.manager)).order_by(Department.name)
    
    if not include_inactive:
        query = query.where(Department.is_active == True)
    
    result = await db.execute(query)
    departments = result.scalars().all()
    
    dept_ids = [d.id for d in departments]
    if not dept_ids:
        return []

    risk_counts = {
        row[0]: row[1]
        for row in (
            await db.execute(select(Risk.department_id, func.count(Risk.id)).where(Risk.department_id.in_(dept_ids)).group_by(Risk.department_id))
        ).all()
    }
    control_counts = {
        row[0]: row[1]
        for row in (
            await db.execute(
                select(Control.department_id, func.count(Control.id))
                .where(Control.department_id.in_(dept_ids))
                .group_by(Control.department_id)
            )
        ).all()
    }
    user_counts = {
        row[0]: row[1]
        for row in (
            await db.execute(
                select(User.department_id, func.count(User.id))
                .where(User.department_id.in_(dept_ids))
                .where(User.is_active == True)
                .group_by(User.department_id)
            )
        ).all()
    }

    return [
        DepartmentHubRead(
            id=dept.id,
            name=dept.name,
            code=dept.code if hasattr(dept, "code") else None,
            manager_id=dept.manager_id,
            manager_name=dept.manager.name if dept.manager else None,
            is_active=dept.is_active,
            user_count=user_counts.get(dept.id, 0),
            risk_count=risk_counts.get(dept.id, 0),
            control_count=control_counts.get(dept.id, 0),
        )
        for dept in departments
    ]


@router.post("/departments", response_model=DepartmentHubRead, status_code=201)
async def create_department(
    data: DepartmentHubCreate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> DepartmentHubRead:
    """Create a new department. CRO only."""
    from app.models.department import Department
    
    # Check for duplicate name
    existing = await db.execute(select(Department).where(Department.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Department name '{data.name}' already exists")
    
    # Check for duplicate code
    effective_code = data.code if data.code else data.name.lower().replace(" ", "_")[:20]
    existing_code = await db.execute(
        select(Department).where(Department.code == effective_code)
    )
    if existing_code.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"Department code '{effective_code}' already exists"
        )
    
    dept = Department(
        name=data.name,
        code=data.code if data.code else data.name.lower().replace(" ", "_")[:20],
        manager_id=data.manager_id,
        is_active=True
    )
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    
    # Reload with manager
    result = await db.execute(
        select(Department).options(selectinload(Department.manager)).where(Department.id == dept.id)
    )
    dept = result.scalar_one()
    
    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.CREATE,
        entity_type=ActivityEntityType.DEPARTMENT,
        entity_id=dept.id,
        entity_name=dept.name,
        description=f"Created department: {dept.name}"
    )
    
    
    return DepartmentHubRead(
        id=dept.id,
        name=dept.name,
        code=dept.code if hasattr(dept, 'code') else None,
        manager_id=dept.manager_id,
        manager_name=dept.manager.name if dept.manager else None,
        is_active=dept.is_active,
        user_count=0,
        risk_count=0,
        control_count=0
    )


@router.patch("/departments/{id}", response_model=DepartmentHubRead)
async def update_department(
    id: int,
    data: DepartmentHubUpdate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> DepartmentHubRead:
    """Update a department. CRO only."""
    from app.models.department import Department
    from app.models import Risk, Control
    
    result = await db.execute(
        select(Department)
        .options(selectinload(Department.manager), selectinload(Department.users))
        .where(Department.id == id)
    )
    dept = result.scalar_one_or_none()
    
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    
    if data.name is not None:
        # Check for duplicate name (excluding current)
        existing = await db.execute(
            select(Department).where(
                Department.name == data.name,
                Department.id != dept.id
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"Department name '{data.name}' already exists"
            )
        dept.name = data.name
    if data.code is not None:
        # Check for duplicate code (excluding current)
        existing_code = await db.execute(
            select(Department).where(
                Department.code == data.code,
                Department.id != dept.id
            )
        )
        if existing_code.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"Department code '{data.code}' already exists"
            )
        dept.code = data.code
    if data.manager_id is not None:
        dept.manager_id = data.manager_id
    
    await db.commit()
    
    # Reload
    result = await db.execute(
        select(Department)
        .options(selectinload(Department.manager), selectinload(Department.users))
        .where(Department.id == dept.id)
    )
    dept = result.scalar_one()
    
    # Get counts
    risk_count_result = await db.execute(
        select(func.count(Risk.id)).where(Risk.department_id == dept.id)
    )
    risk_count = risk_count_result.scalar() or 0
    
    control_count_result = await db.execute(
        select(func.count(Control.id)).where(Control.department_id == dept.id)
    )
    control_count = control_count_result.scalar() or 0
    
    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.DEPARTMENT,
        entity_id=dept.id,
        entity_name=dept.name,
        description=f"Updated department: {dept.name}"
    )
    
    
    return DepartmentHubRead(
        id=dept.id,
        name=dept.name,
        code=dept.code if hasattr(dept, 'code') else None,
        manager_id=dept.manager_id,
        manager_name=dept.manager.name if dept.manager else None,
        is_active=dept.is_active,
        user_count=len([u for u in dept.users if u.is_active]),
        risk_count=risk_count,
        control_count=control_count
    )


@router.delete("/departments/{id}")
async def delete_department(
    id: int,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> dict:
    """Soft-delete a department. CRO only. Cannot delete departments with users/risks/controls."""
    from app.models.department import Department
    from app.models import Risk, Control
    
    result = await db.execute(
        select(Department).options(selectinload(Department.users)).where(Department.id == id)
    )
    dept = result.scalar_one_or_none()
    
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    
    # System departments cannot be deleted
    if hasattr(dept, 'is_system') and dept.is_system:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete system departments"
        )
    
    if not dept.is_active:
        raise HTTPException(status_code=400, detail="Department is already deleted")
    
    active_users = [u for u in dept.users if u.is_active]
    if active_users:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete department with {len(active_users)} active users"
        )
    
    # Check for risks
    risk_count_result = await db.execute(
        select(func.count(Risk.id)).where(Risk.department_id == dept.id)
    )
    risk_count = risk_count_result.scalar() or 0
    if risk_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete department with {risk_count} risks"
        )
    
    # Check for controls
    control_count_result = await db.execute(
        select(func.count(Control.id)).where(Control.department_id == dept.id)
    )
    control_count = control_count_result.scalar() or 0
    if control_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete department with {control_count} controls"
        )
    
    dept.is_active = False
    await db.commit()
    
    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.DELETE,
        entity_type=ActivityEntityType.DEPARTMENT,
        entity_id=dept.id,
        entity_name=dept.name,
        description=f"Deleted department: {dept.name}"
    )
    
    
    return {"status": "deleted", "id": id}


@router.post("/departments/{id}/restore", response_model=DepartmentHubRead)
async def restore_department(
    id: int,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user)
) -> DepartmentHubRead:
    """Restore a soft-deleted department. CRO only."""
    from app.models.department import Department
    
    result = await db.execute(
        select(Department).options(selectinload(Department.manager)).where(Department.id == id)
    )
    dept = result.scalar_one_or_none()
    
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    
    if dept.is_active:
        raise HTTPException(status_code=400, detail="Department is not deleted")
    
    dept.is_active = True
    await db.commit()
    await db.refresh(dept)
    
    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.DEPARTMENT,
        entity_id=dept.id,
        entity_name=dept.name,
        description=f"Restored department: {dept.name}"
    )
    
    
    return DepartmentHubRead(
        id=dept.id,
        name=dept.name,
        code=dept.code if hasattr(dept, 'code') else None,
        manager_id=dept.manager_id,
        manager_name=dept.manager.name if dept.manager else None,
        is_active=dept.is_active,
        user_count=0,
        risk_count=0,
        control_count=0
    )
