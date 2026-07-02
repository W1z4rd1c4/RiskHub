"""Archive semantics for quarterly snapshot KRI metrics.

Archived KRIs — and KRIs whose parent Risk is archived — must not leak into
snapshot metrics: snapshots are immutable, so a leaked archived row would be
baked into every historical quarter.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core._snapshot_metrics.kri import (
    calculate_kri_health,
    count_kri_breaches,
    count_overdue_kris,
)
from tests.backend.pytest.factories import create_test_kri, create_test_risk


async def _seed_kri_archive_matrix(db: AsyncSession, *, department_id: int, owner_id: int) -> None:
    """One breaching live KRI on a live risk, plus archived-flavored decoys.

    Decoys: a breaching archived KRI on the live risk, and a breaching live KRI
    on an archived risk. Also one in-range live KRI on the live risk so health
    has a denominator > 1.
    """
    stale_period_end = datetime.now(UTC) - timedelta(days=60)
    live_risk = await create_test_risk(
        db, department_id=department_id, owner_id=owner_id, risk_id_code="R-SNAP-LIVE"
    )
    archived_risk = await create_test_risk(
        db,
        department_id=department_id,
        owner_id=owner_id,
        risk_id_code="R-SNAP-ARCH",
        overrides={"is_archived": True},
    )
    await create_test_kri(
        db,
        risk_id=live_risk.id,
        metric_name="Live breaching",
        overrides={"current_value": 150.0, "last_period_end": stale_period_end},
    )
    await create_test_kri(
        db,
        risk_id=live_risk.id,
        metric_name="Live within",
        overrides={"current_value": 50.0},
    )
    await create_test_kri(
        db,
        risk_id=live_risk.id,
        metric_name="Archived breaching",
        overrides={"current_value": 150.0, "is_archived": True, "last_period_end": stale_period_end},
    )
    await create_test_kri(
        db,
        risk_id=archived_risk.id,
        metric_name="Archived-parent breaching",
        overrides={"current_value": 150.0, "last_period_end": stale_period_end},
    )


@pytest.mark.asyncio
async def test_count_kri_breaches_excludes_archived_kris_and_archived_risks(
    db_session: AsyncSession, test_department, test_user
):
    await _seed_kri_archive_matrix(db_session, department_id=test_department.id, owner_id=test_user.id)

    assert await count_kri_breaches(db_session, None) == 1
    assert await count_kri_breaches(db_session, [test_department.id]) == 1


@pytest.mark.asyncio
async def test_calculate_kri_health_counts_only_live_kris_of_live_risks(
    db_session: AsyncSession, test_department, test_user
):
    await _seed_kri_archive_matrix(db_session, department_id=test_department.id, owner_id=test_user.id)

    # 1 within-range of 2 live KRIs on live risks -> 50%.
    assert await calculate_kri_health(db_session, None) == 50
    assert await calculate_kri_health(db_session, [test_department.id]) == 50


@pytest.mark.asyncio
async def test_count_overdue_kris_excludes_archived_kris_and_archived_risks(
    db_session: AsyncSession, test_department, test_user
):
    await _seed_kri_archive_matrix(db_session, department_id=test_department.id, owner_id=test_user.id)

    assert await count_overdue_kris(db_session, None) == 1
    assert await count_overdue_kris(db_session, [test_department.id]) == 1


@pytest.mark.asyncio
async def test_calculate_kri_health_returns_100_when_no_live_kris(db_session: AsyncSession):
    """No measurable KRIs means vacuously healthy, not 0% (which reads as all-breaching)."""
    assert await calculate_kri_health(db_session, None) == 100
