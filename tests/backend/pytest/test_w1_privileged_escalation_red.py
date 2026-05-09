from __future__ import annotations

import json

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import ApprovalRequest, ApprovalScenario, ApprovalStatus, KeyRiskIndicator, Risk, User
from app.schemas.kri import KRIRecordValue
from app.services._entity_mutation_lifecycle.approval_plans import (
    create_kri_edit_approval_if_required,
    create_risk_edit_approval_if_required,
)
from app.services._kri_history.approval_intake import create_kri_submission_approval
from app.services._riskhub_config.approval_scenario_roles import set_approval_scenario_roles
from app.services.approval_execution_service import approve_request_workflow
from tests.backend.pytest.factories import create_test_kri, create_test_risk

SCORE_CASES = (
    pytest.param(1, 4, False, False, id="low"),
    pytest.param(2, 5, False, True, id="medium-at-threshold"),
    pytest.param(4, 4, False, True, id="high-at-threshold"),
    pytest.param(5, 5, False, True, id="critical"),
    pytest.param(1, 4, True, True, id="priority-low"),
)


async def _load_with_role(db_session, user: User) -> User:
    result = await db_session.execute(
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.id == user.id)
    )
    return result.scalar_one()


async def _create_non_privileged_user(db_session, role, department_id: int, *, suffix: str) -> User:
    user = User(
        name=f"W1 {suffix}",
        email=f"w1-{suffix}@example.com",
        department_id=department_id,
        role_id=role.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return await _load_with_role(db_session, user)


async def _create_risk_with_kri(
    db_session,
    *,
    department_id: int,
    owner_id: int,
    net_probability: int,
    net_impact: int,
    is_priority: bool,
    suffix: str,
) -> tuple[Risk, KeyRiskIndicator]:
    risk = await create_test_risk(
        db_session,
        risk_id_code=f"R-W1-PRIV-{suffix}",
        name=f"W1 privileged escalation {suffix}",
        department_id=department_id,
        owner_id=owner_id,
        overrides={
            "net_probability": net_probability,
            "net_impact": net_impact,
            "net_score": net_probability * net_impact,
            "is_priority": is_priority,
        },
    )
    kri = await create_test_kri(
        db_session,
        risk_id=risk.id,
        metric_name=f"W1 KRI {suffix}",
    )
    result = await db_session.execute(
        select(KeyRiskIndicator).options(selectinload(KeyRiskIndicator.risk)).where(KeyRiskIndicator.id == kri.id)
    )
    return risk, result.scalar_one()


async def _load_approval(db_session, approval_id: int) -> ApprovalRequest:
    approval = await db_session.get(ApprovalRequest, approval_id)
    assert approval is not None
    return approval


async def _upsert_approval_scenario(
    db_session,
    *,
    key: str,
    roles: list[str],
    requires_approval: bool = True,
) -> ApprovalScenario:
    result = await db_session.execute(select(ApprovalScenario).where(ApprovalScenario.key == key))
    scenario = result.scalar_one_or_none()
    if scenario is None:
        scenario = ApprovalScenario(
            key=key,
            display_name=key.replace("_", " ").title(),
            description=f"W1 scenario {key}",
            requires_approval=requires_approval,
        )
        db_session.add(scenario)
    scenario.requires_approval = requires_approval
    set_approval_scenario_roles(scenario, roles)
    await db_session.commit()
    await db_session.refresh(scenario)
    return scenario


def _approval_response_payload(response) -> dict:
    return json.loads(response.body.decode("utf-8"))


@pytest.mark.asyncio
@pytest.mark.parametrize(("net_probability", "net_impact", "is_priority", "expected_privileged"), SCORE_CASES)
async def test_sensitive_risk_edit_privileged_escalation_uses_priority_or_net_score(
    db_session,
    test_department,
    test_role_employee,
    net_probability: int,
    net_impact: int,
    is_priority: bool,
    expected_privileged: bool,
):
    owner = await _create_non_privileged_user(db_session, test_role_employee, test_department.id, suffix="risk-owner")
    requester = await _create_non_privileged_user(db_session, test_role_employee, test_department.id, suffix="risk-req")
    risk, _kri = await _create_risk_with_kri(
        db_session,
        department_id=test_department.id,
        owner_id=owner.id,
        net_probability=net_probability,
        net_impact=net_impact,
        is_priority=is_priority,
        suffix=f"risk-{net_probability}-{net_impact}-{int(is_priority)}",
    )

    outcome = await create_risk_edit_approval_if_required(
        db_session,
        risk=risk,
        update_data={"category": "Escalated"},
        current_user=requester,
    )

    assert outcome is not None
    payload = _approval_response_payload(outcome.response)
    approval = await _load_approval(db_session, payload["approval_id"])
    assert approval.requires_privileged_approval is expected_privileged


@pytest.mark.asyncio
@pytest.mark.parametrize(("net_probability", "net_impact", "is_priority", "expected_privileged"), SCORE_CASES)
async def test_kri_edit_privileged_escalation_uses_priority_or_net_score(
    db_session,
    test_department,
    test_role_employee,
    net_probability: int,
    net_impact: int,
    is_priority: bool,
    expected_privileged: bool,
):
    owner = await _create_non_privileged_user(db_session, test_role_employee, test_department.id, suffix="kri-owner")
    requester = await _create_non_privileged_user(db_session, test_role_employee, test_department.id, suffix="kri-req")
    _risk, kri = await _create_risk_with_kri(
        db_session,
        department_id=test_department.id,
        owner_id=owner.id,
        net_probability=net_probability,
        net_impact=net_impact,
        is_priority=is_priority,
        suffix=f"kri-{net_probability}-{net_impact}-{int(is_priority)}",
    )

    outcome = await create_kri_edit_approval_if_required(
        db_session,
        kri=kri,
        update_data={"metric_name": "Updated high risk KRI"},
        normalized_vendor_ids=None,
        current_vendor_ids=[],
        current_user=requester,
    )

    assert outcome is not None
    payload = _approval_response_payload(outcome.response)
    approval = await _load_approval(db_session, payload["approval_id"])
    assert approval.requires_privileged_approval is expected_privileged


@pytest.mark.asyncio
@pytest.mark.parametrize(("net_probability", "net_impact", "is_priority", "expected_privileged"), SCORE_CASES)
async def test_kri_value_submission_privileged_escalation_uses_priority_or_net_score(
    db_session,
    test_department,
    test_role_employee,
    net_probability: int,
    net_impact: int,
    is_priority: bool,
    expected_privileged: bool,
):
    owner = await _create_non_privileged_user(db_session, test_role_employee, test_department.id, suffix="value-owner")
    requester = await _create_non_privileged_user(
        db_session,
        test_role_employee,
        test_department.id,
        suffix="value-req",
    )
    _risk, kri = await _create_risk_with_kri(
        db_session,
        department_id=test_department.id,
        owner_id=owner.id,
        net_probability=net_probability,
        net_impact=net_impact,
        is_priority=is_priority,
        suffix=f"value-{net_probability}-{net_impact}-{int(is_priority)}",
    )

    response = await create_kri_submission_approval(
        db_session,
        kri=kri,
        data=KRIRecordValue(value=72.0),
        current_user=requester,
    )

    payload = _approval_response_payload(response)
    approval = await _load_approval(db_session, payload["approval_id"])
    assert approval.requires_privileged_approval is expected_privileged
    assert payload["requires_privileged_approval"] is expected_privileged


@pytest.mark.asyncio
async def test_sensitive_risk_edit_high_net_score_primary_approval_escalates_to_privileged(
    db_session,
    test_department,
    test_role_employee,
):
    owner = await _create_non_privileged_user(db_session, test_role_employee, test_department.id, suffix="flow-owner")
    requester = await _create_non_privileged_user(db_session, test_role_employee, test_department.id, suffix="flow-req")
    risk, _kri = await _create_risk_with_kri(
        db_session,
        department_id=test_department.id,
        owner_id=owner.id,
        net_probability=4,
        net_impact=4,
        is_priority=False,
        suffix="risk-flow",
    )
    outcome = await create_risk_edit_approval_if_required(
        db_session,
        risk=risk,
        update_data={"category": "Escalated"},
        current_user=requester,
    )
    assert outcome is not None

    approval = await approve_request_workflow(
        db_session,
        _approval_response_payload(outcome.response)["approval_id"],
        current_user=owner,
        resolution_notes="primary approved",
    )

    assert approval.status == ApprovalStatus.PENDING_PRIVILEGED


@pytest.mark.asyncio
async def test_priority_risk_edit_employee_scenario_snapshots_privileged_finishers_and_finalizes(
    db_session,
    test_department,
    test_role_employee,
    test_user_risk_manager: User,
):
    await _upsert_approval_scenario(db_session, key="risk_edit_priority", roles=["employee"])
    owner = await _create_non_privileged_user(
        db_session,
        test_role_employee,
        test_department.id,
        suffix="risk-employee-scenario-owner",
    )
    requester = await _create_non_privileged_user(
        db_session,
        test_role_employee,
        test_department.id,
        suffix="risk-employee-scenario-requester",
    )
    risk, _kri = await _create_risk_with_kri(
        db_session,
        department_id=test_department.id,
        owner_id=owner.id,
        net_probability=1,
        net_impact=4,
        is_priority=True,
        suffix="risk-employee-scenario",
    )

    outcome = await create_risk_edit_approval_if_required(
        db_session,
        risk=risk,
        update_data={"description": "Priority risk employee scenario update"},
        current_user=requester,
    )
    assert outcome is not None
    approval = await _load_approval(db_session, _approval_response_payload(outcome.response)["approval_id"])
    assert approval.requires_privileged_approval is True
    assert approval.scenario_approver_roles == ["employee", "risk_manager", "cro"]

    first_stage = await approve_request_workflow(
        db_session,
        approval.id,
        current_user=owner,
        resolution_notes="employee scenario approved",
    )
    assert first_stage.status == ApprovalStatus.PENDING_PRIVILEGED

    final = await approve_request_workflow(
        db_session,
        approval.id,
        current_user=test_user_risk_manager,
        resolution_notes="risk manager final approval",
    )
    assert final.status == ApprovalStatus.APPROVED


@pytest.mark.asyncio
async def test_kri_edit_employee_scenario_snapshots_privileged_finishers_and_finalizes(
    db_session,
    test_department,
    test_role_employee,
    test_user_risk_manager: User,
):
    await _upsert_approval_scenario(db_session, key="kri_edit", roles=["employee"])
    owner = await _create_non_privileged_user(
        db_session,
        test_role_employee,
        test_department.id,
        suffix="kri-employee-scenario-owner",
    )
    requester = await _create_non_privileged_user(
        db_session,
        test_role_employee,
        test_department.id,
        suffix="kri-employee-scenario-requester",
    )
    _risk, kri = await _create_risk_with_kri(
        db_session,
        department_id=test_department.id,
        owner_id=owner.id,
        net_probability=1,
        net_impact=4,
        is_priority=True,
        suffix="kri-employee-scenario",
    )

    outcome = await create_kri_edit_approval_if_required(
        db_session,
        kri=kri,
        update_data={"metric_name": "Priority KRI employee scenario update"},
        normalized_vendor_ids=None,
        current_vendor_ids=[],
        current_user=requester,
    )
    assert outcome is not None
    approval = await _load_approval(db_session, _approval_response_payload(outcome.response)["approval_id"])
    assert approval.requires_privileged_approval is True
    assert approval.scenario_approver_roles == ["employee", "risk_manager", "cro"]

    first_stage = await approve_request_workflow(
        db_session,
        approval.id,
        current_user=owner,
        resolution_notes="employee scenario approved",
    )
    assert first_stage.status == ApprovalStatus.PENDING_PRIVILEGED

    final = await approve_request_workflow(
        db_session,
        approval.id,
        current_user=test_user_risk_manager,
        resolution_notes="risk manager final approval",
    )
    assert final.status == ApprovalStatus.APPROVED
