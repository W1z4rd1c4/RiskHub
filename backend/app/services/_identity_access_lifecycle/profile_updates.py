from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.config import Settings
from app.core.email import email_equals
from app.core.exceptions import AuthorizationError, NotFoundError, ServiceFailure, ValidationError
from app.core.security import get_password_hash
from app.core.user_query_options import user_selectinload_options
from app.models import Role, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas import UserCreate, UserUpdate
from app.services._org_chart import (
    acquire_org_chart_lock,
    clear_manager_references_for_inactive_user,
    validate_dept_manager_dept_change,
    validate_no_manager_cycle,
)
from app.services._orphaned_items import flag_orphaned_items
from app.services.transaction_boundary import commit_service_boundary

from .execution import log_user_update_and_commit
from .policy import (
    ensure_directory_reenable_allowed,
    ensure_remaining_global_privileged_user,
    ensure_role_change_keeps_privileged_access,
    ensure_sso_local_field_update_allowed,
    is_global_privileged_user,
)


async def flag_orphaned_items_for_deactivation(db: AsyncSession, *, user: User) -> int:
    try:
        created_orphans = await flag_orphaned_items(db, user.id)
    except Exception as exc:
        await db.rollback()
        raise ServiceFailure("Failed to flag orphaned items") from exc
    return len(created_orphans)


async def create_user_profile(
    *,
    db: AsyncSession,
    settings: Settings,
    current_user: User,
    user_data: UserCreate,
) -> User:
    if settings.auth_mode == "microsoft_sso":
        raise AuthorizationError(
            "Manual user creation is disabled in microsoft_sso mode. Use /api/v1/directory/users/{oid}/import."
        )

    result = await db.execute(select(User).where(email_equals(User.email, user_data.email)))
    if result.scalar_one_or_none():
        raise ValidationError("Email already registered")

    new_user = User(
        email=user_data.email,
        name=user_data.name,
        role_id=user_data.role_id,
        department_id=user_data.department_id,
        manager_id=user_data.manager_id,
        is_active=user_data.is_active,
        hashed_password=get_password_hash(user_data.password),
    )

    if new_user.manager_id is not None:
        await acquire_org_chart_lock(db)

    db.add(new_user)
    await db.flush()
    if new_user.manager_id is not None:
        await validate_no_manager_cycle(db, user_id=new_user.id, new_manager_id=new_user.manager_id)

    await log_activity(
        db,
        entity_type=ActivityEntityType.USER,
        entity_id=new_user.id,
        entity_name=new_user.name,
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=new_user.department_id,
    )
    await commit_service_boundary(db, boundary="identity_access.create_user_profile")
    await db.refresh(new_user)

    result = await db.execute(select(User).options(*user_selectinload_options()).where(User.id == new_user.id))
    return result.scalar_one()


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
        raise NotFoundError("User not found")

    if user_data.email and user_data.email != user.email:
        email_check = await db.execute(select(User).where(email_equals(User.email, user_data.email)))
        if email_check.scalar_one_or_none():
            raise ValidationError("Email already registered")

    update_data = user_data.model_dump(exclude_unset=True)
    password_field_provided = "password" in update_data  # gitleaks:allow
    password = update_data.pop("password", None)  # gitleaks:allow

    if settings.auth_mode == "microsoft_sso" and password_field_provided:
        raise AuthorizationError("Password updates are disabled in microsoft_sso mode.")

    ensure_sso_local_field_update_allowed(
        settings=settings,
        user=user,
        update_data=update_data,
        fields={"email", "name", "department_id"},
    )
    ensure_directory_reenable_allowed(user=user, update_data=update_data)

    if "role_id" in update_data:
        new_role_id = update_data["role_id"]
        if new_role_id != user.role_id:
            new_role = (await db.execute(select(Role).where(Role.id == new_role_id))).scalar_one_or_none()
            if not new_role:
                raise ValidationError("Invalid role_id")
            await ensure_role_change_keeps_privileged_access(
                db,
                current_user=current_user,
                user=user,
                new_role=new_role,
            )

    extra_changes: dict[str, dict[str, object]] = {}
    if password is not None:
        user.hashed_password = get_password_hash(password)
        extra_changes["password_changed"] = {"old": None, "new": True}

    is_deactivating = user.is_active is True and update_data.get("is_active") is False
    if is_deactivating and current_user.id == user.id and is_global_privileged_user(user):
        raise ValidationError("Cannot deactivate your own privileged access")
    if is_deactivating and is_global_privileged_user(user):
        await ensure_remaining_global_privileged_user(
            db,
            user=user,
            detail="Cannot deactivate the last admin/CRO user",
        )
    if is_deactivating:
        orphan_count = await flag_orphaned_items_for_deactivation(db, user=user)
        await acquire_org_chart_lock(db)
        await clear_manager_references_for_inactive_user(db, user_id=user.id)
        extra_changes["orphaned_items_flagged"] = {"old": None, "new": orphan_count}

    if "manager_id" in update_data and update_data["manager_id"] != user.manager_id:
        await acquire_org_chart_lock(db)
        await validate_no_manager_cycle(db, user_id=user.id, new_manager_id=update_data["manager_id"])
    if "department_id" in update_data and update_data["department_id"] != user.department_id:
        await acquire_org_chart_lock(db)
        await validate_dept_manager_dept_change(db, user=user, new_department_id=update_data["department_id"])

    changes = build_change_set(user, update_data, extra_changes=extra_changes)
    for field, value in update_data.items():
        setattr(user, field, value)

    return await log_user_update_and_commit(
        db=db,
        user=user,
        current_user=current_user,
        changes=changes or {},
        description="Password updated" if password is not None and not update_data else None,
        log_when_empty=True,
    )
