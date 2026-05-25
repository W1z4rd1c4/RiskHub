"""
Phase 179-06: Master E2E Data Seeding
Orchestrates all E2E test data seeding scripts.

Usage:
    python -m scripts.seed_e2e_all

Or via seed_all.py with environment variable:
    SEED_E2E_DATA=true python -m scripts.seed_all
"""

import asyncio

from sqlalchemy import func, select

from app.core.config import get_settings
from app.db.session import session_context
from app.models import ApprovalRequest, Control, Issue, KeyRiskIndicator, Risk, Vendor
from scripts.seed_e2e_activity_logs import seed_activity_logs
from scripts.seed_e2e_approvals import seed_approvals
from scripts.seed_e2e_archives import seed_archives
from scripts.seed_e2e_controls import seed_controls
from scripts.seed_e2e_cross_dept import seed_cross_dept_scenarios
from scripts.seed_e2e_foundation import seed_foundation
from scripts.seed_e2e_issues import seed_issues
from scripts.seed_e2e_kris import seed_kris
from scripts.seed_e2e_permission_actions import seed_permission_actions
from scripts.seed_e2e_resolved_approvals import seed_resolved_approvals
from scripts.seed_e2e_risks import seed_risks
from scripts.seed_e2e_sensitive_approvals import seed_sensitive_approvals
from scripts.seed_e2e_vendors import seed_vendors


async def _run_step(step_number: int, label: str, coroutine):
    print(f"\n{step_number:02d}️⃣  {label}...")
    result = await coroutine()
    return result


async def _collect_summary_counts():
    async with session_context(get_settings()) as db:
        risks_active = (
            await db.execute(
                select(func.count(Risk.id)).where(
                    Risk.risk_id_code.like("E2E-%"),
                    Risk.is_archived.is_(False),
                )
            )
        ).scalar_one()
        risks_archived = (
            await db.execute(
                select(func.count(Risk.id)).where(
                    Risk.risk_id_code.like("E2E-%"),
                    Risk.is_archived.is_(True),
                )
            )
        ).scalar_one()

        controls_active = (
            await db.execute(
                select(func.count(Control.id)).where(
                    Control.name.like("E2E-%"),
                    Control.is_archived.is_(False),
                )
            )
        ).scalar_one()
        controls_archived = (
            await db.execute(
                select(func.count(Control.id)).where(
                    Control.name.like("E2E-%"),
                    Control.is_archived.is_(True),
                )
            )
        ).scalar_one()

        kris_active = (
            await db.execute(
                select(func.count(KeyRiskIndicator.id)).where(
                    KeyRiskIndicator.metric_name.like("E2E-%"),
                    KeyRiskIndicator.is_archived.is_(False),
                )
            )
        ).scalar_one()
        kris_archived = (
            await db.execute(
                select(func.count(KeyRiskIndicator.id)).where(
                    KeyRiskIndicator.metric_name.like("E2E-%"),
                    KeyRiskIndicator.is_archived.is_(True),
                )
            )
        ).scalar_one()

        vendors_active = (
            await db.execute(
                select(func.count(Vendor.id)).where(
                    Vendor.name.like("E2E-VENDOR-%"),
                    Vendor.is_archived.is_(False),
                )
            )
        ).scalar_one()
        vendors_archived = (
            await db.execute(
                select(func.count(Vendor.id)).where(
                    Vendor.name.like("E2E-VENDOR-%"),
                    Vendor.is_archived.is_(True),
                )
            )
        ).scalar_one()

        approvals_total = (
            await db.execute(select(func.count(ApprovalRequest.id)).where(ApprovalRequest.reason.like("E2E-%")))
        ).scalar_one()
        issues_total = (
            await db.execute(select(func.count(Issue.id)).where(Issue.title.like("E2E-ISSUE-%")))
        ).scalar_one()
        issues_non_closed = (
            await db.execute(
                select(func.count(Issue.id)).where(
                    Issue.title.like("E2E-ISSUE-%"),
                    Issue.status != "closed",
                )
            )
        ).scalar_one()

        return {
            "risks_active": risks_active,
            "risks_archived": risks_archived,
            "controls_active": controls_active,
            "controls_archived": controls_archived,
            "kris_active": kris_active,
            "kris_archived": kris_archived,
            "vendors_active": vendors_active,
            "vendors_archived": vendors_archived,
            "vendors_inactive": vendors_archived,
            "approvals_total": approvals_total,
            "issues_total": issues_total,
            "issues_non_closed": issues_non_closed,
        }


async def seed_e2e_all():
    """Orchestrate all E2E test data seeding."""
    print("\n" + "=" * 60)
    print("🌱 PHASE 179: E2E TEST DATA SEEDING")
    print("=" * 60)
    print("⚠️  E2E seeding contract: no user/department creation is allowed.")
    print("   If prerequisites are missing, run base seed first (python -m app.db.seed).")

    try:
        mappings = await _run_step(1, "Foundation & Verification", seed_foundation)
        if not mappings:
            print("❌ Prerequisites check failed!")
            return 1

        await _run_step(2, "Seeding Risks", seed_risks)
        await _run_step(3, "Seeding Controls", seed_controls)
        await _run_step(4, "Seeding KRIs", seed_kris)
        await _run_step(5, "Seeding Approvals", seed_approvals)
        await _run_step(6, "Seeding Activity Logs", seed_activity_logs)
        await _run_step(7, "Seeding Resolved Approvals", seed_resolved_approvals)
        await _run_step(8, "Seeding Sensitive Field Approvals", seed_sensitive_approvals)
        await _run_step(9, "Seeding Permission-Gated Actions", seed_permission_actions)
        await _run_step(10, "Seeding Cross-Department Scenarios", seed_cross_dept_scenarios)
        await _run_step(11, "Seeding Vendors", seed_vendors)
        await _run_step(12, "Seeding Issues", seed_issues)
        await _run_step(13, "Seeding Archive Matrix", seed_archives)
    except Exception as exc:
        print(f"\n❌ E2E seeding failed: {exc}")
        return 1

    summary = await _collect_summary_counts()

    print("\n" + "=" * 60)
    print("✅ E2E TEST DATA SEEDING COMPLETE")
    print("=" * 60)
    print("\n📊 Summary:")
    print(f"   • Risks active/archived: {summary['risks_active']}/{summary['risks_archived']}")
    print(f"   • Controls active/archived: {summary['controls_active']}/{summary['controls_archived']}")
    print(f"   • KRIs active/archived: {summary['kris_active']}/{summary['kris_archived']}")
    print(f"   • Vendors active/archived: {summary['vendors_active']}/{summary['vendors_archived']}")
    print(f"   • Approval requests with E2E marker: {summary['approvals_total']}")
    print(f"   • Issues total/non-closed: {summary['issues_total']}/{summary['issues_non_closed']}")
    print("\n💡 All entities prefixed with 'E2E-' for isolation")
    return 0


if __name__ == "__main__":
    exit(asyncio.run(seed_e2e_all()))
