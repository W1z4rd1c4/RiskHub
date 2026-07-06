"""Characterization test: export row shaping (rows.py) + its reuse of the breach SSOT.

PURPOSE (regression safety net for a later refactor):
app/services/_reporting/exports/rows.py turns loaded ORM models into flat export dicts
(_risk_to_row / _control_to_row / _kri_to_row / _vendor_to_row). This file PINS the row
shape and the derived fields on a deterministic seed, going through the real fetch helpers
(app/services/_reporting/exports/fetch.py) so the load-options + row mapping are pinned
together end-to-end.

>>> CROSS-MODULE REUSE (confirmed still true) <<<
The task asked to confirm the export still reuses _monitoring_status / classify_kri_breach.
It does:

  - _kri_to_row sets `breach_status` via classify_kri_breach(current_value, lower_limit,
    upper_limit) -> the STRING classifier ('below' | 'above' | 'within'), the same SSOT
    used by _monitoring_status.build_kri_monitoring_facts.
  - _control_to_row derives latest_execution_result / latest_executed_at /
    execution_log_count via _monitoring_status.build_control_monitoring_facts.

Evidence:
  - rows.py:93   `"breach_status": classify_kri_breach(`
  - rows.py:48   `monitoring_facts = build_control_monitoring_facts(control)`
  - kris.py:20   `def classify_kri_breach(*, current_value, lower_limit, upper_limit) -> str:`

>>> CROSS-REPRESENTATION IDENTITY (string classifier vs SQL predicate) <<<
The register/snapshot breach paths use the SQL predicate kri_breach_condition() (an
or_(value < lower, value > upper)); the export uses the STRING classify_kri_breach. Both
encode the SAME band [lower_limit, upper_limit]. test_export_breach_status_agrees_with_
sql_predicate pins that a KRI the SQL predicate flags as breaching gets a non-'within'
breach_status in the export row, and vice-versa — so a refactor cannot make the two
representations disagree.

Seed (single department, privileged CRO):
  - risk R-EXP with a linked control + 1 breaching-above live KRI + 1 within-range live KRI
    + 1 archived KRI (excluded from kri_count).
  - one vendor.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import KeyRiskIndicator, Risk
from app.models.key_risk_indicator import kri_breach_condition
from app.models.risk import ControlRiskLink
from app.services._reporting.exports.fetch import (
    _fetch_controls_for_export,
    _fetch_kris_for_export,
    _fetch_risks_for_export,
    _fetch_vendors_for_export,
)
from app.services._reporting.exports.rows import (
    _control_to_row,
    _kri_to_row,
    _risk_to_row,
    _vendor_to_row,
)
from tests.backend.pytest.factories import (
    create_test_control,
    create_test_kri,
    create_test_risk,
    create_test_vendor,
)


async def _seed_export_fixture(db: AsyncSession, *, department_id: int, owner_id: int) -> int:
    risk = await create_test_risk(
        db, department_id=department_id, owner_id=owner_id, risk_id_code="R-EXP", overrides={"net_score": 12}
    )
    control = await create_test_control(db, department_id=department_id, owner_id=owner_id, name="Export Control")
    db.add(ControlRiskLink(control_id=control.id, risk_id=risk.id))
    # Breaching-above live KRI.
    await create_test_kri(
        db,
        risk_id=risk.id,
        metric_name="Above KRI",
        overrides={"current_value": 150.0, "lower_limit": 0.0, "upper_limit": 100.0},
    )
    # Within-range live KRI.
    await create_test_kri(
        db,
        risk_id=risk.id,
        metric_name="Within KRI",
        overrides={"current_value": 50.0, "lower_limit": 0.0, "upper_limit": 100.0},
    )
    # Archived KRI (excluded from active kri_count on the risk row).
    await create_test_kri(
        db,
        risk_id=risk.id,
        metric_name="Archived KRI",
        overrides={"current_value": 50.0, "is_archived": True},
    )
    await create_test_vendor(db, department_id=department_id, owner_id=owner_id, name="Export Vendor")
    await db.commit()
    return risk.id


@pytest.mark.asyncio
async def test_risk_export_row_shape(db_session: AsyncSession, test_department, test_user_cro):
    """_risk_to_row pins identity + control_count + active-only kri_count."""
    await _seed_export_fixture(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    risks = await _fetch_risks_for_export(db_session, current_user=test_user_cro, department_id=None)
    rows = [_risk_to_row(r) for r in risks]
    assert len(rows) == 1
    row = rows[0]

    assert row["risk_id_code"] == "R-EXP"
    assert row["net_score"] == 12
    assert row["control_count"] == 1  # one ControlRiskLink
    assert row["kri_count"] == 2  # 2 live KRIs; the archived one is excluded
    assert row["owner_name"] == test_user_cro.name
    assert row["department_name"] == test_department.name
    assert row["is_archived"] is False


@pytest.mark.asyncio
async def test_control_export_row_uses_monitoring_facts(db_session: AsyncSession, test_department, test_user_cro):
    """_control_to_row pins the linked-risk fields + monitoring-fact keys."""
    await _seed_export_fixture(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    controls = await _fetch_controls_for_export(db_session, current_user=test_user_cro, department_id=None)
    rows = [_control_to_row(c) for c in controls]
    assert len(rows) == 1
    row = rows[0]

    assert row["name"] == "Export Control"
    assert row["linked_risk_count"] == 1
    assert row["risk_id_code"] == "R-EXP"
    # Monitoring-fact-derived keys are present (no executions seeded -> zero/None).
    assert row["execution_log_count"] == 0
    assert row["latest_executed_at"] is None


@pytest.mark.asyncio
async def test_kri_export_row_breach_status_via_classifier(db_session: AsyncSession, test_department, test_user_cro):
    """_kri_to_row pins breach_status from classify_kri_breach ('above'/'within')."""
    await _seed_export_fixture(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    kris = await _fetch_kris_for_export(db_session, current_user=test_user_cro, department_id=None)
    rows = [_kri_to_row(k) for k in kris]
    by_name = {r["metric_name"]: r for r in rows}

    assert by_name["Above KRI"]["breach_status"] == "above"
    assert by_name["Within KRI"]["breach_status"] == "within"
    assert by_name["Archived KRI"]["breach_status"] == "within"
    # The archived KRI is still EXPORTED (status='archived'); it is only excluded from the
    # risk row's active kri_count, not from the KRI export itself.
    assert by_name["Archived KRI"]["status"] == "archived"
    assert by_name["Above KRI"]["status"] == "active"


@pytest.mark.asyncio
async def test_vendor_export_row_shape(db_session: AsyncSession, test_department, test_user_cro):
    """_vendor_to_row pins identity + flag booleans + status string."""
    await _seed_export_fixture(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    vendors = await _fetch_vendors_for_export(db_session, current_user=test_user_cro, department_id=None)
    rows = [_vendor_to_row(v) for v in vendors]
    assert len(rows) == 1
    row = rows[0]

    assert row["name"] == "Export Vendor"
    assert row["status"] == "active"
    assert row["is_archived"] is False
    assert row["risk_score_1_5"] == 3
    assert row["supports_core_function"] is False


@pytest.mark.asyncio
async def test_export_breach_status_agrees_with_sql_predicate(db_session: AsyncSession, test_department, test_user_cro):
    """CROSS-REPRESENTATION PIN: export string classifier and SQL kri_breach_condition agree.

    For every seeded live KRI, being flagged by the SQL predicate kri_breach_condition()
    (register/snapshot representation) is equivalent to having breach_status != 'within' in
    the export row (classify_kri_breach representation). Both encode the same band, so they
    must never disagree.
    """
    await _seed_export_fixture(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    # SQL-predicate view: which live KRI ids breach?
    sql_breaching_ids = set(
        (
            await db_session.execute(
                select(KeyRiskIndicator.id)
                .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
                .where(KeyRiskIndicator.is_archived.is_(False), Risk.live(), kri_breach_condition())
            )
        )
        .scalars()
        .all()
    )

    # String-classifier view via export rows (live KRIs only).
    live_kris = (
        (
            await db_session.execute(
                select(KeyRiskIndicator)
                .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
                .where(KeyRiskIndicator.is_archived.is_(False), Risk.live())
                .options(
                    selectinload(KeyRiskIndicator.reporting_owner),
                    selectinload(KeyRiskIndicator.risk).selectinload(Risk.department),
                )
            )
        )
        .scalars()
        .all()
    )
    classifier_breaching_ids = {
        row["id"] for row in (_kri_to_row(k) for k in live_kris) if row["breach_status"] != "within"
    }

    assert sql_breaching_ids == classifier_breaching_ids
    assert len(sql_breaching_ids) == 1  # only the 'Above KRI' breaches
