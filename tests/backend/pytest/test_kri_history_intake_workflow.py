import importlib
from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Issue, KeyRiskIndicator, Risk
from app.models.issue import IssueSourceType, IssueStatus
from app.models.kri_history import KRIValueHistory
from app.models.user import User
from app.services._kri_history.corrections import apply_history_correction
from app.services._kri_history.intake import KRIValueIntakeMode, select_kri_value_intake_mode


def test_kri_value_intake_mode_names_are_stable():
    assert KRIValueIntakeMode.DIRECT.value == "direct"
    assert KRIValueIntakeMode.APPROVAL.value == "approval"
    assert select_kri_value_intake_mode(can_resolve=True) is KRIValueIntakeMode.DIRECT
    assert select_kri_value_intake_mode(can_resolve=False) is KRIValueIntakeMode.APPROVAL


def test_kri_value_intake_service_imports_without_endpoint_bootstrap():
    module = importlib.import_module("app.services._kri_history.intake")

    assert module.record_kri_value_intake.__name__ == "record_kri_value_intake"


def test_kri_value_governance_centralizes_mutation_and_breach_rules():
    from app.services._kri_history.governance import (
        build_kri_value_history_activity_changes,
        build_kri_value_mutation_changes,
        capture_kri_value_mutation_snapshot,
        describe_kri_limit_breach,
    )

    kri = SimpleNamespace(current_value=4.0, last_period_end=date(2026, 3, 31), last_reported_at=None)
    snapshot = capture_kri_value_mutation_snapshot(kri)

    kri.current_value = 7.0
    kri.last_period_end = date(2026, 4, 30)

    assert build_kri_value_mutation_changes(kri, snapshot) == {
        "current_value": {"old": 4.0, "new": 7.0},
        "last_period_end": {"old": date(2026, 3, 31), "new": date(2026, 4, 30)},
    }
    assert build_kri_value_history_activity_changes(
        old_value=4.0,
        new_value=7.0,
        period_end=date(2026, 4, 30),
    ) == {
        "value": {"old": 4.0, "new": 7.0},
        "period_end": {"old": None, "new": "2026-04-30"},
    }
    assert describe_kri_limit_breach(value=3.0, lower_limit=5.0, upper_limit=10.0) == (
        "Value 3.0 is below lower limit 5.0"
    )
    assert describe_kri_limit_breach(value=12.0, lower_limit=5.0, upper_limit=10.0) == (
        "Value 12.0 exceeds upper limit 10.0"
    )
    assert describe_kri_limit_breach(value=7.0, lower_limit=5.0, upper_limit=10.0) is None


def _make_history_risk(*, risk_id_code: str, department_id: int, owner_id: int) -> Risk:
    return Risk(
        risk_id_code=risk_id_code,
        name=f"Risk {risk_id_code}",
        process="KRI",
        subprocess=None,
        category="Testing",
        description="Risk used for KRI history intake workflow tests",
        department_id=department_id,
        owner_id=owner_id,
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status="active",
        is_priority=False,
    )


@pytest.mark.asyncio
async def test_history_correction_within_limit_closes_open_kri_breach_issue(
    db_session: AsyncSession,
    test_department,
    test_user: User,
):
    risk = _make_history_risk(
        risk_id_code="KRI-CORR-ISSUE-001",
        department_id=test_department.id,
        owner_id=test_user.id,
    )
    db_session.add(risk)
    await db_session.flush()

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Correction breach issue KRI",
        description="KRI with a breach issue that should be closed by correction",
        current_value=30,
        lower_limit=10,
        upper_limit=20,
        unit="%",
        frequency="monthly",
        reporting_owner_id=test_user.id,
    )
    db_session.add(kri)
    await db_session.flush()

    entry = KRIValueHistory(
        kri_id=kri.id,
        period_start=date(2026, 3, 1),
        period_end=date(2026, 3, 31),
        recorded_at=datetime(2026, 4, 2, 12, 0, tzinfo=UTC),
        recorded_by_id=test_user.id,
        value=30,
        lower_limit=10,
        upper_limit=20,
        unit="%",
        breach_status="above",
    )
    db_session.add(entry)
    await db_session.flush()

    issue = Issue(
        title="KRI breach issue",
        description="Created for breached KRI value",
        severity="high",
        status=IssueStatus.open,
        source_type=IssueSourceType.kri_breach,
        source_id=entry.id,
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
    )
    db_session.add(issue)
    await db_session.commit()

    await apply_history_correction(db_session, entry.id, 15, corrected_by_id=test_user.id)
    await db_session.refresh(issue)
    await db_session.refresh(entry)

    assert entry.breach_status == "within"
    assert issue.status == IssueStatus.closed
    assert issue.closed_at is not None
    assert issue.validation_note == "Auto-closed because corrected KRI breach is now within limits."
