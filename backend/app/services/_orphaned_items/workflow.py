from __future__ import annotations

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_user_department_ids
from app.models.asset import Asset
from app.models.control import Control
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.orphaned_item import OrphanedItem
from app.models.process import Process
from app.models.risk import ControlRiskLink, Risk
from app.models.threat import Threat
from app.models.user import User

from .governance import orphan_capability_flags


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
    if orphan.item_type == "threat":
        return None
    if orphan.item_type == "process":
        return (
            await db.execute(
                select(Process.owning_department_id).where(Process.id == orphan.item_id)
            )
        ).scalar_one_or_none()
    if orphan.item_type == "asset":
        return (
            await db.execute(
                select(Asset.owning_department_id).where(Asset.id == orphan.item_id)
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
    return orphan_capability_flags(orphan.item_type, is_pending=orphan.status == "pending")


async def assert_orphan_still_matches_target_state(
    db: AsyncSession,
    *,
    orphan: OrphanedItem,
    target_entity: Risk | Control | KeyRiskIndicator | Threat | Process | Asset,
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

    if orphan.item_type == "threat":
        threat = target_entity
        assert isinstance(threat, Threat)
        if threat.threat_steward_user_id in {None, orphan.previous_owner_id}:
            return
        raise OrphanResolutionConflict(f"Orphaned item {orphan.id} no longer matches current threat state")

    if orphan.item_type == "process":
        process = target_entity
        assert isinstance(process, Process)
        if process.process_owner_user_id in {None, orphan.previous_owner_id}:
            return
        raise OrphanResolutionConflict(
            f"Orphaned item {orphan.id} no longer matches current process state"
        )

    if orphan.item_type == "asset":
        asset = target_entity
        assert isinstance(asset, Asset)
        if orphan.responsibility_role == "business_owner":
            current_owner_id = asset.business_owner_user_id
        elif orphan.responsibility_role == "ict_owner":
            current_owner_id = asset.ict_owner_user_id
        else:
            raise OrphanResolutionConflict(
                f"Orphaned Asset item {orphan.id} has no responsibility role"
            )
        if current_owner_id in {None, orphan.previous_owner_id}:
            return
        raise OrphanResolutionConflict(
            f"Orphaned item {orphan.id} no longer matches current asset state"
        )
