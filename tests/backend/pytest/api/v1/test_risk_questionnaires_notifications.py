"""
Tests for questionnaire notifications and reminder service.
"""

from datetime import UTC, datetime, time, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Risk, User
from app.models.global_config import clear_config_cache
from app.models.notification import Notification, NotificationType
from app.models.risk import RiskStatus
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.models.user import AccessScope
from app.services.questionnaire_deadline_service import QuestionnaireDeadlineService


@pytest.fixture(autouse=True)
def _clear_cache():
    clear_config_cache()
    yield
    clear_config_cache()


@pytest_asyncio.fixture
async def risk_owned_by_employee(
    db_session: AsyncSession,
    test_department,
    test_user_employee: User,
) -> Risk:
    risk = Risk(
        risk_id_code="R-Q-NOTIF-001",
        name="Risk Questionnaire Notification Test",
        process="Test Process",
        description="desc",
        category="Test Category",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        status=RiskStatus.active.value,
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)
    return risk


@pytest.mark.asyncio
async def test_send_creates_questionnaire_sent_notification(
    db_session: AsyncSession,
    client_cro: AsyncClient,
    test_user_employee: User,
    risk_owned_by_employee: Risk,
):
    resp = await client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send")
    assert resp.status_code == 201

    result = await db_session.execute(
        select(Notification).where(
            Notification.user_id == test_user_employee.id,
            Notification.type == NotificationType.QUESTIONNAIRE_SENT,
        )
    )
    notification = result.scalar_one_or_none()
    assert notification is not None
    assert notification.title
    assert notification.message


@pytest.mark.asyncio
async def test_submit_creates_questionnaire_submitted_notification_for_rm_cro(
    db_session: AsyncSession,
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    test_user_cro: User,
    test_user_risk_manager: User,
    risk_owned_by_employee: Risk,
    test_role_risk_manager,
):
    # Create a dept-scoped risk manager in a different department. They should NOT be notified
    # because they can't see the referenced risk.
    from app.models import Department

    other_dept = Department(name="Other Dept (Q notif)", code="QD2", description="Other dept for notif tests")
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    rm_other_dept = User(
        name="RM Other Dept",
        email="rm_other_dept@test.com",
        department_id=other_dept.id,
        role_id=test_role_risk_manager.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(rm_other_dept)
    await db_session.commit()
    await db_session.refresh(rm_other_dept)

    send_resp = await client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send")
    assert send_resp.status_code == 201
    q_id = send_resp.json()["id"]

    submit_resp = await client_employee.post(
        f"/api/v1/questionnaires/{q_id}/submit",
        json={
            "answers": {
                "risk_assessment.q1_description_changed": False,
                "risk_assessment.q4_controls_effective": True,
                "risk_assessment.q8_outlook_trend": "risk_assessment.options.trend.stable",
                "risk_assessment.q9_mitigation_actions": "none",
                "risk_assessment.q11_likelihood_12m": 3,
                "risk_assessment.q12_worst_case_impact": 3,
            }
        },
    )
    assert submit_resp.status_code == 200

    for recipient_id in (test_user_cro.id, test_user_risk_manager.id):
        res = await db_session.execute(
            select(Notification).where(
                Notification.user_id == recipient_id,
                Notification.type == NotificationType.QUESTIONNAIRE_SUBMITTED,
            )
        )
        assert res.scalar_one_or_none() is not None

    res = await db_session.execute(
        select(Notification).where(
            Notification.user_id == rm_other_dept.id,
            Notification.type == NotificationType.QUESTIONNAIRE_SUBMITTED,
        )
    )
    assert res.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_deadline_service_due_soon_and_duplicate_prevention(
    db_session: AsyncSession,
    test_user_employee: User,
    risk_owned_by_employee: Risk,
):
    from app.models import RiskQuestionnaire

    now = datetime(2026, 1, 19, 10, 0, 0, tzinfo=UTC)  # Monday (deterministic)
    assert now.weekday() == 0
    due_at = datetime.combine(now.date() + timedelta(days=2), time(hour=12), tzinfo=UTC)

    q = RiskQuestionnaire(
        risk_id=risk_owned_by_employee.id,
        assigned_to_user_id=test_user_employee.id,
        sent_by_user_id=test_user_employee.id,
        status=RiskQuestionnaireStatus.sent,
        template_key="risk_owner_reassessment",
        template_version="v1",
        answers=None,
        sent_at=now,
        due_at=due_at,
        submitted_at=None,
        submitted_by_user_id=None,
    )
    db_session.add(q)
    await db_session.commit()

    result1 = await QuestionnaireDeadlineService.check_questionnaire_deadlines(db_session, now=now)
    assert result1["due_soon"] == 1

    result2 = await QuestionnaireDeadlineService.check_questionnaire_deadlines(db_session, now=now)
    assert result2["due_soon"] == 0


@pytest.mark.asyncio
async def test_deadline_service_overdue_and_duplicate_prevention(
    db_session: AsyncSession,
    test_user_employee: User,
    risk_owned_by_employee: Risk,
):
    from app.models import RiskQuestionnaire
    from app.models.global_config import GlobalConfig

    now_monday = datetime(2026, 1, 19, 10, 0, 0, tzinfo=UTC)
    now_tuesday = now_monday + timedelta(days=1)
    now_next_tuesday = now_tuesday + timedelta(days=7)
    q = RiskQuestionnaire(
        risk_id=risk_owned_by_employee.id,
        assigned_to_user_id=test_user_employee.id,
        sent_by_user_id=test_user_employee.id,
        status=RiskQuestionnaireStatus.in_progress,
        template_key="risk_owner_reassessment",
        template_version="v1",
        answers=None,
        sent_at=now_monday - timedelta(days=10),
        due_at=now_monday - timedelta(days=1),
        submitted_at=None,
        submitted_by_user_id=None,
    )
    db_session.add(q)
    await db_session.commit()

    result1 = await QuestionnaireDeadlineService.check_questionnaire_deadlines(db_session, now=now_monday)
    assert result1["overdue"] == 1

    result2 = await QuestionnaireDeadlineService.check_questionnaire_deadlines(db_session, now=now_monday)
    assert result2["overdue"] == 0

    # Not Monday -> no overdue reminder
    result3 = await QuestionnaireDeadlineService.check_questionnaire_deadlines(db_session, now=now_tuesday)
    assert result3["overdue"] == 0

    # Configurable weekday (e.g., Tuesday)
    db_session.add(
        GlobalConfig(
            key="questionnaire_overdue_reminder_weekday",
            value="1",
            value_type="int",
            category="notifications",
            display_name="Questionnaire Overdue Reminder Weekday",
            description="Test override",
            min_value=0,
            max_value=6,
            is_editable=True,
        )
    )
    await db_session.commit()
    clear_config_cache()

    result4 = await QuestionnaireDeadlineService.check_questionnaire_deadlines(db_session, now=now_next_tuesday)
    assert result4["overdue"] == 1
