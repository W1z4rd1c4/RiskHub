from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set
from app.core.config import Settings
from app.core.email import email_equals
from app.core.exceptions import NotFoundError, ValidationError
from app.core.user_query_options import user_selectinload_options
from app.models import User
from app.models.user import AccessScope
from app.schemas.access import AccessUserUpdate
from app.services._access_workflow import (
    PLATFORM_ADMIN_FIELDS,
    authorize_access_update_fields,
    is_platform_admin,
)
from app.services._org_chart import (
    acquire_org_chart_lock,
    validate_dept_manager_dept_change,
    validate_no_manager_cycle,
)

from .execution import log_user_update_and_commit
from .policy import (
    ensure_directory_reenable_allowed,
    ensure_remaining_global_privileged_user,
    ensure_role_change_keeps_privileged_access,
    ensure_sso_local_field_update_allowed,
    is_global_privileged_user,
)


def normalize_access_scope_update(update_data: dict) -> None:
    if "access_scope" in update_data:
        update_data["access_scope"] = AccessScope(update_data["access_scope"])


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
        raise NotFoundError("User not found")
    if is_platform_admin(user) and not is_platform_admin(current_user):
        raise NotFoundError("User not found")

    platform_update = {field: value for field, value in update_data.items() if field in PLATFORM_ADMIN_FIELDS}
    new_role = await authorize_access_update_fields(
        db=db,
        current_user=current_user,
        target_user=user,
        update_data=update_data,
    )

    ensure_sso_local_field_update_allowed(
        settings=settings,
        user=user,
        update_data=platform_update,
        fields=set(platform_update),
    )
    ensure_directory_reenable_allowed(user=user, update_data=update_data)

    if "email" in platform_update and platform_update["email"] != user.email:
        email_check = await db.execute(
            select(User.id).where(email_equals(User.email, platform_update["email"])).where(User.id != user.id).limit(1)
        )
        if email_check.scalar_one_or_none():
            raise ValidationError("Email already registered")

    if new_role is not None:
        await ensure_role_change_keeps_privileged_access(
            db,
            current_user=current_user,
            user=user,
            new_role=new_role,
            require_active=False,
        )

    if "access_scope" in update_data:
        normalize_access_scope_update(update_data)
        if current_user.id == user.id and update_data["access_scope"] != AccessScope.GLOBAL:
            raise ValidationError("Cannot remove your own privileged access")
        if is_global_privileged_user(user) and update_data["access_scope"] != AccessScope.GLOBAL:
            await ensure_remaining_global_privileged_user(
                db,
                user=user,
                detail="Cannot remove the last admin/CRO from privileged access",
                require_active=False,
            )

    if "manager_id" in update_data and update_data["manager_id"] != user.manager_id:
        await acquire_org_chart_lock(db)
        await validate_no_manager_cycle(db, user_id=user.id, new_manager_id=update_data["manager_id"])
    if "department_id" in update_data and update_data["department_id"] != user.department_id:
        await acquire_org_chart_lock(db)
        await validate_dept_manager_dept_change(db, user=user, new_department_id=update_data["department_id"])

    changes = build_change_set(user, update_data)
    for field, value in update_data.items():
        setattr(user, field, value)

    return await log_user_update_and_commit(
        db=db,
        user=user,
        current_user=current_user,
        changes=changes or {},
        include_permissions=True,
    )
