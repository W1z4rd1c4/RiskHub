"""
Phase 179-05: Approval Request Seeding
Creates 5 pre-populated approval requests for E2E testing.

⚠️ WARNING: These approvals must remain in PENDING state for tests.
Do NOT approve/reject them during development!
"""
import asyncio
from datetime import datetime, UTC
from sqlalchemy import select
from app.db.session import async_session_maker
from app.models import Risk, Control
from app.models.approval_request import (
    ApprovalRequest, ApprovalStatus, ApprovalResourceType, ApprovalActionType
)
from scripts.e2e_mappings import load_mappings


APPROVALS = [
    # E2E-APR-001: Standard risk deletion by non-privileged user
    {
        "resource_type": ApprovalResourceType.RISK,
        "risk_code": "E2E-UW-003",
        "action_type": ApprovalActionType.DELETE,
        "status": ApprovalStatus.PENDING,
        "requester": "ops.analyst@riskhub.local",
        "primary_approver": "ops.head@riskhub.local",
        "requires_privileged": False,
        "reason": "E2E test: Standard risk deletion by employee - awaiting primary approval",
    },
    # E2E-APR-002: Priority risk deletion requiring privileged approval
    {
        "resource_type": ApprovalResourceType.RISK,
        "risk_code": "E2E-CLM-002",
        "action_type": ApprovalActionType.DELETE,
        "status": ApprovalStatus.PENDING,
        "requester": "ops.head@riskhub.local",
        "primary_approver": "risk.manager@riskhub.local",
        "requires_privileged": True,
        "reason": "E2E test: Priority risk deletion requires privileged approval",
    },
    # E2E-APR-003: Priority risk edit - primary approved, awaiting privileged
    {
        "resource_type": ApprovalResourceType.RISK,
        "risk_code": "E2E-IT-001",
        "action_type": ApprovalActionType.EDIT,
        "status": ApprovalStatus.PENDING_PRIVILEGED,
        "requester": "it.analyst@riskhub.local",
        "primary_approver": "it.head@riskhub.local",
        "requires_privileged": True,
        "reason": "E2E test: Priority risk edit - primary approved, awaiting privileged",
        "pending_changes": {"description": {"old": "Original description", "new": "Updated by E2E test"}},
    },
    # E2E-APR-004: Sensitive field edit on non-priority risk
    {
        "resource_type": ApprovalResourceType.RISK,
        "risk_code": "E2E-COMP-003",
        "action_type": ApprovalActionType.EDIT,
        "status": ApprovalStatus.PENDING,
        "requester": "ops.head@riskhub.local",
        "primary_approver": "risk.manager@riskhub.local",
        "requires_privileged": False,
        "reason": "E2E test: Sensitive field change on non-priority risk",
        "pending_changes": {"owner_id": {"old": 4, "new": 5}},
    },
    # E2E-APR-005: Control deletion by non-privileged user
    {
        "resource_type": ApprovalResourceType.CONTROL,
        "control_name": "E2E-CTRL-003 Property Accumulation Check",
        "action_type": ApprovalActionType.DELETE,
        "status": ApprovalStatus.PENDING,
        "requester": "ops.analyst@riskhub.local",
        "primary_approver": "ops.head@riskhub.local",
        "requires_privileged": False,
        "reason": "E2E test: Control archive by non-privileged user",
    },
]


async def seed_approvals():
    """Create E2E test approval requests."""
    print("="*60)
    print("🔍 PHASE 179-05: Approval Request Seeding")
    print("="*60)
    
    async with async_session_maker() as db:
        users, _ = await load_mappings(db)
        
        created = 0
        skipped = 0
        
        for approval_data in APPROVALS:
            data = approval_data.copy()
            
            # Get resource ID and name
            resource_type = data.pop("resource_type")
            
            if resource_type == ApprovalResourceType.RISK:
                risk_code = data.pop("risk_code")
                result = await db.execute(
                    select(Risk).where(Risk.risk_id_code == risk_code)
                )
                entity = result.scalar_one_or_none()
                if not entity:
                    print(f"   ⚠️ Risk {risk_code} not found")
                    continue
                resource_id = entity.id
                resource_name = entity.name
            else:
                control_name = data.pop("control_name")
                result = await db.execute(
                    select(Control).where(Control.name == control_name)
                )
                entity = result.scalar_one_or_none()
                if not entity:
                    print(f"   ⚠️ Control {control_name} not found")
                    continue
                resource_id = entity.id
                resource_name = entity.name
            
            # Check for existing pending approval
            result = await db.execute(
                select(ApprovalRequest).where(
                    ApprovalRequest.resource_type == resource_type,
                    ApprovalRequest.resource_id == resource_id,
                    ApprovalRequest.action_type == data["action_type"],
                    ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED])
                )
            )
            if result.scalar_one_or_none():
                skipped += 1
                continue
            
            # Resolve user IDs
            requester_id = users[data.pop("requester")]
            primary_approver_id = users[data.pop("primary_approver")]
            
            approval = ApprovalRequest(
                resource_type=resource_type,
                resource_id=resource_id,
                resource_name=resource_name,
                action_type=data.pop("action_type"),
                status=data.pop("status"),
                requested_by_id=requester_id,
                primary_approver_id=primary_approver_id,
                requires_privileged_approval=data.pop("requires_privileged"),
                reason=data.pop("reason"),
                pending_changes=data.pop("pending_changes", None),
            )
            
            # Set primary_approved_at for PENDING_PRIVILEGED status
            if approval.status == ApprovalStatus.PENDING_PRIVILEGED:
                approval.primary_approved_at = datetime.utcnow()
            
            db.add(approval)
            created += 1
            print(f"   ✓ {resource_type.value.upper()} #{resource_id}: {approval.action_type.value}")
        
        await db.commit()
        
        print(f"\n✅ Created {created} approval requests, skipped {skipped} existing")


if __name__ == "__main__":
    asyncio.run(seed_approvals())
