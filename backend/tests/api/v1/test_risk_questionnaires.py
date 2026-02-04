"""
Tests for risk questionnaire API endpoints.
"""
from datetime import datetime

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Risk, User, RiskQuestionnaire
from app.models.risk import RiskStatus
from app.models.risk_questionnaire import RiskQuestionnaireStatus


@pytest_asyncio.fixture
async def other_department(db_session: AsyncSession) -> Department:
    dept = Department(name="Other Department", code="OTHR", description="Other dept")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)
    return dept


@pytest_asyncio.fixture
async def risk_owned_by_employee(
    db_session: AsyncSession,
    test_department: Department,
    test_user_employee: User,
) -> Risk:
    risk = Risk(
        risk_id_code="R-Q-EMP-001",
        name="Questionnaire Risk (Employee Owned)",
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


@pytest_asyncio.fixture
async def risk_other_dept(
    db_session: AsyncSession,
    other_department: Department,
    test_user_cro: User,
) -> Risk:
    risk = Risk(
        risk_id_code="R-Q-OTHR-001",
        name="Other Department Risk",
        process="Test Process",
        description="desc",
        category="Test Category",
        department_id=other_department.id,
        owner_id=test_user_cro.id,
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
async def test_scoping_user_cannot_list_out_of_scope_risk(
    client_employee: AsyncClient,
    risk_other_dept: Risk,
):
    resp = await client_employee.get(f"/api/v1/risks/{risk_other_dept.id}/questionnaires")
    assert resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_send_permissions_and_owner_required(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    client_cro: AsyncClient,
    client_risk_manager: AsyncClient,
    test_department: Department,
):
    # Risk with no owner should block sending even for CRO/RM
    risk_no_owner = Risk(
        risk_id_code="R-Q-NOOWNER-001",
        name="Risk No Owner",
        process="Test Process",
        description="desc",
        category="Test Category",
        department_id=test_department.id,
        owner_id=None,
        risk_type="operational",
        status=RiskStatus.active.value,
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk_no_owner)
    await db_session.commit()
    await db_session.refresh(risk_no_owner)

    resp = await client_employee.post(f"/api/v1/risks/{risk_no_owner.id}/questionnaires/send")
    assert resp.status_code == 403

    resp = await client_cro.post(f"/api/v1/risks/{risk_no_owner.id}/questionnaires/send")
    assert resp.status_code == 400

    resp = await client_risk_manager.post(f"/api/v1/risks/{risk_no_owner.id}/questionnaires/send")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_single_open_enforced(
    client_cro: AsyncClient,
    risk_owned_by_employee: Risk,
):
    resp1 = await client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send")
    assert resp1.status_code == 201

    resp2 = await client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send")
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_submit_permissions_and_post_submit_immutability(
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    client_risk_manager: AsyncClient,
    client_department_head: AsyncClient,
    risk_owned_by_employee: Risk,
    test_risk: Risk,
):
    # Send for employee-owned risk
    send_resp = await client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send")
    assert send_resp.status_code == 201
    q_id = send_resp.json()["id"]

    # Others cannot submit
    resp = await client_risk_manager.post(
        f"/api/v1/questionnaires/{q_id}/submit",
        json={"answers": {"risk_assessment.q1_description_changed": False}},
    )
    assert resp.status_code == 403

    # Owner can draft then submit
    draft = await client_employee.patch(
        f"/api/v1/questionnaires/{q_id}/draft",
        json={"answers": {"risk_assessment.q1_description_changed": False}},
    )
    assert draft.status_code == 200

    submit = await client_employee.post(
        f"/api/v1/questionnaires/{q_id}/submit",
        json={
            "answers": {
                "risk_assessment.q1_description_changed": False,
                "risk_assessment.q4_controls_effective": True,
                "risk_assessment.q8_outlook_trend": "stable",
                "risk_assessment.q9_mitigation_actions": "none",
                "risk_assessment.q11_likelihood_12m": 3,
                "risk_assessment.q12_worst_case_impact": 3,
            }
        },
    )
    assert submit.status_code == 200
    assert submit.json()["status"] == "submitted"
    assert submit.json()["submitted_at"] is not None

    # Immutable after submit
    draft_after = await client_employee.patch(
        f"/api/v1/questionnaires/{q_id}/draft",
        json={"answers": {"risk_assessment.q1_description_changed": True}},
    )
    assert draft_after.status_code == 409

    submit_after = await client_employee.post(
        f"/api/v1/questionnaires/{q_id}/submit",
        json={
            "answers": {
                "risk_assessment.q1_description_changed": True,
                "risk_assessment.q4_controls_effective": True,
                "risk_assessment.q8_outlook_trend": "stable",
                "risk_assessment.q9_mitigation_actions": "none",
            }
        },
    )
    assert submit_after.status_code == 409

    # Department head can submit for risks in their department
    send_resp2 = await client_cro.post(f"/api/v1/risks/{test_risk.id}/questionnaires/send")
    assert send_resp2.status_code == 201
    q2_id = send_resp2.json()["id"]

    submit2 = await client_department_head.post(
        f"/api/v1/questionnaires/{q2_id}/submit",
        json={
            "answers": {
                "risk_assessment.q1_description_changed": False,
                "risk_assessment.q4_controls_effective": True,
                "risk_assessment.q8_outlook_trend": "up",
                "risk_assessment.q9_mitigation_actions": "monitor",
                "risk_assessment.q11_likelihood_12m": 3,
                "risk_assessment.q12_worst_case_impact": 3,
            }
        },
    )
    assert submit2.status_code == 200


@pytest.mark.asyncio
async def test_inbox_returns_only_actionable_items(
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    client_department_head: AsyncClient,
    risk_owned_by_employee: Risk,
    test_risk: Risk,
):
    # Two open questionnaires in same department: one assigned to employee, one to CRO
    resp1 = await client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send")
    assert resp1.status_code == 201
    q1_id = resp1.json()["id"]

    resp2 = await client_cro.post(f"/api/v1/risks/{test_risk.id}/questionnaires/send")
    assert resp2.status_code == 201
    q2_id = resp2.json()["id"]

    # Employee inbox: only theirs
    inbox_emp = await client_employee.get("/api/v1/questionnaires/inbox")
    assert inbox_emp.status_code == 200
    emp_ids = {q["id"] for q in inbox_emp.json()}
    assert q1_id in emp_ids
    assert q2_id not in emp_ids

    # Dept head inbox: both (department-wide)
    inbox_dept = await client_department_head.get("/api/v1/questionnaires/inbox")
    assert inbox_dept.status_code == 200
    dept_ids = {q["id"] for q in inbox_dept.json()}
    assert {q1_id, q2_id}.issubset(dept_ids)

    # After submission, item disappears from inbox
    submit = await client_employee.post(
        f"/api/v1/questionnaires/{q1_id}/submit",
        json={
            "answers": {
                "risk_assessment.q1_description_changed": False,
                "risk_assessment.q4_controls_effective": True,
                "risk_assessment.q8_outlook_trend": "stable",
                "risk_assessment.q9_mitigation_actions": "none",
                "risk_assessment.q11_likelihood_12m": 3,
                "risk_assessment.q12_worst_case_impact": 3,
            }
        },
    )
    assert submit.status_code == 200

    inbox_emp_after = await client_employee.get("/api/v1/questionnaires/inbox")
    emp_ids_after = {q["id"] for q in inbox_emp_after.json()}
    assert q1_id not in emp_ids_after


@pytest.mark.asyncio
async def test_get_questionnaire_no_side_effects(
    db_session: AsyncSession,
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    risk_owned_by_employee: Risk,
):
    send_resp = await client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send")
    assert send_resp.status_code == 201
    q_id = send_resp.json()["id"]

    # GET should not mutate status (read-only)
    resp = await client_employee.get(f"/api/v1/questionnaires/{q_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "sent"

    db_status = (
        await db_session.execute(select(RiskQuestionnaire.status).where(RiskQuestionnaire.id == q_id))
    ).scalar_one()
    assert db_status == RiskQuestionnaireStatus.sent


@pytest.mark.asyncio
async def test_open_questionnaire_transitions_for_eligible_user_and_is_idempotent(
    db_session: AsyncSession,
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    risk_owned_by_employee: Risk,
):
    send_resp = await client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send")
    assert send_resp.status_code == 201
    q_id = send_resp.json()["id"]

    # Eligible user can open: sent -> in_progress
    resp = await client_employee.post(f"/api/v1/questionnaires/{q_id}/open")
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"

    db_status = (
        await db_session.execute(select(RiskQuestionnaire.status).where(RiskQuestionnaire.id == q_id))
    ).scalar_one()
    assert db_status == RiskQuestionnaireStatus.in_progress

    # Idempotent: calling open again keeps in_progress
    resp2 = await client_employee.post(f"/api/v1/questionnaires/{q_id}/open")
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_open_questionnaire_forbidden_for_ineligible_user(
    client_cro: AsyncClient,
    client_risk_manager: AsyncClient,
    risk_owned_by_employee: Risk,
):
    send_resp = await client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send")
    assert send_resp.status_code == 201
    q_id = send_resp.json()["id"]

    resp = await client_risk_manager.post(f"/api/v1/questionnaires/{q_id}/open")
    assert resp.status_code == 403
