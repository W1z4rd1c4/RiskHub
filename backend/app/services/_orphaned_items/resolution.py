from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import utc_now
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.control import Control
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.orphaned_item import OrphanedItem
from app.models.risk import Risk
from app.models.user import User

from .logging import logger
from .workflow import OrphanResolutionConflict, assert_orphan_still_matches_target_state


async def _get_fallback_owner_id(db: AsyncSession) -> int | None:
    """Find a fallback owner (first admin) for headless items."""
    from app.models.role import Role, RoleType

    result = await db.execute(select(User.id).join(Role).where(Role.name == RoleType.ADMIN).limit(1))
    return result.scalar_one_or_none()


@dataclass
class OrphanResolutionContext:
    orphan: OrphanedItem
    new_owner: User | None
    target_risk: Risk | None
    target_department_id: int | None


async def validate_resolution_context(
    db: AsyncSession,
    *,
    orphan_id: int,
    new_owner_id: int | None = None,
    department_id: int | None = None,
    target_risk_id: int | None = None,
    for_update: bool = False,
) -> OrphanResolutionContext:
    orphan_stmt = select(OrphanedItem).where(OrphanedItem.id == orphan_id)
    if for_update:
        orphan_stmt = orphan_stmt.with_for_update()
    result = await db.execute(orphan_stmt)
    orphan = result.scalar_one_or_none()

    if not orphan:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if orphan.status != "pending":
        raise OrphanResolutionConflict(f"Orphaned item {orphan_id} is already resolved")

    new_owner = None
    if new_owner_id is not None:
        owner_result = await db.execute(select(User).where(User.id == new_owner_id))
        new_owner = owner_result.scalar_one_or_none()
        if not new_owner:
            raise ValueError(f"New owner {new_owner_id} not found")
        if not new_owner.is_active:
            raise ValueError(f"New owner {new_owner_id} is not active")

    target_risk = None
    if target_risk_id is not None:
        target_risk_result = await db.execute(select(Risk).where(Risk.id == target_risk_id))
        target_risk = target_risk_result.scalar_one_or_none()
        if not target_risk:
            raise ValueError(f"Target risk {target_risk_id} not found")

    if orphan.item_type == "risk":
        if new_owner is None:
            raise ValueError("new_owner_id is required to resolve orphaned risks")
        if target_risk is not None:
            raise ValueError("target_risk_id is not supported for orphaned risks")
        target_department_id = department_id if department_id is not None else new_owner.department_id
        if target_department_id is None:
            raise ValueError("department_id is required when the new owner has no department")
        if new_owner.department_id is not None and target_department_id != new_owner.department_id:
            raise ValueError("Risk reassignment must stay within the new owner's department")
        return OrphanResolutionContext(orphan, new_owner, None, target_department_id)

    if orphan.item_type == "control":
        if new_owner is None:
            raise ValueError("new_owner_id is required to resolve orphaned controls")
        target_department_id = department_id if department_id is not None else new_owner.department_id
        if target_department_id is None:
            raise ValueError("department_id is required when the new owner has no department")
        if new_owner.department_id is not None and target_department_id != new_owner.department_id:
            raise ValueError("Control reassignment must stay within the new owner's department")
        if target_risk is not None and target_risk.department_id != target_department_id:
            raise ValueError("target_risk_id must belong to the target department")
        return OrphanResolutionContext(orphan, new_owner, target_risk, target_department_id)

    if orphan.item_type == "kri":
        if target_risk is None:
            raise ValueError("target_risk_id is required to resolve orphaned KRIs")
        target_department_id = department_id if department_id is not None else target_risk.department_id
        if target_department_id != target_risk.department_id:
            raise ValueError("KRI reassignment must stay within the target risk department")
        return OrphanResolutionContext(orphan, new_owner, target_risk, target_department_id)

    raise ValueError(f"Unsupported orphaned item type: {orphan.item_type}")


async def resolve_orphan(
    db: AsyncSession,
    orphan_id: int,
    resolved_by_id: int,
    new_owner_id: int | None = None,
    department_id: int | None = None,
    target_risk_id: int | None = None,
) -> OrphanedItem:
    """
    Resolve an orphaned item by assigning a new owner.

    Args:
        db: Database session
        orphan_id: ID of the orphaned_item record
        resolved_by_id: ID of admin who resolved this
        new_owner_id: Optional ID of new owner to assign
        department_id: Optional department to assign
        target_risk_id: Optional risk ID to link item to

    Returns:
        Updated OrphanedItem record

    Raises:
        ValueError: If orphan not found or already resolved
    """
    context = await validate_resolution_context(
        db,
        orphan_id=orphan_id,
        new_owner_id=new_owner_id,
        department_id=department_id,
        target_risk_id=target_risk_id,
        for_update=True,
    )
    orphan = context.orphan
    target_risk = context.target_risk
    target_dept_id = context.target_department_id
    resolving_user = await db.get(User, resolved_by_id)

    # Update the actual item's owner and department
    if orphan.item_type == "risk":
        risk_result = await db.execute(select(Risk).where(Risk.id == orphan.item_id).with_for_update())
        risk = risk_result.scalar_one_or_none()
        if not risk:
            raise ValueError(f"Risk {orphan.item_id} no longer exists")
        await assert_orphan_still_matches_target_state(db, orphan=orphan, target_entity=risk)
        risk_changes = build_change_set(
            risk,
            {
                "owner_id": new_owner_id,
                "department_id": target_dept_id,
            },
        )
        risk.owner_id = new_owner_id
        risk.department_id = target_dept_id
        await log_activity(
            db,
            entity_type=ActivityEntityType.RISK,
            entity_id=risk.id,
            entity_name=risk.name,
            safe_entity_label=risk.risk_id_code,
            action=ActivityAction.UPDATE,
            actor=resolving_user,
            department_id=target_dept_id,
            changes=risk_changes,
            description=f"Resolved orphaned risk via governance workflow #{orphan.id}",
        )
        logger.info("Reassigned risk %s to user %s, dept %s", risk.id, new_owner_id, target_dept_id)

    elif orphan.item_type == "control":
        control_result = await db.execute(select(Control).where(Control.id == orphan.item_id).with_for_update())
        control = control_result.scalar_one_or_none()
        if not control:
            raise ValueError(f"Control {orphan.item_id} no longer exists")
        await assert_orphan_still_matches_target_state(db, orphan=orphan, target_entity=control)
        control_changes = build_change_set(
            control,
            {
                "control_owner_id": new_owner_id,
                "department_id": target_dept_id,
            },
        )
        control.control_owner_id = new_owner_id
        control.department_id = target_dept_id

        if target_risk is not None:
            from app.models.risk import ControlRiskLink

            link_res = await db.execute(
                select(ControlRiskLink).where(
                    ControlRiskLink.control_id == control.id,
                    ControlRiskLink.risk_id == target_risk.id,
                )
            )
            if not link_res.scalar_one_or_none():
                link = ControlRiskLink(
                    control_id=control.id,
                    risk_id=target_risk.id,
                    effectiveness="partially_effective",
                )
                db.add(link)
                control_changes = control_changes or {}
                control_changes["target_risk_id"] = {"old": None, "new": target_risk.id}

        await log_activity(
            db,
            entity_type=ActivityEntityType.CONTROL,
            entity_id=control.id,
            entity_name=control.name,
            action=ActivityAction.UPDATE,
            actor=resolving_user,
            department_id=target_dept_id,
            changes=control_changes,
            description=f"Resolved orphaned control via governance workflow #{orphan.id}",
        )
        logger.info("Reassigned control %s to user %s, dept %s", control.id, new_owner_id, target_dept_id)

    elif orphan.item_type == "kri":
        kri_result = await db.execute(
            select(KeyRiskIndicator).where(KeyRiskIndicator.id == orphan.item_id).with_for_update()
        )
        kri = kri_result.scalar_one_or_none()
        if not kri:
            raise ValueError(f"KRI {orphan.item_id} no longer exists")
        await assert_orphan_still_matches_target_state(db, orphan=orphan, target_entity=kri)
        if target_risk is None:
            raise ValueError("target_risk_id is required to resolve orphaned KRIs")
        kri_changes = build_change_set(kri, {"risk_id": target_risk.id})
        kri.risk_id = target_risk.id
        await log_activity(
            db,
            entity_type=ActivityEntityType.KRI,
            entity_id=kri.id,
            entity_name=kri.metric_name,
            safe_entity_label=kri.metric_name,
            action=ActivityAction.UPDATE,
            actor=resolving_user,
            department_id=target_dept_id,
            changes=kri_changes,
            description=f"Resolved orphaned KRI via governance workflow #{orphan.id}",
        )
        logger.info("Resolved KRI %s by linking to risk %s", kri.id, target_risk.id)

    # Mark orphan as resolved
    orphan.status = "resolved"
    orphan.resolved_at = utc_now()
    orphan.resolved_by_id = resolved_by_id
    orphan.new_owner_id = new_owner_id

    await db.commit()

    return orphan
