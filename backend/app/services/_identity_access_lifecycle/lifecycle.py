from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import build_change_set, log_activity
from app.core.config import Settings
from app.core.email import email_equals
from app.core.security import get_password_hash
from app.core.user_query_options import user_selectinload_options
from app.models import Role, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.role import RoleType
from app.models.user import AccessScope
from app.schemas import UserUpdate
from app.schemas.access import AccessUserUpdate
from app.schemas.directory import DirectoryImportRequest, DirectoryImportResponse, DirectoryUserRead
from app.services._access_workflow import (
    ADMIN_PRIVILEGED_ROLES,
    PLATFORM_ADMIN_FIELDS,
    authorize_access_update_fields,
    is_platform_admin,
)
from app.services.ad_deprovision_service import ADDeprovisionService
from app.services.directory_identity_service import (
    DirectoryIdentityConflictError,
    apply_directory_profile,
    requires_break_glass_for_reenable,
    resolve_directory_email,
)
from app.services.orphaned_item_service import OrphanedItemService


@dataclass(frozen=True)
class IdentityImportOutcome:
    status: Literal["created", "updated", "conflict", "skipped", "directory_disabled"]
    user: User | None
    response: DirectoryImportResponse | None = None
    reason: str | None = None


@dataclass(frozen=True)
class AccessProfileUpdateOutcome:
    status: Literal["applied", "blocked", "orphan_flagged", "break_glass_required"]
    user: User
    reason: str | None = None
    orphaned_items_flagged: int = 0


@dataclass(frozen=True)
class AccessScopePlan:
    role_id: int | None
    access_scope: AccessScope | None
    is_platform_admin_visible: bool
    changes: dict


async def _resolve_safe_default_role(db: AsyncSession) -> Role:
    from app.core.policy import SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES

    for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES:
        result = await db.execute(select(Role).where(Role.name == name))
        role = result.scalar_one_or_none()
        if role:
            return role

    candidates = ", ".join(str(name) for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES)
    raise HTTPException(status_code=500, detail=f"No safe default role found ({candidates}). Seed roles first.")


async def _resolve_role_for_directory_import(
    db: AsyncSession,
    *,
    override_role_id: int | None,
) -> Role:
    if override_role_id is not None:
        result = await db.execute(select(Role).where(Role.id == override_role_id).where(Role.is_active.is_(True)))
        role = result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=400, detail="Invalid role_id override")
        return role
    return await _resolve_safe_default_role(db)


def _is_global_privileged_user(user: User) -> bool:
    return bool(user.role and user.role.name in ADMIN_PRIVILEGED_ROLES and user.access_scope == AccessScope.GLOBAL)


async def _ensure_remaining_global_privileged_user(
    db: AsyncSession,
    *,
    user: User,
    detail: str,
    require_active: bool = True,
) -> None:
    query = (
        select(User.id)
        .join(Role)
        .where(Role.name.in_(ADMIN_PRIVILEGED_ROLES))
        .where(User.id != user.id)
        .where(User.access_scope == AccessScope.GLOBAL)
        .limit(1)
    )
    if require_active:
        query = query.where(User.is_active.is_(True))

    remaining = await db.execute(query)
    if not remaining.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _ensure_sso_local_field_update_allowed(
    *,
    settings: Settings,
    user: User,
    update_data: dict,
    fields: set[str],
) -> None:
    if settings.auth_mode != "microsoft_sso" or not user.external_id:
        return
    for field in fields:
        if field in update_data and update_data[field] != getattr(user, field):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"{field} is managed by directory sync for SSO-linked users.",
            )


def _ensure_directory_reenable_allowed(*, user: User, update_data: dict) -> None:
    if update_data.get("is_active") is True and requires_break_glass_for_reenable(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Directory-deprovisioned users require break-glass enable before reactivation.",
        )


async def update_user_profile(
    *,
    db: AsyncSession,
    settings: Settings,
    current_user: User,
    user_id: int,
    user_data: UserUpdate,
) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user_data.email and user_data.email != user.email:
        email_check = await db.execute(select(User).where(email_equals(User.email, user_data.email)))
        if email_check.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    update_data = user_data.model_dump(exclude_unset=True)
    password_field_provided = "password" in update_data  # gitleaks:allow
    password = update_data.pop("password", None)  # gitleaks:allow

    if settings.auth_mode == "microsoft_sso" and password_field_provided:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password updates are disabled in microsoft_sso mode.",
        )

    _ensure_sso_local_field_update_allowed(
        settings=settings,
        user=user,
        update_data=update_data,
        fields={"email", "name", "department_id"},
    )
    _ensure_directory_reenable_allowed(user=user, update_data=update_data)

    if "role_id" in update_data:
        new_role_id = update_data["role_id"]
        if new_role_id != user.role_id:
            new_role = (await db.execute(select(Role).where(Role.id == new_role_id))).scalar_one_or_none()
            if not new_role:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role_id")

            old_role_is_privileged = bool(user.role and user.role.name in ADMIN_PRIVILEGED_ROLES)
            new_role_is_privileged = new_role.name in ADMIN_PRIVILEGED_ROLES
            if current_user.id == user.id and old_role_is_privileged and not new_role_is_privileged:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot demote yourself from admin/CRO role",
                )
            if old_role_is_privileged and not new_role_is_privileged and user.access_scope == AccessScope.GLOBAL:
                await _ensure_remaining_global_privileged_user(
                    db,
                    user=user,
                    detail="Cannot demote the last admin/CRO user",
                )

    extra_changes: dict[str, dict[str, object]] = {}
    if password is not None:
        user.hashed_password = get_password_hash(password)
        extra_changes["password_changed"] = {"old": None, "new": True}

    is_deactivating = user.is_active is True and update_data.get("is_active") is False
    if is_deactivating and current_user.id == user.id and _is_global_privileged_user(user):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate your own privileged access")
    if is_deactivating and _is_global_privileged_user(user):
        await _ensure_remaining_global_privileged_user(
            db,
            user=user,
            detail="Cannot deactivate the last admin/CRO user",
        )
    if is_deactivating:
        try:
            created_orphans = await OrphanedItemService.flag_orphaned_items(db, user.id)
        except Exception as exc:
            await db.rollback()
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to flag orphaned items") from exc
        extra_changes["orphaned_items_flagged"] = {"old": None, "new": len(created_orphans)}

    changes = build_change_set(user, update_data, extra_changes=extra_changes)
    for field, value in update_data.items():
        setattr(user, field, value)

    await log_activity(
        db,
        entity_type=ActivityEntityType.USER,
        entity_id=user.id,
        entity_name=user.name,
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=user.department_id,
        changes=changes,
        description="Password updated" if password is not None and not update_data else None,
    )
    await db.commit()
    await db.refresh(user)

    result = await db.execute(select(User).options(*user_selectinload_options()).where(User.id == user.id))
    return result.scalar_one()


async def import_directory_identity(
    *,
    db: AsyncSession,
    settings: Settings,
    current_user: User,
    directory_user: DirectoryUserRead,
    payload: DirectoryImportRequest,
    provider_name: str,
) -> IdentityImportOutcome:
    normalized_email = resolve_directory_email(directory_user)
    if normalized_email is None:
        raise HTTPException(status_code=400, detail="Directory user is missing an importable email address")

    user = (await db.execute(select(User).where(User.external_id == directory_user.external_id))).scalar_one_or_none()
    import_status: Literal["created", "updated"] = "updated"
    seed_directory_department = False
    if user is None:
        existing_email_user = (
            await db.execute(select(User).where(email_equals(User.email, normalized_email)))
        ).scalar_one_or_none()
        if existing_email_user is not None and existing_email_user.external_id not in (
            None,
            directory_user.external_id,
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Directory identity conflict: email already linked to a different external_id",
            )
        if existing_email_user is not None:
            user = existing_email_user
        else:
            role = await _resolve_role_for_directory_import(db, override_role_id=payload.role_id)
            user = User(
                email=normalized_email,
                name=directory_user.display_name or normalized_email,
                external_id=directory_user.external_id,
                hashed_password=None,
                role_id=role.id,
                is_active=True,
            )
            db.add(user)
            import_status = "created"
            seed_directory_department = True

    if payload.role_id is not None and import_status == "updated":
        role = await _resolve_role_for_directory_import(db, override_role_id=payload.role_id)
        user.role_id = role.id

    try:
        await apply_directory_profile(
            db,
            user=user,
            directory_user=directory_user,
            sync_business_role=settings.entra_business_role_enabled,
            seed_department=seed_directory_department,
        )
    except DirectoryIdentityConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    if directory_user.account_enabled and user.deprovision_reason in ADDeprovisionService.AUTO_DEPROVISION_REASONS:
        user.is_active = True
        user.deprovisioned_at = None
        user.deprovision_reason = None
        user.break_glass_expires_at = None
        user.break_glass_reason = None
        user.break_glass_granted_by_user_id = None

    if not directory_user.account_enabled:
        await ADDeprovisionService.deprovision_user(
            db,
            user=user,
            actor=current_user,
            trigger="directory_import",
            sync_status="directory_disabled",
            deprovision_reason=ADDeprovisionService.DEPROVISION_REASON_DIRECTORY_DISABLED,
        )

    db.add(user)
    await db.flush()

    if directory_user.account_enabled:
        await log_activity(
            db=db,
            actor=current_user,
            action=ActivityAction.CREATE if import_status == "created" else ActivityAction.UPDATE,
            entity_type=ActivityEntityType.USER,
            entity_id=user.id,
            entity_name=user.name,
            description=f"Directory import ({provider_name}) for {user.email}",
        )

    await db.commit()

    refreshed = (
        await db.execute(
            select(User).options(selectinload(User.role), selectinload(User.department)).where(User.id == user.id)
        )
    ).scalar_one()
    response = DirectoryImportResponse(
        status=import_status,
        user_id=refreshed.id,
        email=refreshed.email,
        name=refreshed.name,
        external_id=refreshed.external_id or directory_user.external_id,
        department_id=refreshed.department_id,
        department_name=refreshed.department.name if refreshed.department else None,
        entra_business_role=refreshed.entra_business_role,
        role_id=refreshed.role_id,
        role_name=refreshed.role.name if refreshed.role else None,
        directory_sync_status=refreshed.directory_sync_status,
    )
    return IdentityImportOutcome(status=import_status, user=refreshed, response=response)


async def update_access_profile(
    *,
    db: AsyncSession,
    settings: Settings,
    current_user: User,
    user_id: int,
    user_data: AccessUserUpdate | dict,
) -> User:
    update_data = user_data if isinstance(user_data, dict) else user_data.model_dump(exclude_unset=True)
    result = await db.execute(
        select(User).options(*user_selectinload_options(include_permissions=True)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if is_platform_admin(user) and not is_platform_admin(current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    platform_update = {field: value for field, value in update_data.items() if field in PLATFORM_ADMIN_FIELDS}
    new_role = await authorize_access_update_fields(
        db=db,
        current_user=current_user,
        target_user=user,
        update_data=update_data,
    )

    _ensure_sso_local_field_update_allowed(
        settings=settings,
        user=user,
        update_data=platform_update,
        fields=set(platform_update),
    )
    _ensure_directory_reenable_allowed(user=user, update_data=update_data)

    if "email" in platform_update and platform_update["email"] != user.email:
        email_check = await db.execute(
            select(User.id).where(email_equals(User.email, platform_update["email"])).where(User.id != user.id).limit(1)
        )
        if email_check.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    if new_role is not None:
        old_role_is_privileged = user.role and user.role.name in ADMIN_PRIVILEGED_ROLES
        new_role_is_privileged = new_role.name in ADMIN_PRIVILEGED_ROLES
        if current_user.id == user.id and old_role_is_privileged and not new_role_is_privileged:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote yourself from admin/CRO role",
            )
        if old_role_is_privileged and not new_role_is_privileged:
            await _ensure_remaining_global_privileged_user(
                db,
                user=user,
                detail="Cannot demote the last admin/CRO user",
                require_active=False,
            )

    if "access_scope" in update_data:
        new_scope = AccessScope(update_data["access_scope"])
        update_data["access_scope"] = new_scope
        if current_user.id == user.id and new_scope != AccessScope.GLOBAL:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove your own privileged access",
            )
        if _is_global_privileged_user(user) and new_scope != AccessScope.GLOBAL:
            await _ensure_remaining_global_privileged_user(
                db,
                user=user,
                detail="Cannot remove the last admin/CRO from privileged access",
                require_active=False,
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
    return result.scalar_one()
