from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_user_department_ids
from app.models import Control, ControlRiskLink, Risk, User


def _build_pending_changes(control: Control, update_data: dict) -> dict:
    """
    Build pending_changes dict for approval requests.
    Normalizes enum-like values to .value strings.
    Returns: {field: {"old": old_value, "new": new_value}, ...}
    """
    return {
        k: {
            "old": getattr(control, k, None),
            "new": v.value if hasattr(v, "value") else v,
        }
        for k, v in update_data.items()
    }


async def _first_high_risk_linked_risk(db: AsyncSession, control_id: int) -> tuple[bool, Risk | None]:
    """
    Scan linked risks for the first one that qualifies as high-risk for approvals.

    Returns:
        (is_high_risk, risk): Tuple of whether a high-risk link exists and the first such risk (or None).
    """
    from app.core.permissions import is_high_risk_for_approval_async

    result = await db.execute(
        select(Risk).join(ControlRiskLink).where(ControlRiskLink.control_id == control_id)
    )
    for risk in result.scalars():
        if await is_high_risk_for_approval_async(risk, db):
            return True, risk
    return False, None


async def _apply_department_scoping(
    db: AsyncSession,
    query,
    current_user: User,
    department_id_filter: int | None,
):
    """
    Apply department-based scoping to a Control query.

    - Restricted users see only their departments + controls they own
    - Privileged users can optionally filter by department_id
    """
    from app.core.permissions import get_control_ids_where_owner

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:  # User is restricted to specific departments
        control_owner_ids = await get_control_ids_where_owner(db, current_user.id)
        if control_owner_ids:
            query = query.where(
                or_(
                    Control.department_id.in_(dept_ids),
                    Control.id.in_(control_owner_ids),
                )
            )
        else:
            query = query.where(Control.department_id.in_(dept_ids))
    elif department_id_filter:  # Privileged user can filter by specific department
        query = query.where(Control.department_id == department_id_filter)

    return query


def _apply_process_category_filters(query, process: str | None, category: str | None):
    """
    Apply optional process/category filters via linked Risk.
    Only applies if at least one filter is provided.
    """
    if not process and not category:
        return query

    query = query.join(Control.risk_links).join(ControlRiskLink.risk)
    if process:
        query = query.where(Risk.process == process)
    if category:
        query = query.where(Risk.category == category)
    return query.distinct()
