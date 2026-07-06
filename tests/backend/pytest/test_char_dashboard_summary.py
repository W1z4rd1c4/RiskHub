"""Characterization test: build_dashboard_summary_metrics rollups.

PURPOSE (regression safety net for a later consolidation):
app/services/_dashboard_metrics/lifecycle.py::build_dashboard_summary_metrics builds the
main dashboard summary (control counts by status/form/frequency, risk counts by status,
critical_risks_count, average_net_risk_score, vendor totals). This file PINS the current
numbers on a small deterministic seed.

>>> CROSS-MODULE NOTE (does it re-derive _snapshot_metrics rollups? — NO) <<<
The triage suspected build_dashboard_summary_metrics re-derives rollups that
app/core/_snapshot_metrics also computes. It does NOT share code with _snapshot_metrics and
the overlapping-looking fields are computed from DIFFERENT predicates:

  - total_risks here = COUNT(Risk) WHERE Risk.live() (all live, any status), whereas
    _snapshot_metrics.count_active_risks additionally requires status == 'active'. For an
    all-active seed they coincide; with a non-active live risk they DIVERGE (pinned below in
    test_total_risks_counts_all_live_not_just_active).
  - critical_risks_count here uses the bounded net_score range [16,25]; _snapshot_metrics has
    NO critical concept (it emits priority_risks + control_coverage instead). See
    test_char_snapshot_risk_control.py for the full three-way divergence write-up.
  - high_risk_vendors_count here = Vendor.risk_score_1_5 >= 4; _snapshot_metrics only counts
    active_vendors (no risk-score cut). Different metric.

So there is no shared rollup to keep in sync — the two surfaces answer different questions.

Evidence:
  - lifecycle.py:57   `risk_conditions.append(Risk.live())`   (total_risks = live, any status)
  - lifecycle.py:105  `build_risk_level_condition_from_ranges("critical", risk_level_ranges)`
  - lifecycle.py:126  `select(func.count(Vendor.id)).where(and_(*(vendor_conditions + [Vendor.risk_score_1_5 >= 4])))`

Seed (single department, privileged CRO):
  - 2 active risks (net_score 20 critical, net_score 4 not) + 1 'emerging'-status
    LIVE risk (net_score 4) -> 3 live risks total, 1 critical.
  - 2 controls: 1 active, 1 inactive.
  - 2 vendors: 1 high-risk (risk_score_1_5=5), 1 low (risk_score_1_5=2).
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.risk import RiskStatus
from app.services._dashboard_metrics.lifecycle import build_dashboard_summary_metrics
from tests.backend.pytest.factories import create_test_control, create_test_risk, create_test_vendor

# ---------------------------------------------------------------------------
# CONCRETE PINNED NUMBERS (current behavior, default thresholds, all live).
# ---------------------------------------------------------------------------
EXPECTED_TOTAL_RISKS = 3  # all LIVE risks regardless of status (2 active + 1 draft)
EXPECTED_CRITICAL_RISKS = 1  # only the net_score-20 risk falls in [16, 25]
EXPECTED_TOTAL_CONTROLS = 2  # both live controls
EXPECTED_ACTIVE_CONTROLS = 1  # one control with status 'active'
EXPECTED_TOTAL_VENDORS = 2  # both live vendors
EXPECTED_HIGH_RISK_VENDORS = 1  # only risk_score_1_5 >= 4
EXPECTED_AVG_NET_SCORE = 9.33  # round((20 + 4 + 4) / 3, 2)


async def _seed_dashboard_mix(db: AsyncSession, *, department_id: int, owner_id: int) -> None:
    await create_test_risk(
        db,
        department_id=department_id,
        owner_id=owner_id,
        risk_id_code="R-DASH-CRIT",
        overrides={"net_score": 20, "status": RiskStatus.active.value},
    )
    await create_test_risk(
        db,
        department_id=department_id,
        owner_id=owner_id,
        risk_id_code="R-DASH-ACT",
        overrides={"net_score": 4, "status": RiskStatus.active.value},
    )
    # A LIVE but non-'active' status risk (emerging). Counts toward total_risks (live) but
    # NOT toward the snapshot's active-risk count -> the divergence pinned below.
    await create_test_risk(
        db,
        department_id=department_id,
        owner_id=owner_id,
        risk_id_code="R-DASH-EMERGING",
        overrides={"net_score": 4, "status": RiskStatus.emerging.value},
    )
    await create_test_control(
        db, department_id=department_id, owner_id=owner_id, name="Active Control", overrides={"status": "active"}
    )
    await create_test_control(
        db, department_id=department_id, owner_id=owner_id, name="Inactive Control", overrides={"status": "inactive"}
    )
    await create_test_vendor(
        db, department_id=department_id, owner_id=owner_id, name="High Risk Vendor", overrides={"risk_score_1_5": 5}
    )
    await create_test_vendor(
        db, department_id=department_id, owner_id=owner_id, name="Low Risk Vendor", overrides={"risk_score_1_5": 2}
    )


async def _summary(db: AsyncSession, current_user):
    return await build_dashboard_summary_metrics(
        db=db,
        current_user=current_user,
        department_id=None,
        control_status=None,
        control_form=None,
        risk_level=None,
        include_archived=False,
    )


@pytest.mark.asyncio
async def test_dashboard_summary_pins_current_totals(db_session: AsyncSession, test_department, test_user_cro):
    """Pin every headline number the summary returns for the deterministic seed."""
    await _seed_dashboard_mix(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    summary = await _summary(db_session, test_user_cro)

    assert summary.total_risks == EXPECTED_TOTAL_RISKS
    assert summary.critical_risks_count == EXPECTED_CRITICAL_RISKS
    assert summary.total_controls == EXPECTED_TOTAL_CONTROLS
    assert summary.controls_by_status.get("active") == EXPECTED_ACTIVE_CONTROLS
    assert summary.total_vendors == EXPECTED_TOTAL_VENDORS
    assert summary.high_risk_vendors_count == EXPECTED_HIGH_RISK_VENDORS
    assert summary.average_net_risk_score == EXPECTED_AVG_NET_SCORE
    # risks_by_status only includes non-zero buckets.
    assert summary.risks_by_status.get(RiskStatus.active.value) == 2
    assert summary.risks_by_status.get(RiskStatus.emerging.value) == 1


@pytest.mark.asyncio
async def test_total_risks_counts_all_live_not_just_active(db_session: AsyncSession, test_department, test_user_cro):
    """DIVERGENCE PIN: dashboard total_risks (live, any status) != snapshot active-risk count.

    The dashboard counts the LIVE emerging risk in total_risks (3), while
    app/core/_snapshot_metrics/risk_control.count_active_risks requires status == 'active'
    and would return 2 on the same seed. This is the concrete case that shows the two
    surfaces are NOT computing the same rollup, so a later 'unification' must preserve the
    predicate difference.
    """
    from app.core._snapshot_metrics.risk_control import count_active_risks

    await _seed_dashboard_mix(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    summary = await _summary(db_session, test_user_cro)
    snapshot_active = await count_active_risks(db_session, None)

    assert summary.total_risks == EXPECTED_TOTAL_RISKS  # 3 (live, any status)
    assert snapshot_active == 2  # active-only
    assert summary.total_risks != snapshot_active
