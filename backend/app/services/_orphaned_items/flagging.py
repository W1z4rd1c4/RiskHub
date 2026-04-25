from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models.control import Control
from app.models.department import Department
from app.models.orphaned_item import OrphanedItem
from app.models.risk import Risk

from .core import _already_flagged, _create_orphan
from .logging import logger
from .resolution import _get_fallback_owner_id


async def flag_orphaned_items(db: AsyncSession, user_id: int) -> list[OrphanedItem]:
    """
    Flag all items owned by a user as orphaned.

    Called when a user is being deactivated.

    Args:
        db: Database session
        user_id: ID of user being deactivated

    Returns:
        List of created OrphanedItem records
    """
    created_records = []

    # Find risks owned by this user
    risks_result = await db.execute(select(Risk).where(Risk.owner_id == user_id))
    risks = risks_result.scalars().all()

    for risk in risks:
        if await _already_flagged(db, "risk", risk.id):
            continue
        orphan = await _create_orphan(db, "risk", risk.id, user_id)
        created_records.append(orphan)

    # Find controls owned by this user
    controls_result = await db.execute(select(Control).where(Control.control_owner_id == user_id))
    controls = controls_result.scalars().all()

    for control in controls:
        if await _already_flagged(db, "control", control.id):
            continue
        orphan = await _create_orphan(db, "control", control.id, user_id)
        created_records.append(orphan)

    await db.flush()

    logger.info(
        f"Flagged {len(created_records)} orphaned items for user {user_id}: "
        f"{len(risks)} risks, {len(controls)} controls"
    )

    return created_records


async def scan_uncategorised_items(db: AsyncSession) -> int:
    """
    Scan for items in 'Uncategorised' department and flag them as orphans.

    Returns number of newly flagged items.
    """
    # Find Uncategorised department
    uncat_result = await db.execute(select(Department).where(Department.code == "UNCAT"))
    uncat_dept = uncat_result.scalar_one_or_none()

    if not uncat_dept:
        return 0

    new_orphans_count = 0
    fallback_owner_id = await _get_fallback_owner_id(db)

    processed_risk_ids = set()
    processed_control_ids = set()

    # 1. Scan Risks
    # Find risks in UNCAT that are NOT in orphaned_items (pending)

    pending_risk_ids_stmt = select(OrphanedItem.item_id).where(
        OrphanedItem.item_type == "risk",
        OrphanedItem.status == "pending",
    )

    risk_stmt = select(Risk).where(Risk.department_id == uncat_dept.id).where(Risk.id.not_in(pending_risk_ids_stmt))

    risk_result = await db.execute(risk_stmt)
    uncat_risks = risk_result.scalars().all()

    for risk in uncat_risks:
        # Determine previous owner
        # If owner is None, use fallback admin. If no fallback, skip (can't satisfy FK)
        prev_owner_id = risk.owner_id or fallback_owner_id

        if not prev_owner_id:
            logger.warning(f"Skipping headless Risk {risk.id} in Uncategorised - no owner or fallback admin found")
            continue

        orphan = OrphanedItem(
            item_type="risk",
            item_id=risk.id,
            previous_owner_id=prev_owner_id,
            status="pending",
            orphaned_at=utc_now(),
        )
        db.add(orphan)
        new_orphans_count += 1
        processed_risk_ids.add(risk.id)

    # 2. Scan Controls
    pending_control_ids_stmt = select(OrphanedItem.item_id).where(
        OrphanedItem.item_type == "control",
        OrphanedItem.status == "pending",
    )

    control_stmt = (
        select(Control).where(Control.department_id == uncat_dept.id).where(Control.id.not_in(pending_control_ids_stmt))
    )

    control_result = await db.execute(control_stmt)
    uncat_controls = control_result.scalars().all()

    for control in uncat_controls:
        # Controls have more fallback options
        prev_owner_id = control.control_owner_id or control.created_by_id or control.updated_by_id or fallback_owner_id

        if not prev_owner_id:
            logger.warning(f"Skipping headless Control {control.id} in Uncategorised - no owner found")
            continue

        orphan = OrphanedItem(
            item_type="control",
            item_id=control.id,
            previous_owner_id=prev_owner_id,
            status="pending",
            orphaned_at=utc_now(),
        )
        db.add(orphan)
        new_orphans_count += 1
        processed_control_ids.add(control.id)

    # 3. Scan KRIs without Risks
    # Note: risk_id is mandatory in DB, but we might want to flag KRIs
    # that are somehow floating or in UNCAT (though they belong to Risks).
    # "KRI NOT LINKED TO A RISK" (User requirement)
    # We'll check for any KRI records that for some reason have missing Risk links
    # (unlikely due to FK) or KRIs that belong to "Uncategorised" risks.

    # For now, let's scan for KRIs whose parent RISK is in UNCAT dept
    pending_kri_ids_stmt = select(OrphanedItem.item_id).where(
        OrphanedItem.item_type == "kri",
        OrphanedItem.status == "pending",
    )

    from sqlalchemy.orm import selectinload

    from app.models.key_risk_indicator import KeyRiskIndicator

    kri_stmt = (
        select(KeyRiskIndicator)
        .options(selectinload(KeyRiskIndicator.risk))
        .join(Risk)
        .where(Risk.department_id == uncat_dept.id)
        .where(KeyRiskIndicator.id.not_in(pending_kri_ids_stmt))
    )

    kri_result = await db.execute(kri_stmt)
    uncat_kris = kri_result.scalars().all()

    for kri in uncat_kris:
        # KRIs don't have separate owners, they follow the Risk owner
        # We use the Risk owner as the previous owner for the orphan record
        prev_owner_id = kri.risk.owner_id or fallback_owner_id

        if not prev_owner_id:
            continue

        orphan = OrphanedItem(
            item_type="kri",
            item_id=kri.id,
            previous_owner_id=prev_owner_id,
            status="pending",
            orphaned_at=utc_now(),
        )
        db.add(orphan)
        new_orphans_count += 1

    # 4. Scan Controls without Risk Linkage

    # "CONTROLS: NO DEPARTMENT, NO OWNER OR NO RISK LINKAGE"
    from app.models.risk import ControlRiskLink

    # Controls with NO risk links
    linked_control_ids = select(ControlRiskLink.control_id).distinct()

    unlinked_control_stmt = (
        select(Control).where(Control.id.not_in(linked_control_ids)).where(Control.id.not_in(pending_control_ids_stmt))
    )

    unlinked_control_result = await db.execute(unlinked_control_stmt)
    unlinked_controls = unlinked_control_result.scalars().all()

    for control in unlinked_controls:
        if control.id in processed_control_ids:
            continue

        prev_owner_id = control.control_owner_id or control.created_by_id or fallback_owner_id
        if not prev_owner_id:
            continue

        orphan = OrphanedItem(
            item_type="control",
            item_id=control.id,
            previous_owner_id=prev_owner_id,
            status="pending",
            orphaned_at=utc_now(),
        )
        db.add(orphan)
        new_orphans_count += 1

    if new_orphans_count > 0:
        await db.commit()
        logger.info(f"Uncategorised/Orphan Sweep: Flagged {new_orphans_count} new orphaned items")

    return new_orphans_count
