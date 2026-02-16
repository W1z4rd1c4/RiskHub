from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.control import Control
from app.models.department import Department
from app.models.orphaned_item import OrphanedItem
from app.models.risk import Risk
from app.models.user import User

from .logging import logger


async def _get_fallback_owner_id(db: AsyncSession) -> int | None:
    """Find a fallback owner (first admin) for headless items."""
    from app.models.role import Role, RoleType

    result = await db.execute(select(User.id).join(Role).where(Role.name == RoleType.ADMIN).limit(1))
    return result.scalar_one_or_none()


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
    # Get the orphan record
    result = await db.execute(select(OrphanedItem).where(OrphanedItem.id == orphan_id))
    orphan = result.scalar_one_or_none()

    if not orphan:
        raise ValueError(f"Orphaned item {orphan_id} not found")

    if orphan.status == "resolved":
        raise ValueError(f"Orphaned item {orphan_id} is already resolved")

    new_owner = None
    if new_owner_id:
        # Verify new owner exists and is active
        owner_result = await db.execute(select(User).where(User.id == new_owner_id))
        new_owner = owner_result.scalar_one_or_none()

        if not new_owner:
            raise ValueError(f"New owner {new_owner_id} not found")

        if not new_owner.is_active:
            raise ValueError(f"New owner {new_owner_id} is not active")

    # Determine department: explicit > owner's department > Uncategorised
    target_dept_id = department_id
    if target_dept_id is None and new_owner:
        target_dept_id = new_owner.department_id

    if target_dept_id is None and (new_owner or orphan.item_type != "kri"):
        # Fall back to Uncategorised department
        uncat_result = await db.execute(select(Department).where(Department.code == "UNCAT"))
        uncat_dept = uncat_result.scalar_one_or_none()
        if uncat_dept:
            target_dept_id = uncat_dept.id
            logger.info("Using Uncategorised department as fallback")

    # Update the actual item's owner and department
    if orphan.item_type == "risk":
        risk_result = await db.execute(select(Risk).where(Risk.id == orphan.item_id))
        risk = risk_result.scalar_one_or_none()
        if risk:
            risk.owner_id = new_owner_id
            if target_dept_id:
                risk.department_id = target_dept_id
            logger.info(f"Reassigned risk {risk.id} to user {new_owner_id}, dept {target_dept_id}")

    elif orphan.item_type == "control":
        control_result = await db.execute(select(Control).where(Control.id == orphan.item_id))
        control = control_result.scalar_one_or_none()
        if control:
            control.control_owner_id = new_owner_id
            if target_dept_id:
                control.department_id = target_dept_id

            # Link to risk if target_risk_id provided
            if target_risk_id:
                from app.models.risk import ControlRiskLink

                # Check existing link
                link_res = await db.execute(
                    select(ControlRiskLink).where(
                        ControlRiskLink.control_id == control.id,
                        ControlRiskLink.risk_id == target_risk_id,
                    )
                )
                if not link_res.scalar_one_or_none():
                    link = ControlRiskLink(
                        control_id=control.id,
                        risk_id=target_risk_id,
                        effectiveness="partially_effective",  # Default
                    )
                    db.add(link)

            logger.info(f"Reassigned control {control.id} to user {new_owner_id}, dept {target_dept_id}")

    elif orphan.item_type == "kri":
        from app.models.key_risk_indicator import KeyRiskIndicator

        kri_result = await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.id == orphan.item_id))
        kri = kri_result.scalar_one_or_none()
        if kri:
            # KRIs follow Risk owner, but we can update the Risk link
            if target_risk_id:
                kri.risk_id = target_risk_id

            # We don't have separate owner for KRI, but we can log the resolution
            logger.info(f"Resolved KRI {kri.id} by linking to risk {target_risk_id or kri.risk_id}")

    # Mark orphan as resolved
    orphan.status = "resolved"
    orphan.resolved_at = datetime.now(UTC)
    orphan.resolved_by_id = resolved_by_id
    orphan.new_owner_id = new_owner_id

    await db.commit()

    return orphan

