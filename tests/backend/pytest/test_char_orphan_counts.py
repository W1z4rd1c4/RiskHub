"""Characterization + contract test: orphaned-item counts across the two read paths.

BACKGROUND — two read paths, historically divergent on TWO axes:

  1. app/core/_snapshot_metrics/orphaned.py::count_orphaned_items
     Dashboard snapshot metric. Returns a single int.
       - UNSCOPED (department_ids is None): counts EVERY unresolved OrphanedItem via
         `resolved_at IS NULL`, ignoring item_type (so KRI orphans ARE included).
       - SCOPED (department_ids set): historically joined ONLY risk + control rows,
         with NO branch that resolved a "kri" item_id -> department-scoped dashboards
         SILENTLY UNDER-COUNTED, dropping KRI orphans.

  2. app/services/_orphaned_items/stats.py::get_orphan_stats
     4-bar layout. Returns {risk_count, control_count, kri_count, total_count} and has
     ALWAYS counted "kri" orphans explicitly on BOTH its unscoped and scoped branches.

INTENT VERDICT (from git archaeology + write-path audit):

  AXIS (a) — scoped path omitting KRI: BUG (asymmetric drift, not a contract).
    KRI became a first-class orphan type in 15ee01d8 (2025-12-31): flagging.py flags
    item_type="kri", resolution.py resolves them, and the stats surface counted scoped
    KRIs from that same era. The snapshot metric was written risk+control-only three
    days later (001bb3e1, 2026-01-04) and merely extracted verbatim in 5f7f169e. No
    comment / ADR / test ever justified the omission -> oversight. FIXED in orphaned.py
    by adding the scoped KRI branch (mirrors stats.py's tested KRI->Risk->dept join).

  AXIS (b) — `status == "pending"` vs `resolved_at IS NULL`: NOT a bug; provably
    equivalent. The ONLY writes to these fields are: creation (status="pending",
    resolved_at NULL) and resolution.py:256-257 (status="resolved" AND
    resolved_at=utc_now() set together, atomically, in one boundary). No path sets one
    without the other, so for every row `status == "pending"` <=> `resolved_at IS NULL`.
    The two predicates can never disagree given current write paths. DELIBERATELY LEFT
    AS-IS: snapshot keeps `resolved_at IS NULL`, stats keeps `status == "pending"`; the
    counts are identical. Documented here rather than churned. See
    `test_status_and_resolved_at_are_equivalent_predicates`.

Seed (see `_seed_orphans`): 1 pending RISK + 1 pending CONTROL + 1 pending KRI (its
parent risk is in the same department) + 1 RESOLVED risk decoy. All live rows are in
`test_department`, so the scoped path (department-scoped user) sees all three.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core._permissions.scoping import get_user_department_ids
from app.core._snapshot_metrics.orphaned import count_orphaned_items
from app.models.orphaned_item import OrphanedItem
from app.services._orphaned_items.stats import get_orphan_stats
from tests.backend.pytest.factories import (
    create_test_control,
    create_test_kri,
    create_test_risk,
)

# ---------------------------------------------------------------------------
# CONCRETE PINNED NUMBERS.
# ---------------------------------------------------------------------------
EXPECTED_STATS_RISK_COUNT = 1
EXPECTED_STATS_CONTROL_COUNT = 1
EXPECTED_STATS_KRI_COUNT = 1
EXPECTED_STATS_TOTAL_COUNT = 3  # risk + control + kri, pending only (resolved decoy excluded)

# Snapshot UNSCOPED path counts ALL unresolved rows regardless of item_type. With
# 3 pending orphans (risk + control + kri) and 1 resolved decoy, that is 3.
EXPECTED_SNAPSHOT_UNSCOPED_COUNT = 3

# Snapshot SCOPED path AFTER the axis-(a) fix now includes the KRI orphan, so it equals
# the unscoped total and the stats total: 3. (Before the fix this was 2 — KRI dropped.)
EXPECTED_SNAPSHOT_SCOPED_COUNT = 3


async def _seed_orphans(db: AsyncSession, *, department_id: int, owner_id: int) -> None:
    """Seed one pending orphan of each type (risk/control/kri) + one resolved decoy."""
    risk = await create_test_risk(
        db, department_id=department_id, owner_id=owner_id, risk_id_code="R-ORPH-001"
    )
    resolved_risk = await create_test_risk(
        db, department_id=department_id, owner_id=owner_id, risk_id_code="R-ORPH-RESOLVED"
    )
    control = await create_test_control(db, department_id=department_id, owner_id=owner_id, name="Orphan Control")
    # KRI's parent risk is in `department_id`, so the scoped KRI join resolves into this dept.
    kri = await create_test_kri(db, risk_id=risk.id, metric_name="Orphan KRI")

    db.add_all(
        [
            OrphanedItem(
                item_type="risk",
                item_id=risk.id,
                previous_owner_id=owner_id,
                status="pending",
            ),
            OrphanedItem(
                item_type="control",
                item_id=control.id,
                previous_owner_id=owner_id,
                status="pending",
            ),
            OrphanedItem(
                item_type="kri",
                item_id=kri.id,
                previous_owner_id=owner_id,
                status="pending",
            ),
            # Resolved decoy: excluded by BOTH paths (resolved_at set / status resolved).
            OrphanedItem(
                item_type="risk",
                item_id=resolved_risk.id,
                previous_owner_id=owner_id,
                status="resolved",
                resolved_at=datetime.now(UTC),
                resolved_by_id=owner_id,
            ),
        ]
    )
    await db.commit()


@pytest.mark.asyncio
async def test_stats_path_counts_kri_orphan_explicitly(
    db_session: AsyncSession, test_department, test_user_cro
):
    """app/services/_orphaned_items/stats: KRI orphan IS counted (kri_count == 1)."""
    await _seed_orphans(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    stats = await get_orphan_stats(db_session, current_user=test_user_cro)
    assert stats["risk_count"] == EXPECTED_STATS_RISK_COUNT
    assert stats["control_count"] == EXPECTED_STATS_CONTROL_COUNT
    assert stats["kri_count"] == EXPECTED_STATS_KRI_COUNT
    assert stats["total_count"] == EXPECTED_STATS_TOTAL_COUNT


@pytest.mark.asyncio
async def test_snapshot_unscoped_orphan_count(
    db_session: AsyncSession, test_department, test_user_cro
):
    """app/core/_snapshot_metrics/orphaned: unscoped path counts every unresolved row.

    Pins the privileged (department_ids is None) total. Unchanged by the axis-(a) fix,
    which only touched the scoped branch.
    """
    await _seed_orphans(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    assert await count_orphaned_items(db_session, None) == EXPECTED_SNAPSHOT_UNSCOPED_COUNT


@pytest.mark.asyncio
async def test_snapshot_scoped_path_now_includes_kri_orphan(
    db_session: AsyncSession, test_department, test_user_employee
):
    """CONTRACT (axis (a) fix): the SCOPED snapshot path now counts KRI orphans.

    `test_user_employee` is AccessScope.DEPARTMENT in `test_department`, so
    get_user_department_ids -> [test_department.id] and count_orphaned_items takes its
    SCOPED branch. All three pending orphans live in that department (the KRI's parent
    risk is there too), so the corrected count is 3.

    RED→GREEN marker: before adding the KRI branch to orphaned.py this returned 2
    (risk + control only), silently dropping the KRI orphan. If this ever regresses to 2
    the scoped dashboard is under-counting again.
    """
    await _seed_orphans(db_session, department_id=test_department.id, owner_id=test_user_employee.id)

    dept_ids = get_user_department_ids(test_user_employee)
    assert dept_ids == [test_department.id]  # guard: we are exercising the SCOPED branch

    scoped_total = await count_orphaned_items(db_session, dept_ids)
    assert scoped_total == EXPECTED_SNAPSHOT_SCOPED_COUNT

    # The scoped snapshot total now agrees with the stats surface for the same user.
    stats = await get_orphan_stats(db_session, current_user=test_user_employee)
    assert scoped_total == stats["total_count"]
    assert stats["kri_count"] == EXPECTED_STATS_KRI_COUNT


@pytest.mark.asyncio
async def test_snapshot_and_stats_current_totals_side_by_side(
    db_session: AsyncSession, test_department, test_user_cro
):
    """All three totals (snapshot-unscoped, snapshot-scoped, stats) now agree at 3.

    Post-reconciliation the snapshot scoped path counts the KRI orphan like the unscoped
    path and the stats surface, so there is no longer a KRI-shaped divergence on any path.
    """
    await _seed_orphans(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    snapshot_unscoped = await count_orphaned_items(db_session, None)
    snapshot_scoped = await count_orphaned_items(db_session, [test_department.id])
    stats = await get_orphan_stats(db_session, current_user=test_user_cro)

    assert snapshot_unscoped == EXPECTED_SNAPSHOT_UNSCOPED_COUNT
    assert snapshot_scoped == EXPECTED_SNAPSHOT_SCOPED_COUNT
    assert stats["total_count"] == EXPECTED_STATS_TOTAL_COUNT
    assert stats["kri_count"] == EXPECTED_STATS_KRI_COUNT


@pytest.mark.asyncio
async def test_status_and_resolved_at_are_equivalent_predicates(
    db_session: AsyncSession, test_department, test_user_cro
):
    """DOCUMENT axis (b): `status == "pending"` and `resolved_at IS NULL` never disagree.

    The snapshot path filters on `resolved_at IS NULL`; the stats path filters on
    `status == "pending"`. This is DELIBERATELY not reconciled because the two predicates
    are provably co-set: every write sets them together (creation -> pending/NULL;
    resolution.py:256-257 -> resolved/utc_now() atomically). This test asserts that for
    the seeded data every row's pending-ness matches its resolved_at-nullness, so the two
    filters partition the table identically. If a future write path ever sets one without
    the other, this breaks and the two read paths would diverge.
    """
    await _seed_orphans(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    # Rows where the two predicates DISAGREE (pending but resolved, or resolved but not
    # pending) must be zero.
    disagreements = await db_session.scalar(
        select(func.count(OrphanedItem.id)).where(
            ((OrphanedItem.status == "pending") & OrphanedItem.resolved_at.is_not(None))
            | ((OrphanedItem.status != "pending") & OrphanedItem.resolved_at.is_(None))
        )
    )
    assert disagreements == 0

    # And the two filters yield the same count on the seeded table (3 unresolved).
    pending_count = await db_session.scalar(
        select(func.count(OrphanedItem.id)).where(OrphanedItem.status == "pending")
    )
    unresolved_count = await db_session.scalar(
        select(func.count(OrphanedItem.id)).where(OrphanedItem.resolved_at.is_(None))
    )
    assert pending_count == unresolved_count == EXPECTED_SNAPSHOT_UNSCOPED_COUNT
