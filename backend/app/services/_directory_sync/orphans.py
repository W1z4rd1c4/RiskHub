from __future__ import annotations

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, User

from .logging import logger


async def detect_orphans(db: AsyncSession, user_id: int) -> dict:
    """
    Detect items that will become orphaned when a user is deactivated.

    Returns dict with lists of affected item IDs.
    """
    from app.models.control import Control
    from app.models.risk import Risk

    # Find risks owned by this user
    risks_result = await db.execute(select(Risk.id).where(Risk.owner_id == user_id))
    risk_ids = [r[0] for r in risks_result.all()]

    # Find controls owned by this user
    controls_result = await db.execute(select(Control.id).where(Control.control_owner_id == user_id))
    control_ids = [c[0] for c in controls_result.all()]

    return {
        "risks": risk_ids,
        "controls": control_ids,
        "total": len(risk_ids) + len(control_ids),
    }


async def cleanup_empty_departments(db: AsyncSession) -> int:
    """
    Move items from empty departments to Uncategorised.
    Empty means no ACTIVE users.
    Returns number of departments cleaned up.
    """
    from app.models.control import Control
    from app.models.risk import Risk

    # Find Uncategorised department
    uncat_result = await db.execute(select(Department).where(Department.code == "UNCAT"))
    uncat_dept = uncat_result.scalar_one_or_none()
    if not uncat_dept:
        logger.error("Uncategorised department not found, skipping cleanup")
        return 0

    # Find empty non-system departments
    # Department is empty if it has NO users with is_active=True
    # We use a left join on users filtering for active ones

    # Subquery for departments with ACTIVE users
    active_dept_ids = (
        select(User.department_id).where(and_(User.department_id.isnot(None), User.is_active.is_(True))).distinct()
    )

    # Select departments NOT in that list
    stmt = select(Department).where(Department.is_system.is_(False)).where(Department.id.not_in(active_dept_ids))

    result = await db.execute(stmt)
    empty_depts = result.scalars().all()

    cleanup_count = 0
    for dept in empty_depts:
        # Move Risks
        await db.execute(update(Risk).where(Risk.department_id == dept.id).values(department_id=uncat_dept.id))
        # Move Controls
        await db.execute(update(Control).where(Control.department_id == dept.id).values(department_id=uncat_dept.id))
        cleanup_count += 1
        logger.info(f"Cleaned up empty department {dept.name} ({dept.code}) - items moved to Uncategorised")

    if cleanup_count > 0:
        await db.commit()

    return cleanup_count

