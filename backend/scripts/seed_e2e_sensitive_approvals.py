"""
Phase 179-09: Sensitive Field Approval Data Seeding
Seeds pending approvals for sensitive field changes (owner_id, department_id, category, is_priority).

Enables sensitive-fields E2E tests per BUSINESS_LOGIC.md §6.
"""

import asyncio

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import session_context
from app.models import Control, Risk
from app.models.approval_request import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus
from scripts.e2e_mappings import load_mappings

# Sensitive field change scenarios per BUSINESS_LOGIC.md §6
SENSITIVE_FIELD_SCENARIOS = [
    # Risk owner_id changes (§6.1)
    {
        "resource_type": ApprovalResourceType.RISK,
        "field": "owner_id",
        "description": "Change risk owner from Ops Head to Finance Head",
        "pending_changes": {"owner_id": {"old": 4, "new": 5}},
    },
    # Risk department_id changes (§6.1)
    {
        "resource_type": ApprovalResourceType.RISK,
        "field": "department_id",
        "description": "Move risk from Operations to Finance department",
        "pending_changes": {"department_id": {"old": 1, "new": 2}},
    },
    # Risk category changes (§6.1)
    {
        "resource_type": ApprovalResourceType.RISK,
        "field": "category",
        "description": "Change risk category from Operational to Strategic",
        "pending_changes": {"category": {"old": "Operational", "new": "Strategic"}},
    },
    # Risk is_priority downgrade (§6.3)
    {
        "resource_type": ApprovalResourceType.RISK,
        "field": "is_priority",
        "description": "Downgrade priority risk to non-priority",
        "pending_changes": {"is_priority": {"old": True, "new": False}},
    },
    # Control owner_id changes (§6.1)
    {
        "resource_type": ApprovalResourceType.CONTROL,
        "field": "control_owner_id",
        "description": "Change control owner to different department",
        "pending_changes": {"control_owner_id": {"old": 6, "new": 7}},
    },
    # Control department_id changes (§6.1)
    {
        "resource_type": ApprovalResourceType.CONTROL,
        "field": "department_id",
        "description": "Move control from IT to Operations department",
        "pending_changes": {"department_id": {"old": 3, "new": 1}},
    },
    # NULL clearing scenario (§6.3)
    {
        "resource_type": ApprovalResourceType.RISK,
        "field": "owner_id",
        "description": "Clear owner (set to NULL)",
        "pending_changes": {"owner_id": {"old": 4, "new": None}},
    },
]


async def seed_sensitive_approvals():
    """Seed pending approvals for sensitive field changes."""
    print("=" * 60)
    print("🔍 PHASE 179-09: Sensitive Field Approval Data Seeding")
    print("=" * 60)

    async with session_context(get_settings()) as db:
        users, depts = await load_mappings(db)

        # Check for existing sensitive field approvals
        result = await db.execute(select(ApprovalRequest).where(ApprovalRequest.reason.contains("E2E-SENSITIVE")))
        existing = result.scalars().all()
        if existing:
            print(f"   ⏭️  Sensitive field approvals already seeded ({len(existing)} entries)")
            return

        # Get sample entities
        risk_result = await db.execute(select(Risk).limit(7))
        risks = risk_result.scalars().all()

        control_result = await db.execute(select(Control).limit(3))
        controls = control_result.scalars().all()

        # User mappings
        requester_id = users.get("ops.head@riskhub.local")
        approver_id = users.get("risk.manager@riskhub.local")

        created = 0
        risk_index = 0
        control_index = 0

        for scenario in SENSITIVE_FIELD_SCENARIOS:
            resource_type = scenario["resource_type"]

            # Get entity reference
            if resource_type == ApprovalResourceType.RISK and risks:
                entity = risks[risk_index % len(risks)]
                risk_index += 1
            elif resource_type == ApprovalResourceType.CONTROL and controls:
                entity = controls[control_index % len(controls)]
                control_index += 1
            else:
                print(f"   ⚠️ Skipping {scenario['field']}: no entities available")
                continue

            approval = ApprovalRequest(
                resource_type=resource_type,
                resource_id=entity.id,
                resource_name=entity.name or f"{resource_type.value} #{entity.id}",
                action_type=ApprovalActionType.EDIT,
                status=ApprovalStatus.PENDING,
                requested_by_id=requester_id,
                reason=f"E2E-SENSITIVE: {scenario['description']}",
                pending_changes=scenario["pending_changes"],
                primary_approver_id=approver_id,
            )
            db.add(approval)
            created += 1
            print(f"   ✓ {resource_type.value}/{scenario['field']}: {scenario['description']}")

        await db.commit()
        print(f"\n✅ Created {created} sensitive field approval requests")


if __name__ == "__main__":
    asyncio.run(seed_sensitive_approvals())
