"""
Tests for CRO Risk Hub questionnaire batch send endpoint.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Risk, RiskQuestionnaire, User
from app.models.risk import RiskStatus
from app.models.risk_questionnaire import RiskQuestionnaireStatus


@pytest_asyncio.fixture
async def risk_no_owner(
    db_session: AsyncSession,
    test_department: Department,
) -> Risk:
    risk = Risk(
        risk_id_code="R-BATCH-NOOWNER",
        name="Batch Risk No Owner",
        process="Batch Process",
        description="desc",
        category="Batch Category",
        department_id=test_department.id,
        owner_id=None,
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
async def risk_owned_by_employee(
    db_session: AsyncSession,
    test_department: Department,
    test_user_employee: User,
) -> Risk:
    risk = Risk(
        risk_id_code="R-BATCH-EMP",
        name="Batch Risk Employee Owned",
        process="Batch Process",
        description="desc",
        category="Batch Category",
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
async def test_cro_only_access(
    client_risk_manager: AsyncClient,
):
    resp = await client_risk_manager.post(
        "/api/v1/riskhub/questionnaires/batch-send",
        json={"select_all": False, "risk_ids": [1]},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_batch_send_select_all_false_uses_ids_and_skips(
    db_session: AsyncSession,
    client_cro: AsyncClient,
    risk_no_owner: Risk,
    risk_owned_by_employee: Risk,
):
    # Pre-create an open questionnaire for risk_owned_by_employee to force open skip
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    existing = RiskQuestionnaire(
        risk_id=risk_owned_by_employee.id,
        assigned_to_user_id=risk_owned_by_employee.owner_id,
        sent_by_user_id=risk_owned_by_employee.owner_id,
        status=RiskQuestionnaireStatus.sent,
        template_key="risk_owner_reassessment",
        template_version="v1",
        answers=None,
        sent_at=now,
        due_at=now,
        submitted_at=None,
        submitted_by_user_id=None,
    )
    db_session.add(existing)
    await db_session.commit()

    resp = await client_cro.post(
        "/api/v1/riskhub/questionnaires/batch-send",
        json={
            "select_all": False,
            "risk_ids": [risk_no_owner.id, risk_owned_by_employee.id],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created_count"] == 0
    assert risk_no_owner.id in data["skipped_no_owner"]
    assert risk_owned_by_employee.id in data["skipped_open_exists"]


@pytest.mark.asyncio
async def test_batch_send_select_all_true_filters(
    client_cro: AsyncClient,
    test_risk: Risk,
    risk_owned_by_employee: Risk,
):
    resp = await client_cro.post(
        "/api/v1/riskhub/questionnaires/batch-send",
        json={
            "select_all": True,
            "filters": {"process": "Batch Process", "category": "Batch Category"},
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # risk_owned_by_employee matches; test_risk does not (different process/category)
    assert data["created_count"] == 1
    assert risk_owned_by_employee.id not in data["skipped_no_owner"]
    assert risk_owned_by_employee.id not in data["skipped_open_exists"]
