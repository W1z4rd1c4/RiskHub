"""
Phase 179-07: Activity Log Data Seeding
Seeds activity log entries for E2E tests.

Creates entries for all entity types (RISK, CONTROL, KRI, APPROVAL) 
with CREATE, UPDATE, and ARCHIVE actions to enable activity-logging tests.
"""
import asyncio
from datetime import datetime, timedelta, UTC
from sqlalchemy import select
from app.core.config import get_settings
from app.db.session import session_context
from app.models.activity_log import ActivityLog, ActivityAction, ActivityEntityType
from app.models import Risk, Control, KeyRiskIndicator, User
from scripts.e2e_mappings import load_mappings

# Activity types we need to seed per BUSINESS_LOGIC.md §9.1
ENTITY_ACTIONS = [
    (ActivityEntityType.RISK, ActivityAction.CREATE, "E2E Risk created"),
    (ActivityEntityType.RISK, ActivityAction.UPDATE, "E2E Risk updated"),
    (ActivityEntityType.RISK, ActivityAction.ARCHIVE, "E2E Risk archived"),
    (ActivityEntityType.CONTROL, ActivityAction.CREATE, "E2E Control created"),
    (ActivityEntityType.CONTROL, ActivityAction.UPDATE, "E2E Control updated"),
    (ActivityEntityType.CONTROL, ActivityAction.ARCHIVE, "E2E Control archived"),
    (ActivityEntityType.KRI, ActivityAction.CREATE, "E2E KRI created"),
    (ActivityEntityType.KRI, ActivityAction.UPDATE, "E2E KRI updated"),
    (ActivityEntityType.KRI_VALUE, ActivityAction.CREATE, "E2E KRI value submitted"),
    (ActivityEntityType.APPROVAL, ActivityAction.CREATE, "E2E Approval request created"),
    (ActivityEntityType.APPROVAL, ActivityAction.APPROVE, "E2E Approval request approved"),
    (ActivityEntityType.APPROVAL, ActivityAction.REJECT, "E2E Approval request rejected"),
    (ActivityEntityType.APPROVAL, ActivityAction.CANCEL, "E2E Approval request cancelled"),
]


async def seed_activity_logs():
    """Seed activity log entries for E2E tests."""
    print("="*60)
    print("🔍 PHASE 179-07: Activity Log Data Seeding")
    print("="*60)
    
    async with session_context(get_settings()) as db:
        users, depts = await load_mappings(db)
        
        # Check for existing E2E activity logs
        result = await db.execute(
            select(ActivityLog).where(ActivityLog.description.contains("E2E-SEED"))
        )
        existing = result.scalars().all()
        if existing:
            print(f"   ⏭️  Activity logs already seeded ({len(existing)} entries)")
            return
        
        # Get sample entities for reference
        risk_result = await db.execute(select(Risk).limit(1))
        sample_risk = risk_result.scalar_one_or_none()
        
        control_result = await db.execute(select(Control).limit(1))
        sample_control = control_result.scalar_one_or_none()
        
        kri_result = await db.execute(select(KeyRiskIndicator).limit(1))
        sample_kri = kri_result.scalar_one_or_none()
        
        # Get actor info
        cro_id = users.get("cro@riskhub.local")
        rm_id = users.get("risk.manager@riskhub.local")
        
        cro_result = await db.execute(select(User).where(User.id == cro_id))
        cro_user = cro_result.scalar_one_or_none()
        
        rm_result = await db.execute(select(User).where(User.id == rm_id))
        rm_user = rm_result.scalar_one_or_none()
        
        created = 0
        base_time = datetime.now(UTC) - timedelta(hours=24)
        
        for i, (entity_type, action, desc) in enumerate(ENTITY_ACTIONS):
            # Determine entity_id and entity_name based on entity type
            entity_id = 1  # Default
            entity_name = f"E2E-SEED-{entity_type.value}"
            
            if entity_type == ActivityEntityType.RISK and sample_risk:
                entity_id = sample_risk.id
                entity_name = sample_risk.name or f"Risk #{sample_risk.id}"
            elif entity_type == ActivityEntityType.CONTROL and sample_control:
                entity_id = sample_control.id
                entity_name = sample_control.name or f"Control #{sample_control.id}"
            elif entity_type in (ActivityEntityType.KRI, ActivityEntityType.KRI_VALUE) and sample_kri:
                entity_id = sample_kri.id
                entity_name = sample_kri.metric_name or f"KRI #{sample_kri.id}"
            elif entity_type == ActivityEntityType.APPROVAL:
                entity_id = 1  # Generic approval ID
                entity_name = "E2E Approval Request"
            
            # Vary the actor for diversity
            actor = cro_user if i % 2 == 0 else rm_user
            actor_id = actor.id if actor else None
            actor_name = actor.name if actor else "System"
            
            # Build changes for UPDATE actions
            changes = None
            if action == ActivityAction.UPDATE:
                changes = {
                    "description": {
                        "old": "Original value",
                        "new": "Updated by E2E seed"
                    }
                }
            
            entry = ActivityLog(
                entity_type=entity_type,
                entity_id=entity_id,
                entity_name=entity_name,
                action=action,
                actor_id=actor_id,
                actor_name=actor_name,
                department_id=depts.get("Risk Management"),
                changes=changes,
                description=f"E2E-SEED: {desc}",
                created_at=base_time + timedelta(minutes=i*5),
            )
            db.add(entry)
            created += 1
            print(f"   ✓ {entity_type.value.upper()}/{action.value}: {entity_name}")
        
        await db.commit()
        print(f"\n✅ Created {created} activity log entries")


if __name__ == "__main__":
    asyncio.run(seed_activity_logs())
