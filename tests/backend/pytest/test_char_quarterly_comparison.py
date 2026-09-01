"""Characterization test: live-vs-snapshot resolution in quarterly comparison.

PURPOSE (regression safety net for a later refactor):
app/services/_quarterly_comparison/snapshots.py picks, for a requested quarter, whether to
serve LIVE metrics (current quarter) or a STORED snapshot (past quarter), and how to map a
department-id list to a single snapshot scope. This file PINS all branches:

  resolve_snapshot_department_id(dept_ids):
    None            -> None            (global scope)
    [single]        -> single          (that department's snapshot)
    [a, b, ...]     -> "unavailable"   (no multi-dept snapshot exists)

  resolve_snapshot_metrics(...):
    snapshot_department_id == "unavailable"   -> empty, missing, no stored metadata
    is_live_current_quarter                    -> live metrics, live, no stored metadata
    stored snapshot found                     -> saved metrics, stored, capture time/type
    stored snapshot missing                   -> empty, missing, no stored metadata

>>> CROSS-MODULE IDENTITY (the "live" path IS the snapshot metric set) <<<
The live branch returns EXACTLY app.core.snapshot_service.capture_snapshot_metrics(db,
dept_ids) — the same aggregation captured into stored snapshots — so a live current-quarter
comparison and a freshly-captured snapshot are byte-for-byte identical dicts. This is pinned
in test_live_path_equals_capture_snapshot_metrics so a refactor cannot let the live and
stored comparison paths drift apart.

Seed: one active priority risk + one breaching KRI so capture_snapshot_metrics has non-zero,
distinguishable values (priority_risks == 1, kri_breaches == 1).
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.snapshot_service import capture_snapshot_metrics, save_quarter_snapshot
from app.services._quarterly_comparison.snapshots import (
    resolve_snapshot_department_id,
    resolve_snapshot_metrics,
)
from tests.backend.pytest.factories import create_test_kri, create_test_risk

QUARTER_LABEL = "2026-Q1"


async def _seed_distinguishable_metrics(db: AsyncSession, *, department_id: int, owner_id: int) -> None:
    """One priority risk + one breaching KRI so the metric dict has non-zero markers."""
    risk = await create_test_risk(
        db,
        department_id=department_id,
        owner_id=owner_id,
        risk_id_code="R-QC-001",
        overrides={"is_priority": True, "net_score": 20},
    )
    await create_test_kri(
        db,
        risk_id=risk.id,
        metric_name="Breaching QC",
        overrides={"current_value": 150.0, "lower_limit": 0.0, "upper_limit": 100.0},
    )


def test_resolve_snapshot_department_id_branches():
    """Pure mapping: None -> None, single -> id, multi -> 'unavailable'."""
    assert resolve_snapshot_department_id(None) is None
    assert resolve_snapshot_department_id([7]) == 7
    assert resolve_snapshot_department_id([7, 9]) == "unavailable"
    assert resolve_snapshot_department_id([]) == "unavailable"  # empty list is not len==1


@pytest.mark.asyncio
async def test_live_path_equals_capture_snapshot_metrics(db_session: AsyncSession, test_department, test_user_cro):
    """Live current-quarter path returns capture_snapshot_metrics verbatim, tagged 'live'."""
    await _seed_distinguishable_metrics(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    metrics, source, observed_at, snapshot_type, metric_definitions = await resolve_snapshot_metrics(
        db_session,
        quarter_label=QUARTER_LABEL,
        is_live_current_quarter=True,
        dept_ids=None,
        snapshot_department_id=None,
    )
    expected = await capture_snapshot_metrics(db_session, None)

    assert source == "live"
    assert observed_at is None
    assert snapshot_type is None
    assert metric_definitions["priority_risks"] == "riskhub.snapshot.priority_risks.v1"
    assert metrics == expected
    # Sanity: the distinguishing markers are present and non-zero.
    assert metrics["priority_risks"] == 1
    assert metrics["kri_breaches"] == 1


@pytest.mark.asyncio
async def test_stored_path_returns_saved_metrics(db_session: AsyncSession, test_department, test_user_cro):
    """A past-quarter request with a stored snapshot returns the saved dict, tagged 'stored'."""
    await _seed_distinguishable_metrics(db_session, department_id=test_department.id, owner_id=test_user_cro.id)
    stored_metrics = {"priority_risks": 42, "kri_breaches": 7}
    await save_quarter_snapshot(
        db_session,
        quarter_label=QUARTER_LABEL,
        year=2026,
        quarter_number=1,
        metrics=stored_metrics,
        department_id=None,
    )
    await db_session.commit()

    metrics, source, observed_at, snapshot_type, metric_definitions = await resolve_snapshot_metrics(
        db_session,
        quarter_label=QUARTER_LABEL,
        is_live_current_quarter=False,
        dept_ids=None,
        snapshot_department_id=None,
    )

    assert source == "stored"
    assert observed_at is not None
    assert snapshot_type.value == "quarter_end"
    assert metric_definitions == {}
    # Returns the SAVED numbers, NOT the live ones (live would be priority_risks==1).
    assert metrics == stored_metrics


@pytest.mark.asyncio
async def test_stored_path_missing_snapshot_returns_missing(db_session: AsyncSession):
    """A past-quarter request with no stored snapshot returns ({}, 'missing')."""
    metrics, source, observed_at, snapshot_type, metric_definitions = await resolve_snapshot_metrics(
        db_session,
        quarter_label="2020-Q4",
        is_live_current_quarter=False,
        dept_ids=None,
        snapshot_department_id=None,
    )
    assert metrics == {}
    assert source == "missing"
    assert observed_at is None
    assert snapshot_type is None
    assert metric_definitions == {}


@pytest.mark.asyncio
async def test_multi_department_scope_is_unavailable(db_session: AsyncSession):
    """A 'unavailable' snapshot scope short-circuits to ({}, 'missing') even when live."""
    metrics, source, observed_at, snapshot_type, metric_definitions = await resolve_snapshot_metrics(
        db_session,
        quarter_label=QUARTER_LABEL,
        is_live_current_quarter=True,  # ignored; the 'unavailable' guard wins
        dept_ids=[1, 2],
        snapshot_department_id="unavailable",
    )
    assert metrics == {}
    assert source == "missing"
    assert observed_at is None
    assert snapshot_type is None
    assert metric_definitions == {}
