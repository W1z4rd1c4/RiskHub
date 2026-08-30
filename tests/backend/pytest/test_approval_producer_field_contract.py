from __future__ import annotations

from copy import deepcopy
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalRequest,
    ApprovalScenario,
    Department,
    KeyRiskIndicator,
    User,
    VendorKRILink,
)
from app.services._riskhub_config.approval_scenario_roles import set_approval_scenario_roles
from tests.backend.pytest.factories import (
    create_test_control,
    create_test_kri,
    create_test_risk,
    create_test_vendor,
)


async def _require_approval(db: AsyncSession, key: str) -> None:
    scenario = (await db.execute(select(ApprovalScenario).where(ApprovalScenario.key == key))).scalar_one_or_none()
    if scenario is None:
        scenario = ApprovalScenario(
            key=key,
            display_name=key.replace("_", " ").title(),
            description=f"Producer field contract for {key}",
        )
        db.add(scenario)
    scenario.requires_approval = True
    set_approval_scenario_roles(scenario, ["cro"])
    await db.commit()


def _queue_item(queue_body: dict, approval_id: int) -> dict:
    return next(item for item in queue_body["items"] if item["id"] == approval_id)


@pytest.mark.asyncio
async def test_risk_update_exact_producer_shape_survives_queue_and_approval(
    client_factory,
    db_session: AsyncSession,
    seed_risk_types,
    test_department: Department,
    test_user_approval_requester: User,
    test_user_employee: User,
    test_user_cro: User,
) -> None:
    await _require_approval(db_session, "risk_edit_priority")
    destination = Department(name="Producer Risk Destination", code="PRD-RISK-DST")
    db_session.add(destination)
    await db_session.commit()
    await db_session.refresh(destination)
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_approval_requester.id,
        risk_id_code="R-PRODUCER-OLD",
        overrides={
            "subprocess": "Old subprocess",
            "category": "Old category",
            "is_priority": True,
            "gross_score": 9,
            "net_score": 4,
            "acceptance_approver": "Old approver",
            "acceptance_justification": "Old justification",
            "acceptance_date": date(2025, 1, 2),
        },
    )
    payload = {
        "risk_id_code": "R-PRODUCER-NEW",
        "name": "Producer risk new",
        "process": "Producer process new",
        "subprocess": "Producer subprocess new",
        "risk_type": "strategic",
        "category": "Producer category new",
        "description": "Producer description new",
        "department_id": destination.id,
        "owner_id": test_user_employee.id,
        "gross_probability": 5,
        "gross_impact": 4,
        "net_probability": 3,
        "net_impact": 2,
        "status": "emerging",
        "is_priority": False,
        "acceptance_approver": "New approving committee",
        "acceptance_justification": "New acceptance justification",
        "acceptance_date": "2026-07-15",
    }

    async with client_factory(current_user=test_user_approval_requester) as requester_client:
        queued = await requester_client.patch(f"/api/v1/risks/{risk.id}", json=payload)

    assert queued.status_code == 202, queued.text
    approval_id = queued.json()["approval_id"]
    assert set(queued.json()["pending_fields"]) == set(payload)
    assert set(queued.json()["pending_changes"]) == set(payload)

    stored_approval = await db_session.get(ApprovalRequest, approval_id)
    assert stored_approval is not None
    assert isinstance(stored_approval.pending_changes, dict)
    assert stored_approval.pending_changes["acceptance_date"] == {
        "old": "2025-01-02",
        "new": "2026-07-15",
    }
    stored_pending_changes = deepcopy(stored_approval.pending_changes)

    async with client_factory(current_user=test_user_cro) as cro_client:
        queue_response = await cro_client.get("/api/v1/approvals", params={"status": "pending"})
        approved = await cro_client.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Exact RiskUpdate contract approved"},
        )

    assert queue_response.status_code == 200, queue_response.text
    queue_changes = _queue_item(queue_response.json(), approval_id)["pending_changes"]
    assert set(queue_changes) == set(payload)
    assert queue_changes["owner_id"]["new"] == test_user_employee.name
    assert queue_changes["department_id"]["new"] == destination.name
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    await db_session.refresh(stored_approval)
    assert stored_approval.pending_changes == stored_pending_changes
    await db_session.refresh(risk)
    expected = dict(payload)
    expected["acceptance_date"] = date(2026, 7, 15)
    for field, value in expected.items():
        assert getattr(risk, field) == value
    assert risk.gross_score == 20
    assert risk.net_score == 6


@pytest.mark.asyncio
async def test_control_update_exact_producer_shape_survives_queue_and_approval(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_approval_requester: User,
    test_user_employee: User,
    test_user_cro: User,
) -> None:
    await _require_approval(db_session, "control_edit")
    destination = Department(name="Producer Control Destination", code="PRD-CTRL-DST")
    db_session.add(destination)
    await db_session.commit()
    await db_session.refresh(destination)
    control = await create_test_control(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_approval_requester.id,
        name="Producer control old",
        overrides={
            "description": "Old description",
            "data_source": "Old source",
            "methodology_reference": "Old methodology",
            "control_form": "manual",
            "process_owner_position": "Old process owner",
            "executor_position": "Old executor",
            "frequency": "monthly",
            "risk_level": 2,
            "output_description": "Old output",
            "report_recipient": "Old recipient",
            "documentation_location": "Old archive",
            "status": "active",
        },
    )
    payload = {
        "name": "Producer control new",
        "description": "New description",
        "data_source": "New source",
        "methodology_reference": "New methodology",
        "control_form": "automatic",
        "process_owner_position": "New process owner",
        "control_owner_id": test_user_employee.id,
        "executor_position": "New executor",
        "frequency": "weekly",
        "risk_level": 5,
        "output_description": "New output",
        "report_recipient": "New recipient",
        "documentation_location": "New archive",
        "department_id": destination.id,
        "status": "inactive",
    }

    async with client_factory(current_user=test_user_approval_requester) as requester_client:
        queued = await requester_client.patch(f"/api/v1/controls/{control.id}", json=payload)

    assert queued.status_code == 202, queued.text
    approval_id = queued.json()["approval_id"]
    assert set(queued.json()["pending_fields"]) == set(payload)
    assert set(queued.json()["pending_changes"]) == set(payload)

    async with client_factory(current_user=test_user_cro) as cro_client:
        queue_response = await cro_client.get("/api/v1/approvals", params={"status": "pending"})
        approved = await cro_client.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Exact ControlUpdate contract approved"},
        )

    assert queue_response.status_code == 200, queue_response.text
    queue_changes = _queue_item(queue_response.json(), approval_id)["pending_changes"]
    assert set(queue_changes) == set(payload)
    assert queue_changes["control_owner_id"]["new"] == test_user_employee.name
    assert queue_changes["department_id"]["new"] == destination.name
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    await db_session.refresh(control)
    for field, value in payload.items():
        assert getattr(control, field) == value
    assert control.updated_by_id == test_user_cro.id


@pytest.mark.asyncio
async def test_kri_patch_existing_producer_path_survives_queue_and_approval(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_approval_requester: User,
    test_user_employee: User,
    test_user_cro: User,
) -> None:
    await _require_approval(db_session, "kri_edit")
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_id_code="R-KRI-PRODUCER",
    )
    kri = await create_test_kri(
        db_session,
        risk_id=risk.id,
        overrides={"frequency": "quarterly", "reporting_owner_id": test_user_approval_requester.id},
    )
    vendor = await create_test_vendor(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_approval_requester.id,
        name="Producer KRI vendor",
    )
    payload = {
        "metric_name": "Producer KRI new",
        "description": "Producer KRI description new",
        "lower_limit": 5.0,
        "upper_limit": 90.0,
        "unit": "points",
        "frequency": "monthly",
        "reporting_owner_id": test_user_employee.id,
        "linked_vendor_ids": [vendor.id],
    }

    async with client_factory(current_user=test_user_approval_requester) as requester_client:
        queued = await requester_client.patch(f"/api/v1/kris/{kri.id}", json=payload)

    assert queued.status_code == 202, queued.text
    approval_id = queued.json()["approval_id"]
    assert set(queued.json()["pending_fields"]) == set(payload)

    async with client_factory(current_user=test_user_cro) as cro_client:
        queue_response = await cro_client.get("/api/v1/approvals", params={"status": "pending"})
        approved = await cro_client.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Existing KRI patch contract approved"},
        )

    assert queue_response.status_code == 200, queue_response.text
    queue_changes = _queue_item(queue_response.json(), approval_id)["pending_changes"]
    assert set(queue_changes) == set(payload)
    assert queue_changes["reporting_owner_id"]["new"] == test_user_employee.name
    assert queue_changes["linked_vendor_ids"]["new"] == [vendor.name]
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    result = await db_session.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.id == kri.id))
    persisted = result.scalar_one()
    for field, value in payload.items():
        if field != "linked_vendor_ids":
            assert getattr(persisted, field) == value
    assert await db_session.scalar(
        select(VendorKRILink.id).where(
            VendorKRILink.kri_id == kri.id,
            VendorKRILink.vendor_id == vendor.id,
        )
    ) is not None
