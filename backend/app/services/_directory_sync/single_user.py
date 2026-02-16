from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, User

from .departments import _get_or_create_department
from .logging import logger
from .normalize import _display_name, _normalize_email, _normalize_text
from .orphans import cleanup_empty_departments, detect_orphans
from .roles import _resolve_default_role


async def sync_single_user(
    db: AsyncSession,
    user_data: dict,
    event_type: str,
) -> dict:
    """
    Sync a single user based on webhook event.

    Args:
        db: Database session
        user_data: User data from webhook payload
        event_type: One of "user.created", "user.updated", "user.deactivated", "user.activated"

    Returns:
        Dict with action taken, user_id, and orphaned_items (for deactivation)
    """
    external_id = user_data.get("external_id")
    if not external_id:
        raise ValueError("Missing external_id in user data")

    # Find existing user
    result = await db.execute(select(User).where(User.external_id == external_id))
    user = result.scalar_one_or_none()

    # Also try to find by email if not found by external_id
    if not user and user_data.get("email"):
        email = _normalize_email(user_data.get("email"))
        if email:
            result = await db.execute(select(User).where(func.lower(User.email) == email))
            user = result.scalar_one_or_none()

    orphaned_items = {"risks": [], "controls": [], "total": 0}

    if event_type == "user.deactivated":
        if not user:
            logger.warning(f"Cannot deactivate unknown user: {external_id}")
            return {
                "action": "not_found",
                "user_id": None,
                "orphaned_items": orphaned_items,
            }

        # Flag orphaned items before deactivating
        from app.services.orphaned_item_service import OrphanedItemService

        flagged_items = await OrphanedItemService.flag_orphaned_items(db, user.id)

        # Detect orphans for the response
        orphaned_items = await detect_orphans(db, user.id)
        if orphaned_items["total"] > 0:
            logger.warning(
                f"Deactivating user {user.email} - flagged "
                f"{len(orphaned_items['risks'])} risks and "
                f"{len(orphaned_items['controls'])} controls as orphaned"
            )

        user.is_active = False
        await db.commit()

        return {
            "action": "deactivated",
            "user_id": user.id,
            "orphaned_items": orphaned_items,
            "flagged_count": len(flagged_items),
        }

    elif event_type == "user.activated":
        if not user:
            logger.warning(f"Cannot activate unknown user: {external_id}")
            return {
                "action": "not_found",
                "user_id": None,
                "orphaned_items": orphaned_items,
            }

        user.is_active = True
        await db.commit()

        return {
            "action": "activated",
            "user_id": user.id,
            "orphaned_items": orphaned_items,
        }

    elif event_type in ("user.created", "user.updated"):
        # Load caches for department handling
        departments = (await db.execute(select(Department))).scalars().all()
        dept_cache = {d.name.lower(): d for d in departments}
        existing_codes = {d.code.upper() for d in departments if d.code}

        target_email = _normalize_email(user_data.get("email"))
        target_name = _display_name(user_data, target_email)
        target_department = _normalize_text(user_data.get("department"))
        target_active = user_data.get("account_enabled", True)
        target_employee_type = user_data.get("employee_type", "employee")

        if user:
            # UPDATE existing user
            dept = await _get_or_create_department(db, target_department, dept_cache, existing_codes)

            user.email = target_email or user.email
            user.name = target_name
            user.is_active = target_active
            user.external_id = external_id
            user.employee_type = target_employee_type
            if dept:
                user.department_id = dept.id

            await db.commit()

            return {
                "action": "updated",
                "user_id": user.id,
                "orphaned_items": orphaned_items,
            }
        else:
            # CREATE new user
            default_role = await _resolve_default_role(db)
            dept = await _get_or_create_department(db, target_department, dept_cache, existing_codes)

            user = User(
                email=target_email,
                name=target_name,
                is_active=target_active,
                external_id=external_id,
                role_id=default_role.id,
                department_id=dept.id if dept else None,
                employee_type=target_employee_type,
                hashed_password=None,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

            # Cleanup (fire and forget check)
            try:
                await cleanup_empty_departments(db)
            except Exception as e:
                logger.error(f"Failed to cleanup empty departments in single sync: {e}")

            return {
                "action": "created",
                "user_id": user.id,
                "orphaned_items": orphaned_items,
            }

    else:
        raise ValueError(f"Unknown event type: {event_type}")

