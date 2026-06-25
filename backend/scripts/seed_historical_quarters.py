"""Seed 9 quarters of historical data (2024-Q1 .. 2026-Q1) for the dashboard
Quarterly Comparison widget.

The widget mixes two metric families:

* 6 "period" metrics (new_risks, archived_risks, audit_activity, failed_audits,
  unaudited_controls, activity_volume) are computed live by the backend from
  date-bucketed rows. They need real backdated entities to show history.
* 10 "snapshot" metrics (priority_risks, kri_breaches, pending_approvals,
  control_coverage, orphaned_items, kri_health, overdue_kris, risks_without_kri,
  active_risks, active_vendors) are read from stored QuarterlyMetricSnapshot
  rows for past quarters. They need snapshot rows.

This seeder backdates one coherent set of entities, then derives each quarter's
10 snapshot metrics "as of quarter end" from those same rows (so stored
snapshots stay consistent with the live period metrics) and upserts global +
per-department QuarterlyMetricSnapshot rows.

Run (from the backend/ directory, with the dev env loaded):

    python -m scripts.seed_historical_quarters            # seed if not present
    python -m scripts.seed_historical_quarters --reset    # wipe + reseed

All seeded rows carry stable markers so --reset can remove exactly what this
script created and nothing else. Re-running without --reset is a no-op once
seeded. The RNG is seeded deterministically, so --reset rebuilds identically.
"""

from __future__ import annotations

import argparse
import asyncio
import random
from datetime import date, datetime, timedelta

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.snapshot_periods import get_quarter_end, get_quarter_start
from app.core.snapshot_service import save_quarter_snapshot
from app.db.session import session_context
from app.models.activity_log import ActivityAction, ActivityEntityType, ActivityLog
from app.models.approval_request import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
)
from app.models.control import Control
from app.models.control_execution import ControlExecution, ExecutionResult
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.kri_history import KRIValueHistory
from app.models.orphaned_item import OrphanedItem
from app.models.quarterly_metric_snapshot import (
    QuarterlyMetricSnapshot as QuarterlyMetricSnapshotModel,
)
from app.models.risk import ControlRiskLink, Risk
from app.models.vendor import Vendor

# --- target quarters -------------------------------------------------------
QUARTERS: list[tuple[int, int]] = [
    (2024, 1), (2024, 2), (2024, 3), (2024, 4),
    (2025, 1), (2025, 2), (2025, 3), (2025, 4),
    (2026, 1),
]

# --- idempotency markers ---------------------------------------------------
RISK_CODE_PREFIX = "SH-R-"
CONTROL_NAME_PREFIX = "[seed-hist] "
KRI_NAME_PREFIX = "[seed-hist] "
VENDOR_REG_PREFIX = "SEEDHIST-"
LINK_MARKER = "seed-hist"          # control_risk_links.notes
EXEC_MARKER = "seed-hist"          # control_executions.evidence_reference
APPROVAL_MARKER = "seed-hist"      # approval_requests.scenario_key
ACTIVITY_MARKER = "[seed-hist]"    # activity_logs.description contains this
SNAPSHOT_NOTES = "seed:hist:v1"    # quarterly_metric_snapshots.notes

# exact metric keys the dashboard reads from snapshot metrics JSON
SNAPSHOT_KEYS = (
    "priority_risks",
    "kri_breaches",
    "pending_approvals",
    "control_coverage",
    "orphaned_items",
    "kri_health",
    "overdue_kris",
    "risks_without_kri",
    "active_risks",
    "active_vendors",
)

RNG = random.Random(20240101)


def quarter_bounds(year: int, q: int) -> tuple[datetime, datetime]:
    """Return (start, end) where end is the exclusive start of the next quarter."""
    return get_quarter_start(year, q), get_quarter_end(year, q)


def quarter_last_day(year: int, q: int) -> date:
    """Last calendar day of the quarter (period_end for KRI history)."""
    _, end = quarter_bounds(year, q)
    return (end - timedelta(days=1)).date()


def random_dt_in(start: datetime, end: datetime) -> datetime:
    """A deterministic-random tz-aware datetime within [start, end)."""
    span_days = max((end - start).days, 1)
    offset = timedelta(
        days=RNG.randrange(span_days),
        hours=RNG.randrange(24),
        minutes=RNG.randrange(60),
    )
    return start + offset


# ---------------------------------------------------------------------------
# reset
# ---------------------------------------------------------------------------
async def reset_seeded(db: AsyncSession) -> None:
    """Delete every row this seeder created, in FK-safe order."""
    marked_risk_ids = select(Risk.id).where(Risk.risk_id_code.like(f"{RISK_CODE_PREFIX}%"))
    marked_control_ids = select(Control.id).where(Control.name.like(f"{CONTROL_NAME_PREFIX}%"))
    marked_kri_ids = select(KeyRiskIndicator.id).where(
        KeyRiskIndicator.metric_name.like(f"{KRI_NAME_PREFIX}%")
    )

    await db.execute(
        delete(QuarterlyMetricSnapshotModel).where(
            QuarterlyMetricSnapshotModel.notes == SNAPSHOT_NOTES
        )
    )
    await db.execute(
        delete(KRIValueHistory).where(KRIValueHistory.kri_id.in_(marked_kri_ids))
    )
    await db.execute(
        delete(ControlExecution).where(ControlExecution.evidence_reference == EXEC_MARKER)
    )
    await db.execute(delete(ControlRiskLink).where(ControlRiskLink.notes == LINK_MARKER))
    await db.execute(
        delete(OrphanedItem).where(
            (
                (OrphanedItem.item_type == "risk")
                & (OrphanedItem.item_id.in_(marked_risk_ids))
            )
            | (
                (OrphanedItem.item_type == "control")
                & (OrphanedItem.item_id.in_(marked_control_ids))
            )
        )
    )
    await db.execute(
        delete(ApprovalRequest).where(ApprovalRequest.scenario_key == APPROVAL_MARKER)
    )
    # ActivityLog is ORM append-only; raw SQL bypasses the unit-of-work guard.
    await db.execute(
        text("DELETE FROM activity_logs WHERE description LIKE :pat"),
        {"pat": f"%{ACTIVITY_MARKER}%"},
    )
    await db.execute(
        delete(KeyRiskIndicator).where(
            KeyRiskIndicator.metric_name.like(f"{KRI_NAME_PREFIX}%")
        )
    )
    await db.execute(delete(Vendor).where(Vendor.registration_id.like(f"{VENDOR_REG_PREFIX}%")))
    await db.execute(delete(Risk).where(Risk.risk_id_code.like(f"{RISK_CODE_PREFIX}%")))
    await db.execute(delete(Control).where(Control.name.like(f"{CONTROL_NAME_PREFIX}%")))
    await db.commit()


# ---------------------------------------------------------------------------
# entity seeding
# ---------------------------------------------------------------------------
async def seed_entities(db: AsyncSession, owner_id: int, dept_ids: list[int]) -> dict:
    """Create all backdated entities. Returns in-memory collections for the
    snapshot computation."""
    # --- controls (stable set, created at the start of the window) ---------
    controls: list[Control] = []
    c_start, _ = quarter_bounds(*QUARTERS[0])
    for i in range(20):
        controls.append(
            Control(
                name=f"{CONTROL_NAME_PREFIX}Control {i + 1:02d}",
                description="Backdated historical control for dashboard demo data.",
                status="active",
                department_id=dept_ids[i % len(dept_ids)],
                control_owner_id=owner_id,
                created_by_id=owner_id,
                created_at=c_start,
                updated_at=c_start,
            )
        )
    db.add_all(controls)

    # --- risks (created across quarters; archive a subset later) -----------
    risk_records: list[dict] = []
    counter = 0
    for year, q in QUARTERS:
        start, end = quarter_bounds(year, q)
        for _ in range(RNG.randint(3, 9)):
            counter += 1
            risk_records.append(
                {
                    "code": f"{RISK_CODE_PREFIX}{counter:04d}",
                    "name": f"{CONTROL_NAME_PREFIX}Risk {counter:04d}",
                    "dept": RNG.choice(dept_ids),
                    "created": random_dt_in(start, end),
                    "priority": RNG.random() < 0.30,
                    "archived_at": None,
                }
            )

    # archive pass: each quarter retire a few previously-created risks
    for year, q in QUARTERS[1:]:
        start, end = quarter_bounds(year, q)
        candidates = [r for r in risk_records if r["created"] < start and r["archived_at"] is None]
        k = min(len(candidates), RNG.randint(0, 3))
        for r in RNG.sample(candidates, k):
            r["archived_at"] = random_dt_in(start, end)

    risks: list[Risk] = []
    for r in risk_records:
        archived_at = r["archived_at"]
        risks.append(
            Risk(
                risk_id_code=r["code"],
                name=r["name"],
                process="Historical demo process",
                description="Backdated historical risk for dashboard demo data.",
                status="active",
                is_priority=r["priority"],
                department_id=r["dept"],
                owner_id=owner_id,
                is_archived=archived_at is not None,
                archived_at=archived_at,
                archived_by_id=owner_id if archived_at is not None else None,
                created_at=r["created"],
                updated_at=archived_at if archived_at is not None else r["created"],
            )
        )
    db.add_all(risks)
    await db.flush()  # assign control + risk ids

    risk_by_dept_created = sorted(risks, key=lambda x: x.created_at)

    # --- control-risk links (drives control_coverage) ----------------------
    links: list[ControlRiskLink] = []
    for rk in risks:
        if RNG.random() < 0.70:
            for ctrl in RNG.sample(controls, RNG.randint(1, 2)):
                links.append(
                    ControlRiskLink(
                        control_id=ctrl.id,
                        risk_id=rk.id,
                        notes=LINK_MARKER,
                        created_at=rk.created_at,
                    )
                )
    db.add_all(links)

    # --- control executions (audit_activity / failed_audits / unaudited) ---
    for year, q in QUARTERS:
        start, end = quarter_bounds(year, q)
        executed = RNG.sample(controls, RNG.randint(8, min(18, len(controls))))
        for ctrl in executed:
            failed = RNG.random() < 0.15
            db.add(
                ControlExecution(
                    control_id=ctrl.id,
                    executed_by_id=owner_id,
                    result=ExecutionResult.failed.value if failed else ExecutionResult.passed.value,
                    evidence_reference=EXEC_MARKER,
                    executed_at=random_dt_in(start, end),
                )
            )

    # --- KRIs linked to early risks ----------------------------------------
    early_risks = [r for r in risk_by_dept_created if r.created_at < quarter_bounds(2024, 4)[0]]
    kri_risks = early_risks[: min(18, len(early_risks))]
    kris: list[KeyRiskIndicator] = []
    for i, rk in enumerate(kri_risks):
        kris.append(
            KeyRiskIndicator(
                risk_id=rk.id,
                metric_name=f"{KRI_NAME_PREFIX}KRI {i + 1:02d}",
                description="Backdated historical KRI for dashboard demo data.",
                current_value=50.0,
                lower_limit=20.0,
                upper_limit=80.0,
                reporting_owner_id=owner_id,
                created_at=rk.created_at,
                last_reported_at=rk.created_at,
                last_updated=rk.created_at,
            )
        )
    db.add_all(kris)
    await db.flush()  # assign kri ids

    # --- KRI value history (drives kri_breaches/kri_health/overdue) ---------
    histories_by_kri: dict[int, list[KRIValueHistory]] = {k.id: [] for k in kris}
    for kri in kris:
        kri_start_idx = next(
            (idx for idx, (y, q) in enumerate(QUARTERS) if quarter_bounds(y, q)[0] > kri.created_at),
            1,
        )
        kri_start_idx = max(kri_start_idx - 1, 0)
        last_value = 50.0
        for year, q in QUARTERS[kri_start_idx:]:
            if RNG.random() < 0.20:
                continue  # skipped measurement -> contributes to overdue
            value = round(RNG.uniform(0, 100), 1)
            if value < kri.lower_limit:
                breach = "below"
            elif value > kri.upper_limit:
                breach = "above"
            else:
                breach = "within"
            start, _ = quarter_bounds(year, q)
            hist = KRIValueHistory(
                kri_id=kri.id,
                period_start=start.date(),
                period_end=quarter_last_day(year, q),
                value=value,
                lower_limit=kri.lower_limit,
                upper_limit=kri.upper_limit,
                breach_status=breach,
                recorded_by_id=owner_id,
                recorded_at=quarter_bounds(year, q)[1] - timedelta(days=1),
            )
            histories_by_kri[kri.id].append(hist)
            db.add(hist)
            last_value = value
        kri.current_value = last_value  # keep live value coherent with history

    # --- vendors (created across quarters; archive a subset) ---------------
    vendor_records: list[dict] = []
    for vi in range(24):
        year, q = RNG.choice(QUARTERS[:6])  # appear in the first six quarters
        start, end = quarter_bounds(year, q)
        vendor_records.append(
            {
                "idx": vi,
                "dept": RNG.choice(dept_ids),
                "created": random_dt_in(start, end),
                "archived_at": None,
            }
        )
    for year, q in QUARTERS[3:]:
        start, end = quarter_bounds(year, q)
        candidates = [v for v in vendor_records if v["created"] < start and v["archived_at"] is None]
        k = min(len(candidates), RNG.randint(0, 2))
        for v in RNG.sample(candidates, k):
            v["archived_at"] = random_dt_in(start, end)

    vendors: list[Vendor] = []
    for v in vendor_records:
        archived_at = v["archived_at"]
        vendors.append(
            Vendor(
                name=f"{CONTROL_NAME_PREFIX}Vendor {v['idx'] + 1:02d}",
                process="Historical demo vendor service",
                outsourcing_owner_user_id=owner_id,
                department_id=v["dept"],
                registration_id=f"{VENDOR_REG_PREFIX}{v['idx'] + 1:04d}",
                is_archived=archived_at is not None,
                archived_at=archived_at,
                created_at=v["created"],
                updated_at=archived_at if archived_at is not None else v["created"],
            )
        )
    db.add_all(vendors)

    # --- approvals (drives pending_approvals as-of) ------------------------
    # A partial unique index (ux_approval_pending) forbids duplicate
    # (resource_type, resource_id, action_type) among PENDING rows; we keep
    # every (resource_id, action_type) pair globally unique to stay clear of it.
    approvals: list[ApprovalRequest] = []
    used_pairs: set[tuple[int, str]] = set()
    for qi, (year, q) in enumerate(QUARTERS):
        start, end = quarter_bounds(year, q)
        eligible = [r for r in risks if r.created_at < end]
        if not eligible:
            continue
        for _ in range(RNG.randint(2, 6)):
            chosen: tuple[Risk, str] | None = None
            for _attempt in range(10):
                cand_risk = RNG.choice(eligible)
                cand_action = RNG.choice(["delete", "edit"])
                if (cand_risk.id, cand_action) not in used_pairs:
                    chosen = (cand_risk, cand_action)
                    break
            if chosen is None:
                continue
            rk, action = chosen
            used_pairs.add((rk.id, action))
            created = random_dt_in(start, end)
            resolved_at = None
            status = ApprovalStatus("PENDING")
            if RNG.random() < 0.60 and qi < len(QUARTERS) - 1:
                ry, rq = QUARTERS[RNG.randint(qi, len(QUARTERS) - 1)]
                rs, re = quarter_bounds(ry, rq)
                resolved_at = random_dt_in(max(rs, created + timedelta(days=1)), re)
                status = ApprovalStatus("APPROVED" if RNG.random() < 0.7 else "REJECTED")
            ap = ApprovalRequest(
                resource_type=ApprovalResourceType("risk"),
                resource_id=rk.id,
                resource_name=rk.name,
                action_type=ApprovalActionType(action),
                status=status,
                requested_by_id=owner_id,
                reason="Historical demo approval request.",
                scenario_key=APPROVAL_MARKER,
                created_at=created,
                resolved_at=resolved_at,
            )
            approvals.append(ap)
            db.add(ap)

    # --- orphaned items (drives orphaned_items as-of) ----------------------
    orphaned: list[OrphanedItem] = []
    for qi, (year, q) in enumerate(QUARTERS):
        start, end = quarter_bounds(year, q)
        for _ in range(RNG.randint(2, 5)):
            if RNG.random() < 0.6 and risks:
                item_type, entity = "risk", RNG.choice(risks)
            else:
                item_type, entity = "control", RNG.choice(controls)
            orphaned_at = random_dt_in(start, end)
            resolved_at = None
            status = "pending"
            if RNG.random() < 0.5 and qi < len(QUARTERS) - 1:
                ry, rq = QUARTERS[RNG.randint(qi, len(QUARTERS) - 1)]
                rs, re = quarter_bounds(ry, rq)
                resolved_at = random_dt_in(max(rs, orphaned_at + timedelta(days=1)), re)
                status = "resolved"
            oi = OrphanedItem(
                item_type=item_type,
                item_id=entity.id,
                previous_owner_id=owner_id,
                status=status,
                orphaned_at=orphaned_at,
                resolved_at=resolved_at,
            )
            orphaned.append(oi)
            db.add(oi)

    # --- activity logs (drives activity_volume) ----------------------------
    entity_choices = ["risk", "control", "kri", "vendor", "approval"]
    action_choices = ["create", "update", "archive", "approve", "status_change"]
    for year, q in QUARTERS:
        start, end = quarter_bounds(year, q)
        for _ in range(RNG.randint(30, 110)):
            et = RNG.choice(entity_choices)
            db.add(
                ActivityLog(
                    entity_type=ActivityEntityType(et),
                    entity_id=RNG.randint(1, 999),
                    entity_name=f"{ACTIVITY_MARKER} {et} record",
                    action=ActivityAction(RNG.choice(action_choices)),
                    actor_id=owner_id,
                    actor_name="Historical Seed",
                    department_id=RNG.choice(dept_ids),
                    description=f"{ACTIVITY_MARKER} backdated activity for demo data.",
                    created_at=random_dt_in(start, end),
                )
            )

    await db.commit()

    risk_dept = {r.id: r.department_id for r in risks}
    control_dept = {c.id: c.department_id for c in controls}
    return {
        "risks": risks,
        "kris": kris,
        "histories_by_kri": histories_by_kri,
        "links": links,
        "vendors": vendors,
        "approvals": approvals,
        "orphaned": orphaned,
        "risk_dept": risk_dept,
        "control_dept": control_dept,
        "counts": {
            "controls": len(controls),
            "risks": len(risks),
            "links": len(links),
            "kris": len(kris),
            "vendors": len(vendors),
            "approvals": len(approvals),
            "orphaned": len(orphaned),
        },
    }


# ---------------------------------------------------------------------------
# as-of snapshot computation
# ---------------------------------------------------------------------------
def compute_metrics(data: dict, end: datetime, end_date: date, dept: int | None) -> dict[str, int]:
    risks = data["risks"]
    kris = data["kris"]
    histories_by_kri = data["histories_by_kri"]
    risk_dept = data["risk_dept"]
    control_dept = data["control_dept"]

    def in_scope_risk(r: Risk) -> bool:
        return dept is None or r.department_id == dept

    active = [
        r
        for r in risks
        if r.created_at < end
        and r.status == "active"
        and (r.archived_at is None or r.archived_at >= end)
        and in_scope_risk(r)
    ]
    active_count = len(active)
    priority = sum(1 for r in active if r.is_priority)

    kri_risk_ids = {k.risk_id for k in kris if k.created_at < end}
    without_kri = sum(1 for r in active if r.id not in kri_risk_ids)

    linked_risk_ids = {link.risk_id for link in data["links"] if link.created_at < end}
    with_link = sum(1 for r in active if r.id in linked_risk_ids)
    coverage = round(with_link / active_count * 100) if active_count else 0

    # KRI metrics from history, as of quarter end; dept via the KRI's risk
    measured = breaches = within = overdue = 0
    for kri in kris:
        if kri.created_at >= end:
            continue
        if dept is not None and risk_dept.get(kri.risk_id) != dept:
            continue
        hist = [h for h in histories_by_kri[kri.id] if h.period_end < end_date]
        if not hist:
            continue
        latest = max(hist, key=lambda h: h.period_end)
        measured += 1
        if latest.value < latest.lower_limit or latest.value > latest.upper_limit:
            breaches += 1
        else:
            within += 1
        if latest.period_end + timedelta(days=15) < end_date:
            overdue += 1
    kri_health = round(within / measured * 100) if measured else 0

    pending = sum(
        1
        for a in data["approvals"]
        if a.created_at < end
        and (a.resolved_at is None or a.resolved_at >= end)
        and (dept is None or risk_dept.get(a.resource_id) == dept)
    )

    orph = 0
    for o in data["orphaned"]:
        if o.orphaned_at < end and (o.resolved_at is None or o.resolved_at >= end):
            if dept is None:
                orph += 1
            else:
                edept = risk_dept.get(o.item_id) if o.item_type == "risk" else control_dept.get(o.item_id)
                if edept == dept:
                    orph += 1

    vends = sum(
        1
        for v in data["vendors"]
        if v.created_at < end
        and (v.archived_at is None or v.archived_at >= end)
        and (dept is None or v.department_id == dept)
    )

    metrics = {
        "priority_risks": priority,
        "kri_breaches": breaches,
        "pending_approvals": pending,
        "control_coverage": coverage,
        "orphaned_items": orph,
        "kri_health": kri_health,
        "overdue_kris": overdue,
        "risks_without_kri": without_kri,
        "active_risks": active_count,
        "active_vendors": vends,
    }
    # guarantee all expected keys are present
    return {key: int(metrics[key]) for key in SNAPSHOT_KEYS}


async def write_snapshots(db: AsyncSession, data: dict, owner_id: int, dept_ids: list[int]) -> int:
    scopes: list[int | None] = [None, *dept_ids]
    written = 0
    for year, q in QUARTERS:
        _, end = quarter_bounds(year, q)
        end_date = end.date()
        label = f"{year}-Q{q}"
        for dept in scopes:
            metrics = compute_metrics(data, end, end_date, dept)
            await save_quarter_snapshot(
                db,
                quarter_label=label,
                year=year,
                quarter_number=q,
                metrics=metrics,
                department_id=dept,
                captured_by_user_id=owner_id,
                notes=SNAPSHOT_NOTES,
            )
            written += 1
    await db.commit()
    return written


# ---------------------------------------------------------------------------
# entrypoint
# ---------------------------------------------------------------------------
async def run(reset: bool) -> None:
    settings = get_settings()
    async with session_context(settings) as db:
        if reset:
            print("Resetting previously seeded historical data...")
            await reset_seeded(db)

        already = (
            await db.execute(
                select(func.count(Risk.id)).where(Risk.risk_id_code.like(f"{RISK_CODE_PREFIX}%"))
            )
        ).scalar() or 0
        if already and not reset:
            print(f"Historical data already present ({already} risks). Use --reset to rebuild.")
            return

        user_ids = [r[0] for r in (await db.execute(text("SELECT id FROM users ORDER BY id"))).all()]
        dept_ids = [
            r[0] for r in (await db.execute(text("SELECT id FROM departments ORDER BY id"))).all()
        ]
        if not user_ids or not dept_ids:
            raise SystemExit("No users/departments found. Run the base seed first.")
        owner_id = user_ids[0]

        print(f"Seeding entities across {len(QUARTERS)} quarters...")
        data = await seed_entities(db, owner_id, dept_ids)
        print("  created:", ", ".join(f"{k}={v}" for k, v in data["counts"].items()))

        print(f"Writing snapshots for {len(QUARTERS)} quarters x {len(dept_ids) + 1} scopes...")
        written = await write_snapshots(db, data, owner_id, dept_ids)
        print(f"Done. Upserted {written} QuarterlyMetricSnapshot rows.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed historical quarterly comparison data.")
    parser.add_argument("--reset", action="store_true", help="Delete previously seeded data first.")
    args = parser.parse_args()
    asyncio.run(run(args.reset))


if __name__ == "__main__":
    main()
