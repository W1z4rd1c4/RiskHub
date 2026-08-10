"""Vendor Outsourcing Owner accountability approval behavior for ICT-GOV #88."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalRequest,
    ApprovalScenario,
    GovernedMutationProposal,
    User,
    Vendor,
)


async def _scenarios(db: AsyncSession) -> None:
    db.add_all(
        [
            ApprovalScenario(
                key="protected_vendor_edit",
                display_name="Protected Vendor mutations",
                description="Independent approval for protected Vendor mutations",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
            ApprovalScenario(
                key="accountability_reassignment",
                display_name="Accountability reassignments",
                description="Independent approval for accountability reassignments",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
        ]
    )
    await db.commit()


async def _create_vendor(client_factory, owner: User, *, name: str, protected=False):
    async with client_factory(user=owner) as requester:
        created = await requester.post(
            "/api/v1/vendors",
            json=_payload(owner, name=name, protected=protected),
        )
    assert created.status_code == 201, created.text
    return created


def _payload(owner: User, *, name: str, protected: bool = False) -> dict:
    return {
        "name": name,
        "process": "Operations",
        "outsourcing_owner_user_id": owner.id,
        "department_id": owner.department_id,
        "replaceability": (
            "not_substitutable" if protected else "easily_substitutable"
        ),
    }


@pytest.mark.asyncio
async def test_non_protected_vendor_owner_reassignment_waits_for_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    await _scenarios(db_session)
    created = await _create_vendor(
        client_factory,
        test_user_cro,
        name="Standard owner transfer",
    )
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "outsourcing_owner_user_id": test_user_employee.id,
                "request_reason": "Transfer outsourcing accountability",
            },
        )

    assert submitted.status_code == 202, submitted.text
    assert submitted.json()["action_type"] == "edit"
    assert submitted.json()["pending_fields"] == ["outsourcing_owner"]
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None
    assert vendor.outsourcing_owner_user_id == test_user_cro.id
    assert vendor.governance_version == 1

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Owner transfer approved"},
        )

    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    await db_session.refresh(vendor)
    assert vendor.outsourcing_owner_user_id == test_user_employee.id
    assert vendor.governance_version == 2


@pytest.mark.asyncio
async def test_vendor_owner_is_required_and_same_value_is_a_direct_no_op(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
) -> None:
    await _scenarios(db_session)
    created = await _create_vendor(
        client_factory,
        test_user_cro,
        name="Required Vendor owner",
    )
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None

    async with client_factory(user=test_user_cro) as requester:
        same_value = await requester.patch(
            f"/api/v1/vendors/{vendor.id}",
            json={"outsourcing_owner_user_id": test_user_cro.id},
        )
        cleared = await requester.patch(
            f"/api/v1/vendors/{vendor.id}",
            json={"outsourcing_owner_user_id": None},
        )

    assert same_value.status_code == 200, same_value.text
    assert cleared.status_code == 422, cleared.text
    await db_session.refresh(vendor)
    assert vendor.outsourcing_owner_user_id == test_user_cro.id
    assert vendor.governance_version == 1
    assert await db_session.scalar(select(func.count(ApprovalRequest.id))) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("terminal_action", ["reject", "cancel"])
async def test_vendor_owner_terminal_without_approval_preserves_truth(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
    terminal_action: str,
) -> None:
    await _scenarios(db_session)
    created = await _create_vendor(
        client_factory,
        test_user_cro,
        name=f"Vendor owner {terminal_action}",
    )
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "outsourcing_owner_user_id": test_user_employee.id,
                "request_reason": "Exercise terminal preservation",
            },
        )
    assert submitted.status_code == 202, submitted.text

    if terminal_action == "reject":
        async with client_factory(user=test_user_risk_manager) as actor:
            terminal = await actor.post(
                f"/api/v1/approvals/{submitted.json()['approval_id']}/reject",
                json={"resolution_notes": "Owner transfer rejected"},
            )
    else:
        async with client_factory(user=test_user_cro) as actor:
            terminal = await actor.post(
                f"/api/v1/approvals/{submitted.json()['approval_id']}/cancel"
            )

    assert terminal.status_code == 200, terminal.text
    assert terminal.json()["status"] == (
        "rejected" if terminal_action == "reject" else "cancelled"
    )
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None
    assert vendor.outsourcing_owner_user_id == test_user_cro.id
    assert vendor.governance_version == 1


@pytest.mark.asyncio
async def test_protected_vendor_owner_change_composes_both_policies_once(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    await _scenarios(db_session)
    accountability = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "accountability_reassignment"
        )
    )
    vendor_scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert accountability is not None and vendor_scenario is not None
    accountability.approver_roles = ["risk_manager"]
    vendor_scenario.requires_approval = False
    await db_session.commit()
    created = await _create_vendor(
        client_factory,
        test_user_cro,
        name="Protected owner transfer",
        protected=True,
    )
    vendor_scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "outsourcing_owner_user_id": test_user_employee.id,
                "request_reason": "One composite owner transfer",
            },
        )

    assert submitted.status_code == 202, submitted.text
    assert await db_session.scalar(select(func.count(ApprovalRequest.id))) == 1
    assert (
        await db_session.scalar(select(func.count(GovernedMutationProposal.id)))
        == 1
    )
    proposal = await db_session.scalar(select(GovernedMutationProposal))
    assert proposal is not None
    assert proposal.scenario_snapshot["key"] == "protected_vendor_edit"
    assert proposal.scenario_snapshot["approver_roles"] == ["risk_manager"]
    assert [
        policy["key"]
        for policy in proposal.scenario_snapshot["triggered_policies"]
    ] == ["protected_vendor_edit", "accountability_reassignment"]

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Composite policy approved"},
        )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"


@pytest.mark.asyncio
async def test_vendor_owner_approval_expires_when_target_becomes_inactive(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    await _scenarios(db_session)
    created = await _create_vendor(
        client_factory,
        test_user_cro,
        name="Inactive target owner",
    )
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "outsourcing_owner_user_id": test_user_employee.id,
                "request_reason": "Target must remain eligible",
            },
        )
    assert submitted.status_code == 202, submitted.text
    test_user_employee.is_active = False
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Attempt inactive target approval"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None
    assert vendor.outsourcing_owner_user_id == test_user_cro.id
    assert vendor.governance_version == 1


@pytest.mark.asyncio
async def test_vendor_owner_approval_expires_after_base_version_change(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    await _scenarios(db_session)
    created = await _create_vendor(
        client_factory,
        test_user_cro,
        name="Stale owner transfer",
    )
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "outsourcing_owner_user_id": test_user_employee.id,
                "request_reason": "Version-bound owner transfer",
            },
        )
    assert submitted.status_code == 202, submitted.text
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None
    vendor.governance_version += 1
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Attempt stale owner approval"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    await db_session.refresh(vendor)
    assert vendor.outsourcing_owner_user_id == test_user_cro.id
    assert vendor.governance_version == 2
