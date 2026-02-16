"""
Phase 179-05: Approval Request Seeding
Creates 5 pre-populated approval requests for E2E testing.

⚠️ WARNING: These approvals must remain in PENDING state for tests.
Do NOT approve/reject them during development!
"""

import asyncio

from sqlalchemy import select

from app.core.config import get_settings
from app.core.datetime_utils import utc_now
from app.db.session import session_context
from app.models import Control, Risk
from app.models.approval_request import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus
from scripts.e2e_mappings import load_mappings_strict, require_user_id

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
    print("=" * 60)
    print("🔍 PHASE 179-05: Approval Request Seeding")
    print("=" * 60)

    async with session_context(get_settings()) as db:
        users, _ = await load_mappings_strict(db, context="seed_e2e_approvals")

        created = 0
        updated = 0
        deduped = 0

        for approval_data in APPROVALS:
            data = approval_data.copy()

            # Get resource ID and name
            resource_type = data.pop("resource_type")

            if resource_type == ApprovalResourceType.RISK:
                risk_code = data.pop("risk_code")
                result = await db.execute(select(Risk).where(Risk.risk_id_code == risk_code))
                entity = result.scalar_one_or_none()
                if not entity:
                    print(f"   ⚠️ Risk {risk_code} not found")
                    continue
                resource_id = entity.id
                resource_name = entity.name
            else:
                control_name = data.pop("control_name")
                result = await db.execute(select(Control).where(Control.name == control_name))
                entity = result.scalar_one_or_none()
                if not entity:
                    print(f"   ⚠️ Control {control_name} not found")
                    continue
                resource_id = entity.id
                resource_name = entity.name

            # Resolve user IDs
            requester_id = require_user_id(users, data.pop("requester"))
            primary_approver_id = require_user_id(users, data.pop("primary_approver"))

            action_type = data.pop("action_type")
            approval_status = data.pop("status")
            requires_privileged = data.pop("requires_privileged")
            reason = data.pop("reason")
            pending_changes = data.pop("pending_changes", None)

            existing_rows = (
                (
                    await db.execute(
                        select(ApprovalRequest)
                        .where(ApprovalRequest.reason == reason)
                        .order_by(ApprovalRequest.id.asc())
                    )
                )
                .scalars()
                .all()
            )

            approval = existing_rows[0] if existing_rows else None
            if len(existing_rows) > 1:
                for duplicate in existing_rows[1:]:
                    await db.delete(duplicate)
                    deduped += 1

            if approval is None:
                approval = ApprovalRequest(
                    resource_type=resource_type,
                    resource_id=resource_id,
                    resource_name=resource_name,
                    action_type=action_type,
                    status=approval_status,
                    requested_by_id=requester_id,
                    primary_approver_id=primary_approver_id,
                    requires_privileged_approval=requires_privileged,
                    reason=reason,
                    pending_changes=pending_changes,
                )
                db.add(approval)
                created += 1
                print(f"   ✓ CREATED {resource_type.value.upper()} #{resource_id}: {action_type.value}")
            else:
                approval.resource_type = resource_type
                approval.resource_id = resource_id
                approval.resource_name = resource_name
                approval.action_type = action_type
                approval.status = approval_status
                approval.requested_by_id = requester_id
                approval.primary_approver_id = primary_approver_id
                approval.requires_privileged_approval = requires_privileged
                approval.pending_changes = pending_changes
                approval.resolved_by_id = None
                approval.resolved_at = None
                approval.resolution_notes = None
                approval.privileged_approver_id = None
                approval.privileged_approved_at = None
                updated += 1
                print(f"   ↺ UPDATED {resource_type.value.upper()} #{resource_id}: {action_type.value}")

            # Set primary_approved_at only for pending privileged fixtures.
            if approval.status == ApprovalStatus.PENDING_PRIVILEGED:
                approval.primary_approved_at = utc_now()
            else:
                approval.primary_approved_at = None

        await db.commit()

        print(f"\n✅ Approval fixtures normalized: created={created}, updated={updated}, deduped={deduped}")


if __name__ == "__main__":
    asyncio.run(seed_approvals())
