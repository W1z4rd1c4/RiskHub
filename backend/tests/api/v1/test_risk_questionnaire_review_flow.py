"""
Tests for Phase 16 questionnaire review flow helpers:
- include_previous cycle lookup
- clarification request/response
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Risk, User
from app.models.notification import Notification, NotificationType
from app.models.risk import RiskStatus


@pytest_asyncio.fixture
async def risk_owned_by_employee(
    db_session: AsyncSession,
    test_department,
    test_user_employee: User,
) -> Risk:
    risk = Risk(
        risk_id_code="R-Q-REVIEW-001",
        name="Risk Questionnaire Review Flow Test",
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


def _valid_v2_answers(*, mitigation: str = "none") -> dict[str, object]:
    return {
        "risk_assessment.q1_description_changed": False,
        "risk_assessment.q4_controls_effective": True,
        "risk_assessment.q8_outlook_trend": "stable",
        "risk_assessment.q9_mitigation_actions": mitigation,
        "risk_assessment.q11_likelihood_12m": 3,
        "risk_assessment.q12_worst_case_impact": 3,
    }


@pytest.mark.asyncio
async def test_get_questionnaire_include_previous_cycle_selection(
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    risk_owned_by_employee: Risk,
):
    # First questionnaire submitted
    send1 = await client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send")
    assert send1.status_code == 201
    q1_id = send1.json()["id"]

    submit1 = await client_employee.post(
        f"/api/v1/questionnaires/{q1_id}/submit",
        json={"answers": _valid_v2_answers(mitigation="cycle1")},
    )
    assert submit1.status_code == 200

    # Second questionnaire submitted; previous should be q1
    send2 = await client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send")
    assert send2.status_code == 201
    q2_id = send2.json()["id"]

    submit2 = await client_employee.post(
        f"/api/v1/questionnaires/{q2_id}/submit",
        json={"answers": _valid_v2_answers(mitigation="cycle2")},
    )
    assert submit2.status_code == 200

    get2 = await client_cro.get(f"/api/v1/questionnaires/{q2_id}", params={"include_previous": "true"})
    assert get2.status_code == 200
    previous = get2.json().get("previous_submission")
    assert previous is not None
    assert previous["id"] == q1_id
    assert previous["submitted_at"] is not None
    assert isinstance(previous.get("answers"), dict)

    # Third questionnaire not yet submitted; previous should be latest submitted (q2)
    send3 = await client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send")
    assert send3.status_code == 201
    q3_id = send3.json()["id"]

    get3 = await client_cro.get(f"/api/v1/questionnaires/{q3_id}", params={"include_previous": "true"})
    assert get3.status_code == 200
    previous3 = get3.json().get("previous_submission")
    assert previous3 is not None
    assert previous3["id"] == q2_id


@pytest.mark.asyncio
async def test_questionnaire_clarification_request_and_single_response(
    db_session: AsyncSession,
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    risk_owned_by_employee: Risk,
    test_user_employee: User,
):
    send = await client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send")
    assert send.status_code == 201
    q_id = send.json()["id"]

    submit = await client_employee.post(
        f"/api/v1/questionnaires/{q_id}/submit",
        json={"answers": _valid_v2_answers()},
    )
    assert submit.status_code == 200

    create = await client_cro.post(
        f"/api/v1/questionnaires/{q_id}/clarifications",
        json={
            "section_key": "questionnaire.sections.outlook",
            "request_message": "Please clarify the outlook trend rationale.",
            "question_keys": ["risk_assessment.q8_outlook_trend"],
        },
    )
    assert create.status_code == 201
    clarification_id = create.json()["id"]

    # Notification created for Risk Owner
    res = await db_session.execute(
        select(Notification).where(
            Notification.user_id == test_user_employee.id,
            Notification.type == NotificationType.QUESTIONNAIRE_CLARIFICATION_REQUESTED,
        )
    )
    assert res.scalar_one_or_none() is not None

    listing = await client_employee.get(f"/api/v1/questionnaires/{q_id}/clarifications")
    assert listing.status_code == 200
    assert any(c["id"] == clarification_id for c in listing.json())

    respond = await client_employee.post(
        f"/api/v1/questionnaires/{q_id}/clarifications/{clarification_id}/respond",
        json={"response_message": "Trend is stable due to unchanged controls."},
    )
    assert respond.status_code == 200
    assert respond.json()["response_message"]
    assert respond.json()["responded_at"] is not None

    # Single reply enforced
    respond_again = await client_employee.post(
        f"/api/v1/questionnaires/{q_id}/clarifications/{clarification_id}/respond",
        json={"response_message": "Second response should fail"},
    )
    assert respond_again.status_code == 409
