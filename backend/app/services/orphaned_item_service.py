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
        
        processed_risk_ids = set()
        processed_control_ids = set()
        
        # 1. Scan Risks
        # Find risks in UNCAT that are NOT in orphaned_items (pending)
        
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
                orphaned_at=datetime.now(UTC)
            )
            db.add(orphan)
            db.add(orphan)
            new_orphans_count += 1
            processed_risk_ids.add(risk.id)
            
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
                orphaned_at=datetime.now(UTC)
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
            OrphanedItem.status == "pending"
        )
        
        from app.models.key_risk_indicator import KeyRiskIndicator
        from sqlalchemy.orm import selectinload
        
        stmt = (
            select(KeyRiskIndicator)
            .options(selectinload(KeyRiskIndicator.risk))
            .join(Risk)
            .where(Risk.department_id == uncat_dept.id)
            .where(KeyRiskIndicator.id.not_in(pending_kri_ids_stmt))
        )
        
        result = await db.execute(stmt)
        uncat_kris = result.scalars().all()
        
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
                orphaned_at=datetime.now(UTC)
            )
            db.add(orphan)
            new_orphans_count += 1

        # 4. Scan Controls without Risk Linkage

        # "CONTROLS: NO DEPARTMENT, NO OWNER OR NO RISK LINKAGE"
        from app.models.risk import ControlRiskLink
        
        # Controls with NO risk links
        linked_control_ids = select(ControlRiskLink.control_id).distinct()
        
        stmt = (
            select(Control)
            .where(Control.id.not_in(linked_control_ids))
            .where(Control.id.not_in(pending_control_ids_stmt))
        )
        
        result = await db.execute(stmt)
        unlinked_controls = result.scalars().all()
        
        for control in unlinked_controls:
            if control.id in processed_control_ids:
                continue
                
            prev_owner_id = (
                control.control_owner_id or 
                control.created_by_id or 
                fallback_owner_id
            )
            if not prev_owner_id:
                continue
                
            orphan = OrphanedItem(
                item_type="control",
                item_id=control.id,
                previous_owner_id=prev_owner_id,
                status="pending",
                orphaned_at=datetime.now(UTC)
            )
            db.add(orphan)
            new_orphans_count += 1

        if new_orphans_count > 0:
            await db.commit()
            logger.info(f"Uncategorised/Orphan Sweep: Flagged {new_orphans_count} new orphaned items")
            
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
        Get statistics about orphaned items for the 4-bar layout.
        
        Returns:
            Dict matching OrphanedItemStats schema
        """
        # Count pending orphans in the database by type
        result = await db.execute(
            select(
                OrphanedItem.item_type,
                func.count(OrphanedItem.id).label("count")
            )
            .where(OrphanedItem.status == "pending")
            .group_by(OrphanedItem.item_type)
        )
        
        counts = {"risk": 0, "control": 0, "kri": 0}
        total = 0
        for row in result:
            if row.item_type in counts:
                counts[row.item_type] = row.count
                total += row.count
        
        return {
            "risk_count": counts["risk"],
            "control_count": counts["control"],
            "kri_count": counts["kri"],
            "total_count": total,
        }
    
    @staticmethod
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
        result = await db.execute(
            select(OrphanedItem).where(OrphanedItem.id == orphan_id)
        )
        orphan = result.scalar_one_or_none()
        
        if not orphan:
            raise ValueError(f"Orphaned item {orphan_id} not found")
        
        if orphan.status == "resolved":
            raise ValueError(f"Orphaned item {orphan_id} is already resolved")
        
        new_owner = None
        if new_owner_id:
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
        if target_dept_id is None and new_owner:
            target_dept_id = new_owner.department_id
        
        if target_dept_id is None and (new_owner or orphan.item_type != "kri"):
            # Fall back to Uncategorised department
            uncat_result = await db.execute(
                select(Department).where(Department.code == "UNCAT")
            )
            uncat_dept = uncat_result.scalar_one_or_none()
            if uncat_dept:
                target_dept_id = uncat_dept.id
                logger.info("Using Uncategorised department as fallback")
        
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
                
                # Link to risk if target_risk_id provided
                if target_risk_id:
                    from app.models.risk import ControlRiskLink
                    # Check existing link
                    link_res = await db.execute(
                        select(ControlRiskLink).where(
                            ControlRiskLink.control_id == control.id,
                            ControlRiskLink.risk_id == target_risk_id
                        )
                    )
                    if not link_res.scalar_one_or_none():
                        link = ControlRiskLink(
                            control_id=control.id,
                            risk_id=target_risk_id,
                            effectiveness="partially_effective" # Default
                        )
                        db.add(link)
                
                logger.info(f"Reassigned control {control.id} to user {new_owner_id}, dept {target_dept_id}")

        elif orphan.item_type == "kri":
            from app.models.key_risk_indicator import KeyRiskIndicator
            kri_result = await db.execute(
                select(KeyRiskIndicator).where(KeyRiskIndicator.id == orphan.item_id)
            )
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
                    item_name = control.name or f"Control #{control.id}"
                    item_identifier = str(control.id)
                    if control.department:
                        department_name = control.department.name
            
            elif orphan.item_type == "kri":
                from app.models.key_risk_indicator import KeyRiskIndicator
                kri_result = await db.execute(
                    select(KeyRiskIndicator).where(KeyRiskIndicator.id == orphan.item_id)
                )
                kri = kri_result.scalar_one_or_none()
                if kri:
                    item_name = kri.metric_name or f"KRI #{kri.id}"
                    item_identifier = str(kri.id)
                    # KRIs link to risks, which have depts
                    risk_res = await db.execute(select(Risk).options(selectinload(Risk.department)).where(Risk.id == kri.risk_id))
                    risk = risk_res.scalar_one_or_none()
                    if risk and risk.department:
                        department_name = risk.department.name
            
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
                item_name = control.name or f"Control #{control.id}"
                item_identifier = str(control.id)
                if control.department:
                    department_name = control.department.name
        
        elif orphan.item_type == "kri":
            from app.models.key_risk_indicator import KeyRiskIndicator
            kri_result = await db.execute(
                select(KeyRiskIndicator).where(KeyRiskIndicator.id == orphan.item_id)
            )
            kri = kri_result.scalar_one_or_none()
            if kri:
                item_name = kri.metric_name or f"KRI #{kri.id}"
                item_identifier = str(kri.id)
                risk_res = await db.execute(select(Risk).options(selectinload(Risk.department)).where(Risk.id == kri.risk_id))
                risk = risk_res.scalar_one_or_none()
                if risk and risk.department:
                    department_name = risk.department.name
        
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

