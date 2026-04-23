"""Access management endpoints with privileged gating."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.activity_logger import build_change_set, log_activity
from app.core.config import Settings, get_settings
from app.core.email import email_equals
from app.core.permissions import get_effective_permissions, get_scope_label, is_privileged_user
from app.core.user_query_options import user_selectinload_options
from app.db.session import get_db
from app.models import Role, RolePermission, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.role import RoleType
from app.models.user import AccessScope
from app.schemas.access import AccessUserRead, AccessUserUpdate, PermissionRead, RoleWithPermissions
from app.services.directory_identity_service import requires_break_glass_for_reenable

router = APIRouter()

ADMIN_PRIVILEGED_ROLES: set[RoleType] = {RoleType.ADMIN, RoleType.CRO}
PLATFORM_ADMIN_FIELDS = {"name", "email"}
BUSINESS_ACCESS_FIELDS = {"department_id", "manager_id", "access_scope"}


def _require_privileged(user: User) -> None:
    """
    Require that the user has global (privileged) access scope.

    Used for endpoints that are restricted to platform-wide admins.
    Raises 403 if user lacks GLOBAL access scope.
    """
    if not is_privileged_user(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


def _is_platform_admin(user: User) -> bool:
    return bool(user.role and user.role.name == RoleType.ADMIN)


def _is_cro(user: User) -> bool:
    return bool(user.role and user.role.name == RoleType.CRO)


def _can_manage_privileged_status(user: User) -> bool:
    """
    Check if user can submit access-management mutations.

    Field-level checks split platform Admin and CRO authority after this
    coarse write gate. Not all privileged users can use this write surface.
    """
    return _is_platform_admin(user) or _is_cro(user)


def _require_access_user_write(user: User) -> None:
    """
    Require explicit admin/CRO authority for access-management mutations.

    Read/list endpoints may be available to global privileged users, but any
    write to access-user fields is restricted to admin/CRO roles.
    """
    if not _can_manage_privileged_status(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin or CRO can update user access settings",
        )


async def _get_role_or_400(db: AsyncSession, role_id: int) -> Role:
    role_result = await db.execute(select(Role).where(Role.id == role_id))
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role_id")
    return role


async def _authorize_access_update_fields(
    *,
    db: AsyncSession,
    current_user: User,
    target_user: User,
    update_data: dict,
) -> Role | None:
    if _is_platform_admin(target_user) and not _is_platform_admin(current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    platform_update = {field: value for field, value in update_data.items() if field in PLATFORM_ADMIN_FIELDS}
    business_update = {field: value for field, value in update_data.items() if field in BUSINESS_ACCESS_FIELDS}
    new_role: Role | None = None

    if platform_update and not _is_platform_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin can update user identity fields",
        )

    if business_update and not _is_cro(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only CRO can update user business access fields",
        )

    if "role_id" not in update_data or update_data["role_id"] == target_user.role_id:
        return None

    new_role = await _get_role_or_400(db, update_data["role_id"])
    assigning_admin = new_role.name == RoleType.ADMIN

    if assigning_admin and not _is_platform_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Admin can assign the Admin role")
    if not assigning_admin and not _is_cro(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only CRO can assign business roles")

    return new_role


def _build_access_user_read(user: User) -> AccessUserRead:
    return AccessUserRead(
        id=user.id,
        email=user.email,
        name=user.name,
        is_active=user.is_active,
        role_id=user.role_id,
        role=user.role,
        department_id=user.department_id,
        department_name=user.department.name if user.department else None,
        manager_id=user.manager_id,
        manager_name=user.manager.name if user.manager else None,
        access_scope=user.access_scope,
        scope_label=get_scope_label(user),
        effective_permissions=get_effective_permissions(user),
        external_id=user.external_id,
        job_title=user.job_title,
        entra_business_role=user.entra_business_role,
        directory_last_checked_at=user.directory_last_checked_at,
        directory_last_seen_at=user.directory_last_seen_at,
        directory_sync_status=user.directory_sync_status,
        deprovisioned_at=user.deprovisioned_at,
        deprovision_reason=user.deprovision_reason,
    )


def _build_role_with_permissions(role: Role) -> RoleWithPermissions:
    permissions = [PermissionRead.model_validate(rp.permission) for rp in role.permissions]
    return RoleWithPermissions(
        id=role.id,
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        permissions=permissions,
    )


@router.get("/users", response_model=list[AccessUserRead])
async def list_access_users(
    department_id: int | None = None,
    role_id: int | None = None,
    access_scope: AccessScope | None = None,
    is_privileged: bool | None = None,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List users for access management with scope filters."""
    _require_privileged(current_user)

    query = select(User).options(*user_selectinload_options(include_permissions=True))
    if not _is_platform_admin(current_user):
        query = query.join(Role).where(Role.name != RoleType.ADMIN)

    if department_id is not None:
        query = query.where(User.department_id == department_id)
    if role_id is not None:
        query = query.where(User.role_id == role_id)
    if access_scope is not None:
        query = query.where(User.access_scope == access_scope)
    if is_privileged is not None:
        if is_privileged:
            query = query.where(User.access_scope == AccessScope.GLOBAL)
        else:
            query = query.where(User.access_scope != AccessScope.GLOBAL)

    result = await db.execute(query)
    users = result.scalars().all()
    return [_build_access_user_read(user) for user in users]


@router.get("/users/my-department", response_model=list[AccessUserRead])
async def list_department_access_users(
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List users in current user's department with their access info.
    Available to department heads and privileged users.
    Returns only users in the caller's department.
    """
    from app.models.role import RoleType

    # Allow department heads and privileged users
    is_dept_head = current_user.role and current_user.role.name == RoleType.DEPARTMENT_HEAD
    is_priv = is_privileged_user(current_user)

    if not is_dept_head and not is_priv:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only department heads or privileged users can view department access",
        )

    if not current_user.department_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You are not assigned to a department")

    query = (
        select(User)
        .options(*user_selectinload_options(include_permissions=True))
        .join(Role)
        .where(User.department_id == current_user.department_id)
        .where(User.is_active.is_(True))
    )
    if not _is_platform_admin(current_user):
        query = query.where(Role.name != RoleType.ADMIN)

    result = await db.execute(query)
    users = result.scalars().all()
    return [_build_access_user_read(user) for user in users]


@router.get("/roles", response_model=list[RoleWithPermissions])
async def list_access_roles(
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List roles with permissions for access management UI."""
    _require_privileged(current_user)

    query = (
        select(Role)
        .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
        .where(Role.is_active.is_(True))
    )
    if not _is_platform_admin(current_user):
        query = query.where(Role.name != RoleType.ADMIN)

    result = await db.execute(query)
    roles = result.scalars().all()
    return [_build_role_with_permissions(role) for role in roles]


@router.patch("/users/{user_id}", response_model=AccessUserRead)
async def update_access_user(
    user_id: int,
    user_data: AccessUserUpdate,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """
    Update access management fields for a user.

    Note: write access is stricter than read/list access. Admin owns platform
    identity fields and Admin-role assignment. CRO owns business access fields,
    non-admin role assignment, and local department assignment.
    """
    _require_privileged(current_user)
    _require_access_user_write(current_user)

    result = await db.execute(
        select(User).options(*user_selectinload_options(include_permissions=True)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if _is_platform_admin(user) and not _is_platform_admin(current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    update_data = user_data.model_dump(exclude_unset=True)
    platform_update = {field: value for field, value in update_data.items() if field in PLATFORM_ADMIN_FIELDS}
    new_role = await _authorize_access_update_fields(
        db=db,
        current_user=current_user,
        target_user=user,
        update_data=update_data,
    )

    if settings.auth_mode == "microsoft_sso" and user.external_id:
        for field, value in platform_update.items():
            if value != getattr(user, field):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"{field} is managed by directory sync for SSO-linked users.",
                )

    if update_data.get("is_active") is True and requires_break_glass_for_reenable(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Directory-deprovisioned users require break-glass enable before reactivation.",
        )

    if "email" in platform_update and platform_update["email"] != user.email:
        email_check = await db.execute(
            select(User.id).where(email_equals(User.email, platform_update["email"])).where(User.id != user.id).limit(1)
        )
        if email_check.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    # Role change guardrails
    if new_role is not None:
        old_role_is_privileged = user.role and user.role.name in ADMIN_PRIVILEGED_ROLES
        new_role_is_privileged = new_role.name in ADMIN_PRIVILEGED_ROLES

        # Prevent demoting yourself from admin/CRO
        if current_user.id == user.id and old_role_is_privileged and not new_role_is_privileged:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot demote yourself from admin/CRO role"
            )

        # Prevent demoting the last admin/CRO
        if old_role_is_privileged and not new_role_is_privileged:
            remaining = await db.execute(
                select(User.id)
                .join(Role)
                .where(Role.name.in_(ADMIN_PRIVILEGED_ROLES))
                .where(User.id != user.id)
                .where(User.access_scope == AccessScope.GLOBAL)
                .limit(1)
            )
            if not remaining.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot demote the last admin/CRO user"
                )

    if "access_scope" in update_data:
        new_scope = AccessScope(update_data["access_scope"])
        update_data["access_scope"] = new_scope

        if current_user.id == user.id and new_scope != AccessScope.GLOBAL:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove your own privileged access",
            )

        if (
            user.role
            and user.role.name in ADMIN_PRIVILEGED_ROLES
            and user.access_scope == AccessScope.GLOBAL
            and new_scope != AccessScope.GLOBAL
        ):
            remaining = await db.execute(
                select(User.id)
                .join(Role)
                .where(Role.name.in_(ADMIN_PRIVILEGED_ROLES))
                .where(User.id != user.id)
                .where(User.access_scope == AccessScope.GLOBAL)
                .limit(1)
            )
            if not remaining.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot remove the last admin/CRO from privileged access",
                )

    changes = build_change_set(user, update_data)

    for field, value in update_data.items():
        setattr(user, field, value)

    if changes:
        await log_activity(
            db,
            entity_type=ActivityEntityType.USER,
            entity_id=user.id,
            entity_name=user.name,
            action=ActivityAction.UPDATE,
            actor=current_user,
            department_id=user.department_id,
            changes=changes,
        )

    await db.commit()
    await db.refresh(user)

    result = await db.execute(
        select(User).options(*user_selectinload_options(include_permissions=True)).where(User.id == user.id)
    )
    return _build_access_user_read(result.scalar_one())
