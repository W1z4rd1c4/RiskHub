"""ARCH-12 population rule table: SQL membership equals row classification."""

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import KeyRiskIndicator, Risk
from app.services import kri_populations as populations
from tests.backend.pytest.factories import create_test_kri, create_test_risk


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kri_archived,parent_archived,parent_status",
    [
        (False, False, "active"),
        (True, False, "active"),
        (False, True, "active"),
        (False, False, "archived"),
        (True, True, "archived"),
    ],
)
@pytest.mark.parametrize(
    "value,breach",
    [(-1.0, True), (0.0, False), (50.0, False), (100.0, False), (101.0, True)],
)
async def test_population_rule_table(
    db_session,
    test_department,
    test_user,
    kri_archived,
    parent_archived,
    parent_status,
    value,
    breach,
):
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user.id,
        overrides={"is_archived": parent_archived, "status": parent_status},
    )
    kri = await create_test_kri(
        db_session,
        risk_id=risk.id,
        overrides={
            "is_archived": kri_archived,
            "current_value": value,
            "lower_limit": 0.0,
            "upper_limit": 100.0,
        },
    )
    kri = (
        await db_session.execute(
            select(KeyRiskIndicator).where(KeyRiskIndicator.id == kri.id).options(selectinload(KeyRiskIndicator.risk))
        )
    ).scalar_one()
    expected_live = not (kri_archived or parent_archived or parent_status == "archived")
    for clause, classify, expected in [
        (populations.live_clause, populations.is_live, expected_live),
        (
            populations.breaching_clause,
            populations.is_breaching,
            expected_live and breach,
        ),
    ]:
        ids = set((await db_session.scalars(select(KeyRiskIndicator.id).join(Risk).where(clause()))).all())
        assert (kri.id in ids) == classify(kri) == expected


def test_missing_parent_is_not_live():
    kri = KeyRiskIndicator(is_archived=False, current_value=150, lower_limit=0, upper_limit=100)
    assert not populations.is_live(kri)
    assert not populations.is_breaching(kri)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "today,last,overdue,due_soon",
    [
        (date(2026, 10, 15), None, False, False),
        (date(2026, 10, 16), None, True, False),
        (date(2026, 10, 23), None, True, False),
        (date(2026, 10, 24), None, True, True),
        (date(2026, 10, 30), None, True, True),
        (date(2026, 10, 31), None, False, False),
        (date(2026, 10, 24), date(2026, 9, 30), False, True),
        (date(2026, 10, 24), date(2026, 10, 31), False, False),
        (date(2026, 10, 15), date(2026, 7, 31), True, False),
    ],
)
@pytest.mark.parametrize("archived", [False, True])
async def test_monthly_due_rule_table(db_session, test_department, test_user, today, last, overdue, due_soon, archived):
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user.id,
        overrides={"is_archived": archived},
    )
    kri = await create_test_kri(
        db_session,
        risk_id=risk.id,
        overrides={"frequency": "monthly", "last_period_end": last},
    )
    kri = (
        await db_session.execute(
            select(KeyRiskIndicator).where(KeyRiskIndicator.id == kri.id).options(selectinload(KeyRiskIndicator.risk))
        )
    ).scalar_one()
    for clause, classify, expected in [
        (populations.overdue_clause, populations.is_overdue, overdue),
        (populations.due_soon_clause, populations.is_due_soon, due_soon),
    ]:
        ids = set((await db_session.scalars(select(KeyRiskIndicator.id).join(Risk).where(clause(today=today)))).all())
        assert (kri.id in ids) == classify(kri, today=today) == (expected and not archived)


@pytest.mark.asyncio
async def test_legacy_frequency_fallback_matches_row_and_query(db_session, test_department, test_user):
    risk = await create_test_risk(db_session, department_id=test_department.id, owner_id=test_user.id)
    kri = await create_test_kri(
        db_session, risk_id=risk.id, overrides={"frequency": "legacy-unrecognized", "last_period_end": None}
    )
    kri = (
        await db_session.execute(
            select(KeyRiskIndicator).where(KeyRiskIndicator.id == kri.id).options(selectinload(KeyRiskIndicator.risk))
        )
    ).scalar_one()
    for today in [date(2026, 10, 16), date(2026, 12, 24)]:
        for clause, classify in [
            (populations.overdue_clause, populations.is_overdue),
            (populations.due_soon_clause, populations.is_due_soon),
        ]:
            ids = set(
                (await db_session.scalars(select(KeyRiskIndicator.id).join(Risk).where(clause(today=today)))).all()
            )
            assert (kri.id in ids) == classify(kri, today=today)
