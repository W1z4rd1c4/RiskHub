"""
Tests for risk questionnaire API endpoints.
"""

import asyncio

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings, get_settings
from app.core.datetime_utils import utc_now
from app.db.session import get_db
from app.main import app
from app.models import Control, ControlRiskLink, Department, KeyRiskIndicator, Risk, RiskQuestionnaire, User
from app.models.risk import RiskStatus
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.services.risk_questionnaire_service import questionnaire_capabilities


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
async def test_cross_department_assigned_owner_can_complete_questionnaire(
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    db_session: AsyncSession,
    other_department: Department,
    test_user_employee: User,
):
    risk = Risk(
        risk_id_code="R-Q-CROSS-OWNER",
        name="Cross Department Owner Risk",
        process="Test Process",
        description="desc",
        category="Test Category",
        department_id=other_department.id,
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

    send_resp = await client_cro.post(f"/api/v1/risks/{risk.id}/questionnaires/send")
    assert send_resp.status_code == 201
    q_id = send_resp.json()["id"]

    list_resp = await client_employee.get(f"/api/v1/risks/{risk.id}/questionnaires")
    assert list_resp.status_code == 200
    assert list_resp.json()[0]["capabilities"]["can_submit"] is True

    inbox_resp = await client_employee.get("/api/v1/questionnaires/inbox")
    assert inbox_resp.status_code == 200
    assert q_id in {q["id"] for q in inbox_resp.json()}

    shell_resp = await client_employee.get("/api/v1/users/me/shell-summary")
    assert shell_resp.status_code == 200
    assert shell_resp.json()["questionnaire_inbox_count"] == 1

    open_resp = await client_employee.post(f"/api/v1/questionnaires/{q_id}/open")
    assert open_resp.status_code == 200
    assert open_resp.json()["status"] == "in_progress"

    submit_resp = await client_employee.post(
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
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "submitted"


@pytest.mark.asyncio
async def test_cross_department_control_owner_can_read_but_not_submit_questionnaire(
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    db_session: AsyncSession,
    other_department: Department,
    test_user_employee: User,
    test_user_cro: User,
):
    risk = Risk(
        risk_id_code="R-Q-CONTROL-OWNER",
        name="Control Owner Read Risk",
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
    control = Control(
        name="Cross Department Control",
        description="desc",
        control_owner_id=test_user_employee.id,
        department_id=other_department.id,
        status="active",
    )
    db_session.add_all([risk, control])
    await db_session.commit()
    await db_session.refresh(risk)
    await db_session.refresh(control)
    db_session.add(ControlRiskLink(control_id=control.id, risk_id=risk.id))
    await db_session.commit()

    send_resp = await client_cro.post(f"/api/v1/risks/{risk.id}/questionnaires/send")
    assert send_resp.status_code == 201
    q_id = send_resp.json()["id"]

    list_resp = await client_employee.get(f"/api/v1/risks/{risk.id}/questionnaires")
    assert list_resp.status_code == 200
    assert list_resp.json()[0]["id"] == q_id
    assert list_resp.json()[0]["capabilities"]["can_submit"] is False

    read_resp = await client_employee.get(f"/api/v1/questionnaires/{q_id}")
    assert read_resp.status_code == 200
    assert read_resp.json()["capabilities"]["can_submit"] is False

    clarifications_resp = await client_employee.get(f"/api/v1/questionnaires/{q_id}/clarifications")
    assert clarifications_resp.status_code == 200
    assert clarifications_resp.json() == []

    inbox_resp = await client_employee.get("/api/v1/questionnaires/inbox")
    assert inbox_resp.status_code == 200
    assert q_id not in {q["id"] for q in inbox_resp.json()}

    submit_resp = await client_employee.post(
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
    assert submit_resp.status_code == 403


@pytest.mark.asyncio
async def test_cross_department_kri_reporting_owner_can_read_but_not_act_on_questionnaire(
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    db_session: AsyncSession,
    other_department: Department,
    test_user_employee: User,
    test_user_cro: User,
):
    risk = Risk(
        risk_id_code="R-Q-KRI-OWNER",
        name="KRI Reporting Owner Read Risk",
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
    await db_session.flush()
    db_session.add(
        KeyRiskIndicator(
            risk_id=risk.id,
            metric_name="Cross Department KRI",
            description="desc",
            current_value=5,
            lower_limit=0,
            upper_limit=10,
            unit="count",
            reporting_owner_id=test_user_employee.id,
        )
    )
    await db_session.commit()

    send_resp = await client_cro.post(f"/api/v1/risks/{risk.id}/questionnaires/send")
    assert send_resp.status_code == 201
    q_id = send_resp.json()["id"]

    list_resp = await client_employee.get(f"/api/v1/risks/{risk.id}/questionnaires")
    assert list_resp.status_code == 200
    assert list_resp.json()[0]["id"] == q_id
    assert list_resp.json()[0]["capabilities"]["can_submit"] is False

    read_resp = await client_employee.get(f"/api/v1/questionnaires/{q_id}")
    assert read_resp.status_code == 200
    assert read_resp.json()["capabilities"]["can_save_draft"] is False
    assert read_resp.json()["capabilities"]["can_respond_to_clarifications"] is False

    inbox_resp = await client_employee.get("/api/v1/questionnaires/inbox")
    assert inbox_resp.status_code == 200
    assert q_id not in {q["id"] for q in inbox_resp.json()}


@pytest.mark.asyncio
async def test_questionnaire_capabilities_require_read_visibility(
    db_session: AsyncSession,
    other_department: Department,
    test_user_employee: User,
    test_user_cro: User,
):
    risk = Risk(
        risk_id_code="R-Q-NO-READ-CAPS",
        name="Unreadable Assigned Questionnaire Risk",
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
    await db_session.flush()
    questionnaire = RiskQuestionnaire(
        risk_id=risk.id,
        assigned_to_user_id=test_user_employee.id,
        sent_by_user_id=test_user_cro.id,
        status=RiskQuestionnaireStatus.sent,
        template_key="risk_owner_reassessment",
        template_version="v2",
        sent_at=utc_now(),
        due_at=utc_now(),
    )
    db_session.add(questionnaire)
    await db_session.commit()
    await db_session.refresh(questionnaire)

    capabilities = await questionnaire_capabilities(db_session, test_user_employee, questionnaire)
    assert capabilities == {
        "can_open": False,
        "can_save_draft": False,
        "can_submit": False,
        "can_request_clarification": False,
        "can_respond_to_clarifications": False,
    }


@pytest.mark.asyncio
async def test_risk_detail_send_questionnaire_capability_is_backend_authoritative(
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    risk_owned_by_employee: Risk,
):
    cro_resp = await client_cro.get(f"/api/v1/risks/{risk_owned_by_employee.id}")
    assert cro_resp.status_code == 200
    assert cro_resp.json()["capabilities"]["can_send_questionnaire"] is True

    employee_resp = await client_employee.get(f"/api/v1/risks/{risk_owned_by_employee.id}")
    assert employee_resp.status_code == 200
    assert employee_resp.json()["capabilities"]["can_send_questionnaire"] is False


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


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_concurrent_send_creates_single_open_questionnaire(
    async_engine,
    db_session: AsyncSession,
    test_user_cro: User,
    risk_owned_by_employee: Risk,
):
    if db_session.bind is None or db_session.bind.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL row locks and partial unique indexes")

    session_maker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    def override_settings():
        return Settings(mock_auth_enabled=True, debug=True)

    async def override_get_db():
        async with session_maker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings

    try:
        transport = ASGITransport(app=app)
        headers = {"X-Mock-User-Id": str(test_user_cro.id)}
        async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as client_cro:
            responses = await asyncio.gather(
                client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send"),
                client_cro.post(f"/api/v1/risks/{risk_owned_by_employee.id}/questionnaires/send"),
            )
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)

    statuses = sorted(resp.status_code for resp in responses)
    assert statuses == [201, 409]

    open_count = (
        await db_session.execute(
            select(RiskQuestionnaire)
            .where(
                RiskQuestionnaire.risk_id == risk_owned_by_employee.id,
                RiskQuestionnaire.status.in_([RiskQuestionnaireStatus.sent, RiskQuestionnaireStatus.in_progress]),
            )
        )
    ).scalars().all()
    assert len(open_count) == 1
