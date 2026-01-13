"""
Phase 179-10: Permission-Gated Action Data Seeding
Seeds delete approvals, control execution logs, and KRI value history.

Enables permissions E2E tests that verify CRUD access rules.
"""
import asyncio
from datetime import datetime, timedelta, date
from sqlalchemy import select
from app.db.session import async_session_maker
from app.models import Risk, Control, KeyRiskIndicator, KRIValueHistory, ControlExecution
from app.models.approval_request import (
    ApprovalRequest, ApprovalStatus, ApprovalResourceType, ApprovalActionType
)
from scripts.e2e_mappings import load_mappings


async def seed_delete_approvals(db, users, risks, controls):
    """Seed DELETE approval requests from non-privileged users."""
    # Check if already seeded
    result = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.reason.contains("E2E-DELETE-PERM")
        )
    )
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
        print(f"   ✓ DELETE/risk: pending by employee")
    
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
        print(f"   ✓ DELETE/control: pending by employee")
    
    return created


async def seed_control_executions(db, users, controls):
    """Seed control execution log entries."""
    # Check if already seeded
    result = await db.execute(
        select(ControlExecution).where(
            ControlExecution.notes.contains("E2E-EXECUTION")
        )
    )
    if result.scalars().first():
        print("   ⏭️  Control executions already seeded")
        return 0
    
    executor_id = users.get("ops.analyst@riskhub.local")
    created = 0
    
    for i, control in enumerate(controls[:3]):  # First 3 controls
        execution = ControlExecution(
            control_id=control.id,
            executed_by_id=executor_id,
            executed_at=datetime.utcnow() - timedelta(days=i*7, hours=i*2),
            result="passed" if i % 2 == 0 else "warning",
            findings="No issues found" if i % 2 == 0 else "Minor deviations observed",
            evidence_reference=f"/evidence/control-{control.id}-q4-2025.pdf",
            notes=f"E2E-EXECUTION: Quarterly control test #{i+1}",
            next_scheduled=datetime.utcnow() + timedelta(days=30-i*7),
        )
        db.add(execution)
        created += 1
        print(f"   ✓ EXECUTION/control: {control.name[:40]}...")
    
    return created


async def seed_kri_value_history(db, users, kris):
    """Seed KRI value history entries including corrections."""
    # Check for existing E2E entries
    result = await db.execute(
        select(KRIValueHistory).limit(5)
    )
    existing = result.scalars().all()
    
    # Only seed if there are very few history entries
    if len(existing) >= 10:
        print("   ⏭️  KRI value history already has sufficient entries")
        return 0
    
    reporter_id = users.get("fin.analyst@riskhub.local")
    created = 0
    today = date.today()
    
    for i, kri in enumerate(kris[:3]):  # First 3 KRIs
        # Create historical value entries for past periods
        for period_offset in range(1, 4):  # Last 3 periods
            period_end = today - timedelta(days=period_offset * 30)
            period_start = period_end - timedelta(days=29)
            
            # Determine value and breach status
            value = 50 + i * 10 + period_offset * 5
            breach_status = "within"
            if value > 80:
                breach_status = "above"
            elif value < 30:
                breach_status = "below"
            
            history_entry = KRIValueHistory(
                kri_id=kri.id,
                period_start=period_start,
                period_end=period_end,
                recorded_at=datetime.utcnow() - timedelta(days=period_offset * 30 - 2),
                recorded_by_id=reporter_id,
                value=value,
                lower_limit=kri.lower_limit or 20,
                upper_limit=kri.upper_limit or 80,
                unit=kri.unit or "%",
                breach_status=breach_status,
            )
            db.add(history_entry)
            created += 1
    
    print(f"   ✓ KRI_VALUE_HISTORY: {created} period entries")
    return created


async def seed_permission_actions():
    """Main entry point."""
    print("="*60)
    print("🔍 PHASE 179-10: Permission-Gated Action Data Seeding")
    print("="*60)
    
    async with async_session_maker() as db:
        users, depts = await load_mappings(db)
        
        # Get sample entities
        risk_result = await db.execute(select(Risk).limit(3))
        risks = risk_result.scalars().all()
        
        control_result = await db.execute(select(Control).limit(5))
        controls = control_result.scalars().all()
        
        kri_result = await db.execute(select(KeyRiskIndicator).limit(5))
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
