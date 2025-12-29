"""Service for managing orphaned items (risks/controls without owners)."""
import logging
from datetime import datetime, UTC
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orphaned_item import OrphanedItem
from app.models.risk import Risk
from app.models.control import Control
from app.models.user import User
from app.models.department import Department

logger = logging.getLogger(__name__)


class OrphanedItemService:
    """Service for flagging, querying, and resolving orphaned items."""
    
    @staticmethod
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
        risks_result = await db.execute(
            select(Risk).where(Risk.owner_id == user_id)
        )
        risks = risks_result.scalars().all()
        
        for risk in risks:
            # Check if already flagged as pending
            existing = await db.execute(
                select(OrphanedItem).where(
                    OrphanedItem.item_type == "risk",
                    OrphanedItem.item_id == risk.id,
                    OrphanedItem.status == "pending",
                )
            )
            if existing.scalar_one_or_none():
                continue  # Already flagged
            
            orphan = OrphanedItem(
                item_type="risk",
                item_id=risk.id,
                previous_owner_id=user_id,
                status="pending",
            )
            db.add(orphan)
            created_records.append(orphan)
            logger.info(f"Flagged orphaned risk: id={risk.id}")
        
        # Find controls owned by this user
        controls_result = await db.execute(
            select(Control).where(Control.control_owner_id == user_id)
        )
        controls = controls_result.scalars().all()
        
        for control in controls:
            # Check if already flagged as pending
            existing = await db.execute(
                select(OrphanedItem).where(
                    OrphanedItem.item_type == "control",
                    OrphanedItem.item_id == control.id,
                    OrphanedItem.status == "pending",
                )
            )
            if existing.scalar_one_or_none():
                continue  # Already flagged
            
            orphan = OrphanedItem(
                item_type="control",
                item_id=control.id,
                previous_owner_id=user_id,
                status="pending",
            )
            db.add(orphan)
            created_records.append(orphan)
            logger.info(f"Flagged orphaned control: id={control.id}")
        
        await db.flush()
        
        logger.info(
            f"Flagged {len(created_records)} orphaned items for user {user_id}: "
            f"{len(risks)} risks, {len(controls)} controls"
        )
        
        return created_records

    @staticmethod
    async def _get_fallback_owner_id(db: AsyncSession) -> int | None:
        """Find a fallback owner (first admin) for headless items."""
        from app.models.role import Role, RoleType
        result = await db.execute(
            select(User.id)
            .join(Role)
            .where(Role.name == RoleType.ADMIN)
            .limit(1)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
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
        fallback_owner_id = await OrphanedItemService._get_fallback_owner_id(db)
        
        # 1. Scan Risks
        # Find risks in UNCAT that are NOT in orphaned_items (pending)
        # Using a left join exclusion pattern or simple NOT IN subquery
        
        pending_risk_ids_stmt = select(OrphanedItem.item_id).where(
            OrphanedItem.item_type == "risk",
            OrphanedItem.status == "pending"
        )
        
        stmt = (
            select(Risk)
            .where(Risk.department_id == uncat_dept.id)
            .where(Risk.id.not_in(pending_risk_ids_stmt))
        )
        
        result = await db.execute(stmt)
        uncat_risks = result.scalars().all()
        
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
                orphaned_at=datetime.now(UTC).replace(tzinfo=None)
            )
            db.add(orphan)
            new_orphans_count += 1
            
        # 2. Scan Controls
        pending_control_ids_stmt = select(OrphanedItem.item_id).where(
            OrphanedItem.item_type == "control",
            OrphanedItem.status == "pending"
        )
        
        stmt = (
            select(Control)
            .where(Control.department_id == uncat_dept.id)
            .where(Control.id.not_in(pending_control_ids_stmt))
        )
        
        result = await db.execute(stmt)
        uncat_controls = result.scalars().all()
        
        for control in uncat_controls:
            # Controls have more fallback options
            prev_owner_id = (
                control.control_owner_id or 
                control.created_by_id or 
                control.updated_by_id or 
                fallback_owner_id
            )
            
            if not prev_owner_id:
                logger.warning(f"Skipping headless Control {control.id} in Uncategorised - no owner found")
                continue
                
            orphan = OrphanedItem(
                item_type="control",
                item_id=control.id,
                previous_owner_id=prev_owner_id,
                status="pending",
                orphaned_at=datetime.now(UTC).replace(tzinfo=None)
            )
            db.add(orphan)
            new_orphans_count += 1
            
        if new_orphans_count > 0:
            await db.commit()
            logger.info(f"Uncategorised Sweep: Flagged {new_orphans_count} new orphaned items")
            
        return new_orphans_count
    
    @staticmethod
    async def get_pending_orphans(
        db: AsyncSession,
        item_type: Optional[str] = None,
    ) -> list[OrphanedItem]:
        """
        Get all pending orphaned items.
        
        Args:
            db: Database session
            item_type: Optional filter by "risk" or "control"
            
        Returns:
            List of pending OrphanedItem records
        """
        query = select(OrphanedItem).where(OrphanedItem.status == "pending")
        
        if item_type:
            query = query.where(OrphanedItem.item_type == item_type)
        
        query = query.order_by(OrphanedItem.orphaned_at.desc())
        
        result = await db.execute(query)
        return list(result.scalars().all())
    
    @staticmethod
    async def get_orphan_stats(db: AsyncSession) -> dict:
        """
        Get statistics about orphaned items.
        
        Returns:
            Dict with total_pending and by_type counts
        """
        # Count by type
        result = await db.execute(
            select(
                OrphanedItem.item_type,
                func.count(OrphanedItem.id).label("count")
            )
            .where(OrphanedItem.status == "pending")
            .group_by(OrphanedItem.item_type)
        )
        
        by_type = {"risks": 0, "controls": 0}
        total = 0
        for row in result:
            type_key = f"{row.item_type}s" if row.item_type in ("risk", "control") else row.item_type
            by_type[type_key] = row.count
            total += row.count
        
        return {
            "total_pending": total,
            "by_type": by_type,
        }
    
    @staticmethod
    async def resolve_orphan(
        db: AsyncSession,
        orphan_id: int,
        new_owner_id: int,
        resolved_by_id: int,
        department_id: int | None = None,
    ) -> OrphanedItem:
        """
        Resolve an orphaned item by assigning a new owner.
        
        Args:
            db: Database session
            orphan_id: ID of the orphaned_item record
            new_owner_id: ID of new owner to assign
            resolved_by_id: ID of admin who resolved this
            department_id: Optional department to assign (falls back to owner's dept or Uncategorised)
            
        Returns:
            Updated OrphanedItem record
            
        Raises:
            ValueError: If orphan not found or already resolved
        """
        # Get the orphan record
        result = await db.execute(
            select(OrphanedItem).where(OrphanedItem.id == orphan_id)
        )
        orphan = result.scalar_one_or_none()
        
        if not orphan:
            raise ValueError(f"Orphaned item {orphan_id} not found")
        
        if orphan.status == "resolved":
            raise ValueError(f"Orphaned item {orphan_id} is already resolved")
        
        # Verify new owner exists and is active
        owner_result = await db.execute(
            select(User).where(User.id == new_owner_id)
        )
        new_owner = owner_result.scalar_one_or_none()
        
        if not new_owner:
            raise ValueError(f"New owner {new_owner_id} not found")
        
        if not new_owner.is_active:
            raise ValueError(f"New owner {new_owner_id} is not active")
        
        # Determine department: explicit > owner's department > Uncategorised
        target_dept_id = department_id
        if target_dept_id is None:
            target_dept_id = new_owner.department_id
        
        if target_dept_id is None:
            # Fall back to Uncategorised department
            uncat_result = await db.execute(
                select(Department).where(Department.code == "UNCAT")
            )
            uncat_dept = uncat_result.scalar_one_or_none()
            if uncat_dept:
                target_dept_id = uncat_dept.id
                logger.info(f"No department for user {new_owner_id}, using Uncategorised")
        
        # Update the actual item's owner and department
        if orphan.item_type == "risk":
            risk_result = await db.execute(
                select(Risk).where(Risk.id == orphan.item_id)
            )
            risk = risk_result.scalar_one_or_none()
            if risk:
                risk.owner_id = new_owner_id
                if target_dept_id:
                    risk.department_id = target_dept_id
                logger.info(f"Reassigned risk {risk.id} to user {new_owner_id}, dept {target_dept_id}")
        
        elif orphan.item_type == "control":
            control_result = await db.execute(
                select(Control).where(Control.id == orphan.item_id)
            )
            control = control_result.scalar_one_or_none()
            if control:
                control.control_owner_id = new_owner_id
                if target_dept_id:
                    control.department_id = target_dept_id
                logger.info(f"Reassigned control {control.id} to user {new_owner_id}, dept {target_dept_id}")
        
        # Mark orphan as resolved
        orphan.status = "resolved"
        orphan.resolved_at = datetime.utcnow()
        orphan.resolved_by_id = resolved_by_id
        orphan.new_owner_id = new_owner_id
        
        await db.commit()
        
        return orphan

    @staticmethod
    async def get_pending_orphans_with_details(
        db: AsyncSession,
        item_type: Optional[str] = None,
        status: str = "pending",
    ) -> list[dict]:
        """
        Get orphaned items with full details including item names and owner info.
        
        Returns list of dicts matching OrphanedItemDetail schema.
        """
        from app.models.department import Department
        from sqlalchemy.orm import selectinload
        
        query = select(OrphanedItem).options(
            selectinload(OrphanedItem.previous_owner)
        )
        
        if status:
            query = query.where(OrphanedItem.status == status)
        if item_type:
            query = query.where(OrphanedItem.item_type == item_type)
        
        query = query.order_by(OrphanedItem.orphaned_at.desc())
        
        result = await db.execute(query)
        orphans = result.scalars().all()
        
        details = []
        for orphan in orphans:
            item_name = "Unknown"
            item_identifier = None
            department_name = None
            
            if orphan.item_type == "risk":
                risk_result = await db.execute(
                    select(Risk).options(
                        selectinload(Risk.department)
                    ).where(Risk.id == orphan.item_id)
                )
                risk = risk_result.scalar_one_or_none()
                if risk:
                    item_name = risk.description or f"Risk #{risk.id}"
                    item_identifier = risk.risk_id_code
                    if risk.department:
                        department_name = risk.department.name
            
            elif orphan.item_type == "control":
                control_result = await db.execute(
                    select(Control).options(
                        selectinload(Control.department)
                    ).where(Control.id == orphan.item_id)
                )
                control = control_result.scalar_one_or_none()
                if control:
                    item_name = control.control_name or f"Control #{control.id}"
                    item_identifier = str(control.id)
                    if control.department:
                        department_name = control.department.name
            
            details.append({
                "id": orphan.id,
                "item_type": orphan.item_type,
                "item_id": orphan.item_id,
                "item_name": item_name,
                "item_identifier": item_identifier,
                "department_name": department_name,
                "previous_owner_name": orphan.previous_owner.name if orphan.previous_owner else "Unknown",
                "previous_owner_email": orphan.previous_owner.email if orphan.previous_owner else "unknown@example.com",
                "orphaned_at": orphan.orphaned_at,
                "status": orphan.status,
            })
        
        return details

    @staticmethod
    async def get_orphan_detail(db: AsyncSession, orphan_id: int) -> dict | None:
        """
        Get detailed information about a single orphaned item.
        """
        from sqlalchemy.orm import selectinload
        
        result = await db.execute(
            select(OrphanedItem)
            .options(selectinload(OrphanedItem.previous_owner))
            .where(OrphanedItem.id == orphan_id)
        )
        orphan = result.scalar_one_or_none()
        
        if not orphan:
            return None
        
        item_name = "Unknown"
        item_identifier = None
        department_name = None
        
        if orphan.item_type == "risk":
            risk_result = await db.execute(
                select(Risk).options(
                    selectinload(Risk.department)
                ).where(Risk.id == orphan.item_id)
            )
            risk = risk_result.scalar_one_or_none()
            if risk:
                item_name = risk.description or f"Risk #{risk.id}"
                item_identifier = risk.risk_id_code
                if risk.department:
                    department_name = risk.department.name
        
        elif orphan.item_type == "control":
            control_result = await db.execute(
                select(Control).options(
                    selectinload(Control.department)
                ).where(Control.id == orphan.item_id)
            )
            control = control_result.scalar_one_or_none()
            if control:
                item_name = control.control_name or f"Control #{control.id}"
                item_identifier = str(control.id)
                if control.department:
                    department_name = control.department.name
        
        return {
            "id": orphan.id,
            "item_type": orphan.item_type,
            "item_id": orphan.item_id,
            "item_name": item_name,
            "item_identifier": item_identifier,
            "department_name": department_name,
            "previous_owner_name": orphan.previous_owner.name if orphan.previous_owner else "Unknown",
            "previous_owner_email": orphan.previous_owner.email if orphan.previous_owner else "unknown@example.com",
            "orphaned_at": orphan.orphaned_at,
            "status": orphan.status,
        }

