"""
Phase 179-08: Resolved Approval Data Seeding
Seeds approval requests in terminal states (APPROVED, REJECTED, CANCELLED) for E2E tests.

Enables approval workflow tests that verify status transitions and history display.
"""

import asyncio
from datetime import timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.datetime_utils import utc_now
from app.db.session import session_context
from app.models import Control, Risk
from app.models.approval_request import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus
from scripts.e2e_mappings import load_mappings

# Resolved approval scenarios for E2E testing
RESOLVED_APPROVALS = [
    # APPROVED risk deletion
    {
        "id_suffix": "APPROVED-DELETE",
        "resource_type": ApprovalResourceType.RISK,
        "action_type": ApprovalActionType.DELETE,
        "status": ApprovalStatus.APPROVED,
        "reason": "E2E-RESOLVED: Approved risk deletion for testing history display",
        "resolution_notes": "Approved - risk is obsolete and no longer relevant",
    },
    # REJECTED risk deletion
    {
        "id_suffix": "REJECTED-DELETE",
        "resource_type": ApprovalResourceType.RISK,
        "action_type": ApprovalActionType.DELETE,
        "status": ApprovalStatus.REJECTED,
        "reason": "E2E-RESOLVED: Rejected request for testing rejection flow",
        "resolution_notes": "Rejected - risk still actively monitored",
    },
    # CANCELLED risk edit
    {
        "id_suffix": "CANCELLED-EDIT",
        "resource_type": ApprovalResourceType.RISK,
        "action_type": ApprovalActionType.EDIT,
        "status": ApprovalStatus.CANCELLED,
        "reason": "E2E-RESOLVED: Cancelled request by requester",
        "resolution_notes": "Cancelled by requester - change no longer needed",
        "pending_changes": {"description": {"old": "Original", "new": "Updated"}},
    },
    # APPROVED control deletion (tiered)
    {
        "id_suffix": "TIERED-APPROVED",
        "resource_type": ApprovalResourceType.CONTROL,
        "action_type": ApprovalActionType.DELETE,
        "status": ApprovalStatus.APPROVED,
        "reason": "E2E-RESOLVED: Tiered approval - required privileged approval",
        "resolution_notes": "Approved by CRO after primary approval",
        "requires_privileged": True,
    },
]


async def seed_resolved_approvals():
    """Seed resolved approval requests for E2E tests."""
    print("=" * 60)
    print("🔍 PHASE 179-08: Resolved Approval Data Seeding")
    print("=" * 60)

    async with session_context(get_settings()) as db:
        users, depts = await load_mappings(db)

        # Check for existing resolved E2E approvals
        result = await db.execute(select(ApprovalRequest).where(ApprovalRequest.reason.contains("E2E-RESOLVED")))
        existing = result.scalars().all()
        if existing:
            print(f"   ⏭️  Resolved approvals already seeded ({len(existing)} entries)")
            return

        # Get sample entities - try E2E risks first, then any risk
        risk_result = await db.execute(select(Risk).where(Risk.name.contains("E2E")).limit(3))
        risks = risk_result.scalars().all()
        if not risks:
            risk_result = await db.execute(select(Risk).limit(3))
            risks = risk_result.scalars().all()

        control_result = await db.execute(select(Control).where(Control.name.contains("E2E")).limit(2))
        controls = control_result.scalars().all()
        if not controls:
            control_result = await db.execute(select(Control).limit(2))
            controls = control_result.scalars().all()

        # User mappings
        requester_id = users.get("ops.head@riskhub.local")
        primary_approver_id = users.get("risk.manager@riskhub.local")
        privileged_approver_id = users.get("cro@riskhub.local")

        created = 0
        base_time = utc_now() - timedelta(days=7)
        risk_index = 0
        control_index = 0

        for i, scenario in enumerate(RESOLVED_APPROVALS):
            # Get entity reference
            if scenario["resource_type"] == ApprovalResourceType.RISK and risks:
                entity = risks[risk_index % len(risks)]
                risk_index += 1
            elif scenario["resource_type"] == ApprovalResourceType.CONTROL and controls:
                entity = controls[control_index % len(controls)]
                control_index += 1
            else:
                print(f"   ⚠️ Skipping {scenario['id_suffix']}: no entities available")
                continue

            # Determine resolver based on status
            if scenario["status"] == ApprovalStatus.CANCELLED:
                resolver_id = requester_id  # Self-cancelled
            elif scenario.get("requires_privileged"):
                resolver_id = privileged_approver_id
            else:
                resolver_id = primary_approver_id

            approval = ApprovalRequest(
                resource_type=scenario["resource_type"],
                resource_id=entity.id,
                resource_name=entity.name or f"{scenario['resource_type'].value} #{entity.id}",
                action_type=scenario["action_type"],
                status=scenario["status"],
                requested_by_id=requester_id,
                reason=scenario["reason"],
                pending_changes=scenario.get("pending_changes"),
                resolved_by_id=resolver_id,
                resolved_at=base_time + timedelta(days=i, hours=2),
                resolution_notes=scenario.get("resolution_notes"),
                primary_approver_id=primary_approver_id,
                requires_privileged_approval=scenario.get("requires_privileged", False),
                privileged_approver_id=privileged_approver_id if scenario.get("requires_privileged") else None,
                # Don't set created_at - let the model default handle it
            )

            # Set primary_approved_at for tiered approvals
            if scenario.get("requires_privileged"):
                approval.primary_approved_at = base_time + timedelta(days=i, hours=1)
                approval.privileged_approved_at = base_time + timedelta(days=i, hours=2)

            db.add(approval)
            created += 1
            print(f"   ✓ {scenario['status'].value}: {scenario['resource_type'].value} {scenario['action_type'].value}")

        await db.commit()
        print(f"\n✅ Created {created} resolved approval requests")


if __name__ == "__main__":
    asyncio.run(seed_resolved_approvals())
