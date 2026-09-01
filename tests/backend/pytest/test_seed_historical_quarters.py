from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import snapshot_service
from app.core.datetime_utils import coerce_utc
from app.core.snapshot_service import (
    SNAPSHOT_METRIC_DEFINITION_IDS,
    SNAPSHOT_METRIC_DEFINITIONS_KEY,
)
from app.models import KeyRiskIndicator, KRIValueHistory, Risk, User
from app.models.key_risk_indicator import KRIFrequency
from app.models.quarterly_metric_snapshot import QuarterlyMetricSnapshot
from app.services._quarterly_comparison.composition import build_quarterly_comparison
from scripts.seed_historical_quarters import QUARTERS, write_snapshots


@pytest.mark.asyncio
async def test_historical_seeder_writes_comparable_stock_metric_definitions(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    seed_data = {
        "risks": [],
        "kris": [],
        "histories_by_kri": {},
        "risk_dept": {},
        "control_dept": {},
        "links": [],
        "approvals": [],
        "orphaned": [],
        "vendors": [],
    }

    written = await write_snapshots(db_session, seed_data, test_user.id, [])

    assert written == len(QUARTERS)
    seeded_snapshot = (
        await db_session.execute(
            select(QuarterlyMetricSnapshot).where(
                QuarterlyMetricSnapshot.quarter == "2026-Q1",
                QuarterlyMetricSnapshot.department_id.is_(None),
            )
        )
    ).scalar_one()
    assert seeded_snapshot.metrics[SNAPSHOT_METRIC_DEFINITIONS_KEY] == (
        SNAPSHOT_METRIC_DEFINITION_IDS
    )
    expected_observed_at = datetime(2026, 4, 1, tzinfo=UTC)
    assert coerce_utc(seeded_snapshot.captured_at) == expected_observed_at

    comparison = await build_quarterly_comparison(
        db_session,
        test_user,
        current_quarter="2026-Q1",
        compare_quarter="2025-Q4",
    )
    assert comparison["changes"]["active_risks"] == {
        "absolute": 0,
        "percentage": 0,
        "direction": "same",
    }
    assert (
        comparison["metric_observations"]["active_risks"]["current"]["observed_at"]
        == expected_observed_at.isoformat()
    )


@pytest.mark.asyncio
async def test_manual_snapshot_without_explicit_boundary_uses_capture_time(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    capture_time = datetime(2026, 5, 12, 14, 30, tzinfo=UTC)
    monkeypatch.setattr(snapshot_service, "utc_now", lambda: capture_time)

    snapshot = await snapshot_service.save_quarter_snapshot(
        db_session,
        quarter_label="2026-Q2",
        year=2026,
        quarter_number=2,
        metrics={"active_risks": 3},
        snapshot_type="manual",
    )

    assert snapshot.captured_at == capture_time


@pytest.mark.asyncio
async def test_historical_seeder_uses_frequency_aligned_overdue_kri_definition(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    risk = Risk(
        id=501,
        status="active",
        is_priority=False,
        department_id=None,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        archived_at=None,
    )
    kri = KeyRiskIndicator(
        id=601,
        risk_id=risk.id,
        frequency=KRIFrequency.quarterly.value,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
    )
    q4_history = KRIValueHistory(
        kri_id=kri.id,
        period_start=date(2024, 10, 1),
        period_end=date(2024, 12, 31),
        value=50,
        lower_limit=20,
        upper_limit=80,
    )
    seed_data = {
        "risks": [risk],
        "kris": [kri],
        "histories_by_kri": {kri.id: [q4_history]},
        "risk_dept": {risk.id: None},
        "control_dept": {},
        "links": [],
        "approvals": [],
        "orphaned": [],
        "vendors": [],
    }

    await write_snapshots(db_session, seed_data, test_user.id, [])

    snapshots = {
        snapshot.quarter: snapshot
        for snapshot in (
            await db_session.execute(
                select(QuarterlyMetricSnapshot).where(
                    QuarterlyMetricSnapshot.quarter.in_(("2025-Q1", "2025-Q2")),
                    QuarterlyMetricSnapshot.department_id.is_(None),
                )
            )
        ).scalars()
    }
    assert snapshots["2025-Q1"].metrics["overdue_kris"] == 0
    assert snapshots["2025-Q1"].metrics[SNAPSHOT_METRIC_DEFINITIONS_KEY]["overdue_kris"] == (
        SNAPSHOT_METRIC_DEFINITION_IDS["overdue_kris"]
    )
    assert snapshots["2025-Q2"].metrics["overdue_kris"] == 1


@pytest.mark.asyncio
async def test_historical_seeder_excludes_kris_of_risks_archived_by_snapshot_date(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    active_risk = Risk(
        id=502,
        status="active",
        is_priority=False,
        department_id=None,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        archived_at=None,
    )
    archived_risk = Risk(
        id=503,
        status="active",
        is_priority=False,
        department_id=None,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        archived_at=datetime(2024, 12, 15, tzinfo=UTC),
    )
    active_kri = KeyRiskIndicator(
        id=602,
        risk_id=active_risk.id,
        frequency=KRIFrequency.quarterly.value,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
    )
    archived_parent_kri = KeyRiskIndicator(
        id=603,
        risk_id=archived_risk.id,
        frequency=KRIFrequency.quarterly.value,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
    )
    active_history = KRIValueHistory(
        kri_id=active_kri.id,
        period_start=date(2024, 10, 1),
        period_end=date(2024, 12, 31),
        value=50,
        lower_limit=20,
        upper_limit=80,
    )
    archived_parent_history = KRIValueHistory(
        kri_id=archived_parent_kri.id,
        period_start=date(2024, 7, 1),
        period_end=date(2024, 9, 30),
        value=100,
        lower_limit=20,
        upper_limit=80,
    )
    seed_data = {
        "risks": [active_risk, archived_risk],
        "kris": [active_kri, archived_parent_kri],
        "histories_by_kri": {
            active_kri.id: [active_history],
            archived_parent_kri.id: [archived_parent_history],
        },
        "risk_dept": {active_risk.id: None, archived_risk.id: None},
        "control_dept": {},
        "links": [],
        "approvals": [],
        "orphaned": [],
        "vendors": [],
    }

    await write_snapshots(db_session, seed_data, test_user.id, [])

    snapshot = (
        await db_session.execute(
            select(QuarterlyMetricSnapshot).where(
                QuarterlyMetricSnapshot.quarter == "2025-Q1",
                QuarterlyMetricSnapshot.department_id.is_(None),
            )
        )
    ).scalar_one()
    assert snapshot.metrics["active_risks"] == 1
    assert snapshot.metrics["kri_breaches"] == 0
    assert snapshot.metrics["kri_health"] == 100
    assert snapshot.metrics["overdue_kris"] == 0
    assert {
        key: snapshot.metrics[SNAPSHOT_METRIC_DEFINITIONS_KEY][key]
        for key in ("kri_breaches", "kri_health", "overdue_kris")
    } == {
        "kri_breaches": "riskhub.snapshot.kri_breaches.v1",
        "kri_health": "riskhub.snapshot.kri_health.v1",
        "overdue_kris": "riskhub.snapshot.overdue_kris.v1",
    }
