from __future__ import annotations

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_user_department_ids
from app.models.control import Control
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.orphaned_item import OrphanedItem
from app.models.risk import ControlRiskLink, Risk
from app.models.user import User


class OrphanResolutionConflict(ValueError):
    """Raised when an orphan resolution no longer matches current state."""


async def _uncategorised_department_id(db: AsyncSession) -> int | None:
    from app.models.department import Department

    return (await db.execute(select(Department.id).where(Department.code == "UNCAT"))).scalar_one_or_none()


async def get_orphan_item_department_id(db: AsyncSession, orphan: OrphanedItem) -> int | None:
    if orphan.item_type == "risk":
        return (await db.execute(select(Risk.department_id).where(Risk.id == orphan.item_id))).scalar_one_or_none()
    if orphan.item_type == "control":
        return (
            await db.execute(select(Control.department_id).where(Control.id == orphan.item_id))
        ).scalar_one_or_none()
    if orphan.item_type == "kri":
        return (
            await db.execute(
                select(Risk.department_id)
                .select_from(KeyRiskIndicator)
                .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
                .where(KeyRiskIndicator.id == orphan.item_id)
            )
        ).scalar_one_or_none()
    return None


async def can_view_orphan(db: AsyncSession, current_user: User, orphan: OrphanedItem) -> bool:
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is None:
        return True
    if not dept_ids:
        return False
    return await get_orphan_item_department_id(db, orphan) in set(dept_ids)


def orphan_capabilities(orphan: OrphanedItem) -> dict[str, bool]:
    is_pending = orphan.status == "pending"
    return {
        "can_resolve": is_pending,
        "can_view_detail": True,
        "requires_owner": orphan.item_type in {"risk", "control"},
        "requires_risk": orphan.item_type == "kri",
        "requires_department": orphan.item_type in {"risk", "control"},
    }


async def assert_orphan_still_matches_target_state(
    db: AsyncSession,
    *,
    orphan: OrphanedItem,
    target_entity: Risk | Control | KeyRiskIndicator,
) -> None:
    uncat_dept_id = await _uncategorised_department_id(db)

    if orphan.item_type == "risk":
        risk = target_entity
        assert isinstance(risk, Risk)
        if risk.owner_id in {None, orphan.previous_owner_id} or risk.department_id == uncat_dept_id:
            return
        raise OrphanResolutionConflict(f"Orphaned item {orphan.id} no longer matches current risk state")

    if orphan.item_type == "control":
        control = target_entity
        assert isinstance(control, Control)
        has_link = await db.scalar(select(exists().where(ControlRiskLink.control_id == control.id)))
        if (
            control.control_owner_id in {None, orphan.previous_owner_id}
            or control.department_id == uncat_dept_id
            or not has_link
        ):
            return
        raise OrphanResolutionConflict(f"Orphaned item {orphan.id} no longer matches current control state")

    if orphan.item_type == "kri":
        kri = target_entity
        assert isinstance(kri, KeyRiskIndicator)
        risk_department_id = (
            await db.execute(select(Risk.department_id).where(Risk.id == kri.risk_id))
        ).scalar_one_or_none()
        if risk_department_id == uncat_dept_id:
            return
        raise OrphanResolutionConflict(f"Orphaned item {orphan.id} no longer matches current KRI state")
