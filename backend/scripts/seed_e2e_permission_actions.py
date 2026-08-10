"""
Phase 179-10: Permission-Gated Action Data Seeding
Seeds delete approvals, control execution logs, and KRI value history.

Enables permissions E2E tests that verify CRUD access rules.

Determinism contract: every row this module writes is FIXTURE-OWNED and
FIXTURE-DATED —

- Target entities are the E2E fixture rows themselves, addressed by their
  natural markers (``E2E-KRI-…`` metric names, ``E2E-…`` risk codes,
  ``E2E-CTRL-…`` control names), never "first N by id", so a run against a
  database that also holds real data can only ever touch fixture rows.
- Every date-bearing value — including the ``(kri_id, period_end)`` natural
  key of ``kri_value_history`` — derives from the pinned
  ``E2E_PERMISSION_ACTIONS_ANCHOR`` constant, never from runtime today.
  Re-runs on ANY later day therefore address the SAME rows (upsert
  ``created=0``) instead of minting new period rows or colliding with real
  history. No permission-action E2E spec reads these rows' dates (audited
  2026-07); a spec that ever needs "recent" data must import and share this
  anchor rather than compare against runtime today.
"""

import asyncio
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import session_context
from app.models import Control, ControlExecution, KeyRiskIndicator, KRIValueHistory, Risk
from app.models.approval_request import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus
from scripts.e2e_mappings import load_mappings
from scripts.seed_e2e_kris import E2E_KRI_NAMES

# The single fixture time anchor (see the module docstring). All periods,
# execution timestamps, and recording times hang off these constants.
E2E_PERMISSION_ACTIONS_ANCHOR = date(2026, 6, 30)
_ANCHOR_TIME = datetime(2026, 6, 30, 12, 0, tzinfo=UTC)


async def seed_delete_approvals(db, users, risks, controls):
    """Seed DELETE approval requests from non-privileged users."""
    # Check if already seeded
    result = await db.execute(select(ApprovalRequest).where(ApprovalRequest.reason.contains("E2E-DELETE-PERM")))
    if result.scalars().first():
        print("   ⏭️  Delete approvals already seeded")
        return 0

    # Non-privileged user requests, department head approves
    requester_id = users.get("ops.analyst@riskhub.local")
    approver_id = users.get("ops.head@riskhub.local")

    created = 0

    # Risk delete approval
    if risks:
        approval = ApprovalRequest(
            resource_type=ApprovalResourceType.RISK,
            resource_id=risks[0].id,
            resource_name=risks[0].name or f"Risk #{risks[0].id}",
            action_type=ApprovalActionType.DELETE,
            status=ApprovalStatus.PENDING,
            requested_by_id=requester_id,
            reason="E2E-DELETE-PERM: Employee requests risk deletion for testing",
            primary_approver_id=approver_id,
        )
        db.add(approval)
        created += 1
        print("   ✓ DELETE/risk: pending by employee")

    # Control delete approval
    if controls:
        approval = ApprovalRequest(
            resource_type=ApprovalResourceType.CONTROL,
            resource_id=controls[0].id,
            resource_name=controls[0].name or f"Control #{controls[0].id}",
            action_type=ApprovalActionType.DELETE,
            status=ApprovalStatus.PENDING,
            requested_by_id=requester_id,
            reason="E2E-DELETE-PERM: Employee requests control deletion for testing",
            primary_approver_id=approver_id,
        )
        db.add(approval)
        created += 1
        print("   ✓ DELETE/control: pending by employee")

    return created


async def seed_control_executions(db, users, controls):
    """Seed control execution log entries."""
    # Check if already seeded
    result = await db.execute(select(ControlExecution).where(ControlExecution.notes.contains("E2E-EXECUTION")))
    if result.scalars().first():
        print("   ⏭️  Control executions already seeded")
        return 0

    executor_id = users.get("ops.analyst@riskhub.local")
    created = 0

    for i, control in enumerate(controls[:3]):  # First 3 fixture controls
        execution = ControlExecution(
            control_id=control.id,
            executed_by_id=executor_id,
            executed_at=_ANCHOR_TIME - timedelta(days=i * 7, hours=i * 2),
            result="passed" if i % 2 == 0 else "warning",
            findings="No issues found" if i % 2 == 0 else "Minor deviations observed",
            evidence_reference="/evidence/placeholder-pdf-012.pdf",
            notes=f"E2E-EXECUTION: Quarterly control test #{i+1}",
            next_scheduled=_ANCHOR_TIME + timedelta(days=30 - i * 7),
        )
        db.add(execution)
        created += 1
        print(f"   ✓ EXECUTION/control: {control.name[:40]}...")

    return created


async def seed_kri_value_history(db, users, kris):
    """Upsert KRI value history entries by natural key (kri_id, period_end).

    ``kris`` are the fixture KRIs (E2E-KRI-… markers) and every period end
    derives from ``E2E_PERMISSION_ACTIONS_ANCHOR``, so the nine natural keys
    are the same on every run, on every day — later-day re-runs update in
    place (created=0) and can never absorb or overwrite non-fixture history.
    """
    reporter_id = users.get("fin.analyst@riskhub.local")
    created = 0
    updated = 0

    for i, kri in enumerate(kris[:3]):  # The first 3 fixture KRIs by marker
        # Create historical value entries for past periods
        for period_offset in range(1, 4):  # Last 3 periods before the anchor
            period_end = E2E_PERMISSION_ACTIONS_ANCHOR - timedelta(days=period_offset * 30)
            period_start = period_end - timedelta(days=29)

            # Determine value and breach status
            value = 50 + i * 10 + period_offset * 5
            breach_status = "within"
            if value > 80:
                breach_status = "above"
            elif value < 30:
                breach_status = "below"

            payload = {
                "period_start": period_start,
                "recorded_at": _ANCHOR_TIME - timedelta(days=period_offset * 30 - 2),
                "recorded_by_id": reporter_id,
                "value": value,
                "lower_limit": kri.lower_limit or 20,
                "upper_limit": kri.upper_limit or 80,
                "unit": kri.unit or "%",
                "breach_status": breach_status,
            }

            # Rows are unique on (kri_id, period_end): update if present, create if absent.
            result = await db.execute(
                select(KRIValueHistory).where(
                    KRIValueHistory.kri_id == kri.id,
                    KRIValueHistory.period_end == period_end,
                )
            )
            history_entry = result.scalar_one_or_none()
            if history_entry is None:
                db.add(KRIValueHistory(kri_id=kri.id, period_end=period_end, **payload))
                created += 1
            else:
                for key, value_ in payload.items():
                    setattr(history_entry, key, value_)
                updated += 1

    print(f"   ✓ KRI_VALUE_HISTORY: created={created}, updated={updated}")
    return created


async def seed_permission_actions():
    """Main entry point."""
    print("=" * 60)
    print("🔍 PHASE 179-10: Permission-Gated Action Data Seeding")
    print("=" * 60)

    async with session_context(get_settings()) as db:
        users, depts = await load_mappings(db)

        # Fixture entities only, addressed by their seed markers in stable
        # marker order — never "first N rows of the table".
        risk_result = await db.execute(
            select(Risk).where(Risk.risk_id_code.like("E2E-%")).order_by(Risk.risk_id_code).limit(3)
        )
        risks = risk_result.scalars().all()

        control_result = await db.execute(
            select(Control).where(Control.name.like("E2E-CTRL-%")).order_by(Control.name).limit(5)
        )
        controls = control_result.scalars().all()

        kri_result = await db.execute(
            select(KeyRiskIndicator)
            .where(KeyRiskIndicator.metric_name.in_(E2E_KRI_NAMES))
            .order_by(KeyRiskIndicator.metric_name)
            .limit(5)
        )
        kris = kri_result.scalars().all()

        total = 0

        # Seed delete approvals
        count = await seed_delete_approvals(db, users, risks, controls)
        total += count

        # Seed control executions
        count = await seed_control_executions(db, users, controls)
        total += count

        # Seed KRI value history
        count = await seed_kri_value_history(db, users, kris)
        total += count

        await db.commit()
        print(f"\n✅ Created {total} permission-gated action entries")


if __name__ == "__main__":
    asyncio.run(seed_permission_actions())
