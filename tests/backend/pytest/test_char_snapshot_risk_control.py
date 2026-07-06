"""Characterization test: risk/control snapshot metrics + the "critical"/"coverage" divergence.

PURPOSE (regression safety net for a later consolidation):
app/core/_snapshot_metrics/risk_control.py computes three read-side rollups used by the
quarterly snapshot:

  - count_priority_risks       -> COUNT(Risk) WHERE is_priority AND Risk.live()
  - count_active_risks         -> COUNT(Risk) WHERE status == 'active' AND Risk.live()
  - calculate_control_coverage -> round(distinct risks-with-a-control / active-risks * 100)

This file PINS the current numbers so a refactor is provably behavior-preserving.

>>> CROSS-MODULE DIVERGENCE (three parallel, NON-equivalent "critical/priority" notions) <<<
The triage suspected _snapshot_metrics and _dashboard_metrics re-derive the same rollups.
They do NOT — they expose DIFFERENT concepts under adjacent names, and there is a THIRD in
the register listing. Pinned here so a later phase does not "unify" them blindly:

  (A) SNAPSHOT   app/core/_snapshot_metrics/risk_control.py
        "priority" == the Risk.is_priority BOOLEAN FLAG. There is NO net_score/critical
        notion here at all. Also emits control_coverage (a %), which the dashboard lacks.

  (B) DASHBOARD  app/services/_dashboard_metrics/lifecycle.py::build_dashboard_summary_metrics
        critical_risks_count == net_score in the BOUNDED RANGE [critical, MAX_NET_SCORE]
        i.e. [16, 25] by default (build_risk_level_condition_from_ranges("critical", ...)
        -> and_(net_score >= 16, net_score <= 25)). There is NO is_priority notion and NO
        control_coverage here.

  (C) REGISTER   app/services/_register_listings/risks.py (highlighted_count)
        "highlighted" == net_score >= critical_risk_min_net_score, i.e. net_score >= 16 with
        NO upper bound (Risk.net_score >= critical_risk_min_net_score). Same lower edge as
        (B) but an UNBOUNDED predicate, not a range.

(B) and (C) coincide numerically ONLY because net_score is capped at MAX_NET_SCORE (25):
[16, 25] and >= 16 select the same rows while no row exceeds 25. If a net_score ever
exceeded 25 they would diverge. (A) is a wholly different metric (a flag, not a score).
`test_priority_flag_and_critical_range_are_different_concepts` pins that a priority risk
need NOT be "critical" and a critical risk need NOT be "priority".

Evidence:
  - risk_control.py:9   `Risk.is_priority.is_(True),`                          (snapshot -> flag)
  - lifecycle.py:105    `build_risk_level_condition_from_ranges("critical", risk_level_ranges)`
  - _config/lookup.py:69 `"critical": (critical, ConfigDefaults.MAX_NET_SCORE),`  (range [16,25])
  - risks.py:135        `func.sum(case((Risk.net_score >= critical_risk_min_net_score, 1)...`

Seed (single department, one privileged CRO owner):
  - R-CRIT-PRIO   net_score 20, is_priority=True, active, HAS a control  -> critical AND priority AND covered
  - R-CRIT-ONLY   net_score 18, is_priority=False, active, NO control    -> critical, not priority, not covered
  - R-PRIO-ONLY   net_score  6, is_priority=True, active, NO control     -> priority, not critical, not covered
  - R-PLAIN       net_score  4, is_priority=False, active, NO control    -> neither
  - R-ARCHIVED    net_score 20, is_priority=True, archived               -> excluded by Risk.live() everywhere
So: 4 live active risks; 2 are is_priority; 2 are critical([16,25]); 1 of 4 has a control.
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core._snapshot_metrics.risk_control import (
    calculate_control_coverage,
    count_active_risks,
    count_priority_risks,
)
from app.models.risk import ControlRiskLink
from app.services._dashboard_metrics.lifecycle import build_dashboard_summary_metrics
from app.services._dashboard_metrics.risk_levels import (
    build_risk_level_condition_from_ranges,
    get_configured_risk_level_ranges,
)
from tests.backend.pytest.factories import create_test_control, create_test_risk

# ---------------------------------------------------------------------------
# CONCRETE PINNED NUMBERS (current behavior, default thresholds 5/10/16, MAX 25).
# ---------------------------------------------------------------------------
EXPECTED_ACTIVE_RISKS = 4  # four live active risks (archived one excluded by Risk.live())
EXPECTED_PRIORITY_RISKS = 2  # is_priority flag: R-CRIT-PRIO + R-PRIO-ONLY
EXPECTED_CRITICAL_RISKS = 2  # dashboard critical range [16,25]: R-CRIT-PRIO(20) + R-CRIT-ONLY(18)
EXPECTED_CONTROL_COVERAGE_PCT = 25  # 1 of 4 active risks has a linked control -> round(1/4*100)


async def _seed_risk_control_mix(db: AsyncSession, *, department_id: int, owner_id: int) -> None:
    """Seed 4 live active risks (2 priority, 2 critical, 1 covered) + 1 archived decoy."""
    covered = await create_test_risk(
        db,
        department_id=department_id,
        owner_id=owner_id,
        risk_id_code="R-CRIT-PRIO",
        overrides={"net_score": 20, "is_priority": True},
    )
    await create_test_risk(
        db,
        department_id=department_id,
        owner_id=owner_id,
        risk_id_code="R-CRIT-ONLY",
        overrides={"net_score": 18, "is_priority": False},
    )
    await create_test_risk(
        db,
        department_id=department_id,
        owner_id=owner_id,
        risk_id_code="R-PRIO-ONLY",
        overrides={"net_score": 6, "is_priority": True},
    )
    await create_test_risk(
        db,
        department_id=department_id,
        owner_id=owner_id,
        risk_id_code="R-PLAIN",
        overrides={"net_score": 4, "is_priority": False},
    )
    # Archived decoy: critical + priority, but Risk.live() excludes it everywhere.
    await create_test_risk(
        db,
        department_id=department_id,
        owner_id=owner_id,
        risk_id_code="R-ARCHIVED",
        overrides={"net_score": 20, "is_priority": True, "is_archived": True},
    )
    # Exactly ONE of the four active risks gets a linked control -> coverage 25%.
    control = await create_test_control(db, department_id=department_id, owner_id=owner_id, name="Coverage Control")
    db.add(ControlRiskLink(control_id=control.id, risk_id=covered.id))
    await db.commit()


@pytest.mark.asyncio
async def test_snapshot_count_active_risks(db_session: AsyncSession, test_department, test_user_cro):
    """app/core/_snapshot_metrics/risk_control: count_active_risks == 4 (archived excluded)."""
    await _seed_risk_control_mix(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    assert await count_active_risks(db_session, None) == EXPECTED_ACTIVE_RISKS
    assert await count_active_risks(db_session, [test_department.id]) == EXPECTED_ACTIVE_RISKS


@pytest.mark.asyncio
async def test_snapshot_count_priority_risks_uses_is_priority_flag(
    db_session: AsyncSession, test_department, test_user_cro
):
    """app/core/_snapshot_metrics/risk_control: count_priority_risks counts the FLAG, not score.

    R-CRIT-ONLY (net_score 18) is 'critical' but is_priority=False, so it is NOT counted;
    R-PRIO-ONLY (net_score 6) is not critical but IS priority, so it IS counted. This proves
    the snapshot 'priority' concept is the boolean flag, orthogonal to the score-based
    'critical' notion the dashboard uses.
    """
    await _seed_risk_control_mix(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    assert await count_priority_risks(db_session, None) == EXPECTED_PRIORITY_RISKS
    assert await count_priority_risks(db_session, [test_department.id]) == EXPECTED_PRIORITY_RISKS


@pytest.mark.asyncio
async def test_snapshot_control_coverage_is_percent_of_active_risks_with_a_control(
    db_session: AsyncSession, test_department, test_user_cro
):
    """app/core/_snapshot_metrics/risk_control: calculate_control_coverage == 25 (1 of 4).

    DIVERGENCE MARKER: this control_coverage % is emitted ONLY by _snapshot_metrics; there is
    no parallel control_coverage in build_dashboard_summary_metrics (grep confirms it is absent
    from lifecycle.py). So this metric has NO cross-module twin to drift against.
    """
    await _seed_risk_control_mix(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    assert await calculate_control_coverage(db_session, None) == EXPECTED_CONTROL_COVERAGE_PCT
    assert await calculate_control_coverage(db_session, [test_department.id]) == EXPECTED_CONTROL_COVERAGE_PCT


@pytest.mark.asyncio
async def test_dashboard_critical_count_uses_bounded_range_not_priority_flag(
    db_session: AsyncSession, test_department, test_user_cro
):
    """app/services/_dashboard_metrics/lifecycle: critical_risks_count == 2 via [16,25] range.

    Pins the dashboard 'critical' notion and shows it is NOT the snapshot 'priority' count:
    both happen to be 2 here BY CONSTRUCTION of the seed, but they select DIFFERENT risks
    (critical = R-CRIT-PRIO + R-CRIT-ONLY; priority = R-CRIT-PRIO + R-PRIO-ONLY). The
    concept-difference itself is pinned in the next test.
    """
    await _seed_risk_control_mix(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    summary = await build_dashboard_summary_metrics(
        db=db_session,
        current_user=test_user_cro,
        department_id=None,
        control_status=None,
        control_form=None,
        risk_level=None,
        include_archived=False,
    )
    assert summary.critical_risks_count == EXPECTED_CRITICAL_RISKS
    # Dashboard total_risks (live) equals the snapshot active count for this all-active seed.
    assert summary.total_risks == EXPECTED_ACTIVE_RISKS


@pytest.mark.asyncio
async def test_priority_flag_and_critical_range_are_different_concepts(
    db_session: AsyncSession, test_department, test_user_cro
):
    """PIN the divergence: 'priority' (flag) and 'critical' (score range) are not the same set.

    Snapshot count_priority_risks and dashboard critical_risks_count each return 2 for this
    seed, yet the risk SETS differ: one critical risk (R-CRIT-ONLY) is not priority, and one
    priority risk (R-PRIO-ONLY) is not critical. A refactor that 'merges' these two metrics
    would silently change one of the two dashboards. This asserts they are provably distinct
    concepts, not a duplicated rollup.
    """
    await _seed_risk_control_mix(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    priority_count = await count_priority_risks(db_session, None)
    ranges = await get_configured_risk_level_ranges(db_session)
    # The critical predicate is a bounded range [16, 25], not an open >= threshold.
    critical_condition = build_risk_level_condition_from_ranges("critical", ranges)
    assert critical_condition is not None
    from sqlalchemy import func, select

    from app.models import Risk

    critical_count = await db_session.scalar(
        select(func.count(Risk.id)).where(Risk.live(), critical_condition)
    )

    # Same cardinality (2 == 2) but that is a seed coincidence, not an identity...
    assert priority_count == 2
    assert critical_count == 2

    # ...proven by the fact that the intersection is strictly smaller than either set:
    # only R-CRIT-PRIO is BOTH priority and critical.
    both_count = await db_session.scalar(
        select(func.count(Risk.id)).where(Risk.live(), Risk.is_priority.is_(True), critical_condition)
    )
    assert both_count == 1
    assert both_count < priority_count
    assert both_count < critical_count
