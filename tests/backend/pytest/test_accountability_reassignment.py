"""Fixed accountability reassignment approval behavior for ICT-GOV #88."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import ApprovalRequest, ApprovalScenario, Department, Process, Role, User
from app.models.user import AccessScope
from app.services._governed_mutations.process_identity import (
    valid_governed_process_proposal_exists_clause,
)


def _scenario() -> ApprovalScenario:
    return ApprovalScenario(
        key="accountability_reassignment",
        display_name="Accountability reassignments",
        description="Independent approval for accountability reassignments",
        requires_approval=True,
        approver_roles=["risk_manager", "cro"],
    )


def _process(owner: User, *, code: str) -> Process:
    return Process(
        f_code=code,
        l0_area="Operations",
        l1_process="Non-protected accountability",
        process_owner_user_id=owner.id,
        owning_department_id=owner.department_id,
        cif_override="no",
    )


@pytest.mark.asyncio
async def test_governed_process_patch_projects_labels_from_a_fresh_session(
    async_engine,
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    process = _process(test_user_employee, code="F88-FRESH")
    db_session.add_all([process, _scenario()])
    await db_session.commit()
    fresh_session = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def fresh_db_override():
        async with fresh_session() as session:
            yield session

    async with client_factory(
        user=test_user_cro,
        db_override=fresh_db_override,
        raise_app_exceptions=False,
    ) as requester:
        submitted = await requester.patch(
            f"/api/v1/processes/{process.id}",
            json={
                "process_owner_user_id": test_user_risk_manager.id,
                "request_reason": "Review fresh-session Process accountability",
            },
        )

    assert submitted.status_code == 202, submitted.text
    assert submitted.json()["pending_changes"]["process_owner_user_id"] == {
        "old": test_user_employee.name,
        "new": test_user_risk_manager.name,
    }


@pytest.mark.asyncio
async def test_accountability_scenario_exposes_fixed_default_on_policy(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
) -> None:
    db_session.add(_scenario())
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        listed = await client.get("/api/v1/riskhub/approval-scenarios")

    assert listed.status_code == 200, listed.text
    scenario = next(
        row
        for row in listed.json()
        if row["key"] == "accountability_reassignment"
    )
    assert scenario["requires_approval"] is True
    assert scenario["fixed_policy"] is True
    assert scenario["capabilities"] == {"can_update": True}
    assert scenario["fixed_policy_definition"] == {
        "threshold": "accountable_user_or_owning_department_change",
        "covered_actions": ["edit"],
        "allow_self_approval": False,
    }


@pytest.mark.asyncio
async def test_authenticated_editors_can_read_but_not_update_accountability_scenario(
    client_factory,
    db_session: AsyncSession,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    ciso_role = Role(
        name="ciso",
        display_name="Chief Information Security Officer",
    )
    db_session.add(ciso_role)
    await db_session.flush()
    ciso_user = User(
        name="Test CISO",
        email="accountability-ciso@test.local",
        role_id=ciso_role.id,
        department_id=test_user_employee.department_id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db_session.add_all([ciso_user, _scenario()])
    await db_session.commit()

    for requester in (test_user_risk_manager, ciso_user, test_user_employee):
        async with client_factory(user=requester) as client:
            listed = await client.get("/api/v1/riskhub/approval-scenarios")
            rejected_update = await client.patch(
                "/api/v1/riskhub/approval-scenarios/accountability_reassignment",
                json={"requires_approval": False},
            )

        assert listed.status_code == 200, listed.text
        scenario = next(
            row
            for row in listed.json()
            if row["key"] == "accountability_reassignment"
        )
        assert scenario["requires_approval"] is True
        assert scenario["fixed_policy"] is True
        assert scenario["capabilities"] == {"can_update": False}
        assert rejected_update.status_code == 403, rejected_update.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "unsupported_roles",
    [[], ["risk_owner"], ["risk_manager", "risk_owner"]],
)
async def test_accountability_scenario_rejects_empty_or_unsupported_roles(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    unsupported_roles: list[str],
) -> None:
    db_session.add(_scenario())
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        rejected = await client.patch(
            "/api/v1/riskhub/approval-scenarios/accountability_reassignment",
            json={"approver_roles": unsupported_roles},
        )

    assert rejected.status_code == 422, rejected.text
    persisted = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "accountability_reassignment"
        )
    )
    assert persisted is not None
    assert persisted.approver_roles == ["risk_manager", "cro"]


@pytest.mark.asyncio
async def test_accountability_scenario_allows_supported_toggle_but_not_policy_rewrite(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
) -> None:
    db_session.add(_scenario())
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        updated = await client.patch(
            "/api/v1/riskhub/approval-scenarios/accountability_reassignment",
            json={"requires_approval": False, "approver_roles": ["cro"]},
        )
        rejected_rewrite = await client.patch(
            "/api/v1/riskhub/approval-scenarios/accountability_reassignment",
            json={
                "fixed_policy_definition": {
                    "threshold": "current_or_proposed_cif_yes",
                    "covered_actions": ["create"],
                    "allow_self_approval": True,
                }
            },
        )

    assert updated.status_code == 200, updated.text
    assert updated.json()["requires_approval"] is False
    assert updated.json()["approver_roles"] == ["cro"]
    assert updated.json()["fixed_policy_definition"] == {
        "threshold": "accountable_user_or_owning_department_change",
        "covered_actions": ["edit"],
        "allow_self_approval": False,
    }
    assert rejected_rewrite.status_code == 422, rejected_rewrite.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("retained_roles", "expected_status"),
    [
        (["ciso"], 422),
        (["risk_manager"], 200),
    ],
)
async def test_enabling_accountability_scenario_validates_retained_roles_when_omitted(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    retained_roles: list[str],
    expected_status: int,
) -> None:
    scenario = _scenario()
    scenario.requires_approval = False
    scenario.approver_roles = retained_roles
    db_session.add(scenario)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        response = await client.patch(
            "/api/v1/riskhub/approval-scenarios/accountability_reassignment",
            json={"requires_approval": True},
        )

    assert response.status_code == expected_status, response.text
    await db_session.refresh(scenario)
    if expected_status == 422:
        assert scenario.requires_approval is False
        assert scenario.approver_roles == ["ciso"]
    else:
        assert response.json()["approver_roles"] == ["risk_manager"]
        assert scenario.requires_approval is True
        assert scenario.approver_roles == ["risk_manager"]


@pytest.mark.asyncio
async def test_non_protected_process_owner_reassignment_waits_for_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    process = _process(test_user_cro, code="F8801")
    db_session.add_all([process, _scenario()])
    await db_session.commit()
    base_version = process.governance_version

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/processes/{process.id}",
            json={
                "process_owner_user_id": test_user_employee.id,
                "request_reason": "Transfer operational accountability",
            },
        )

    assert submitted.status_code == 202, submitted.text
    assert submitted.json()["pending_fields"] == ["process_owner_user_id"]
    exact_sql_id = await db_session.scalar(
        select(ApprovalRequest.id).where(
            ApprovalRequest.id == submitted.json()["approval_id"],
            valid_governed_process_proposal_exists_clause(),
        )
    )
    assert exact_sql_id == submitted.json()["approval_id"]
    await db_session.refresh(process)
    assert process.process_owner_user_id == test_user_cro.id
    assert process.governance_version == base_version

    async with client_factory(user=test_user_risk_manager) as approver:
        queue = await approver.get("/api/v1/approvals/my-approvals")
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Accountability transfer approved"},
        )

    assert submitted.json()["approval_id"] in [
        item["id"] for item in queue.json()["items"]
    ]
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    await db_session.refresh(process)
    assert process.process_owner_user_id == test_user_employee.id
    assert process.governance_version == base_version + 1


@pytest.mark.asyncio
async def test_non_protected_process_department_reassignment_waits_for_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    process = _process(test_user_cro, code="F8802")
    new_department = Department(name="New Operations", code="NEW-OPS")
    db_session.add_all([process, new_department, _scenario()])
    await db_session.commit()
    base_version = process.governance_version

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/processes/{process.id}",
            json={
                "owning_department_id": new_department.id,
                "request_reason": "Transfer departmental accountability",
            },
        )

    assert submitted.status_code == 202, submitted.text
    assert submitted.json()["pending_fields"] == ["owning_department_id"]
    await db_session.refresh(process)
    assert process.owning_department_id == test_user_cro.department_id
    assert process.governance_version == base_version

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Department transfer approved"},
        )

    assert approved.status_code == 200, approved.text
    await db_session.refresh(process)
    assert process.owning_department_id == new_department.id
    assert process.governance_version == base_version + 1


@pytest.mark.asyncio
@pytest.mark.parametrize("terminal_action", ["reject", "cancel"])
async def test_process_accountability_terminal_without_approval_preserves_truth(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
    terminal_action: str,
) -> None:
    process = _process(test_user_cro, code=f"F88-{terminal_action}")
    db_session.add_all([process, _scenario()])
    await db_session.commit()
    base_version = process.governance_version

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/processes/{process.id}",
            json={
                "process_owner_user_id": test_user_employee.id,
                "request_reason": "Exercise terminal preservation",
            },
        )
    approval_id = submitted.json()["approval_id"]

    if terminal_action == "reject":
        async with client_factory(user=test_user_risk_manager) as actor:
            terminal = await actor.post(
                f"/api/v1/approvals/{approval_id}/reject",
                json={"resolution_notes": "Reassignment rejected"},
            )
    else:
        async with client_factory(user=test_user_cro) as actor:
            terminal = await actor.post(
                f"/api/v1/approvals/{approval_id}/cancel"
            )

    assert terminal.status_code == 200, terminal.text
    assert terminal.json()["status"] == (
        "rejected" if terminal_action == "reject" else "cancelled"
    )
    await db_session.refresh(process)
    assert process.process_owner_user_id == test_user_cro.id
    assert process.governance_version == base_version


@pytest.mark.asyncio
async def test_process_accountability_requester_cannot_approve_own_change(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    del test_user_risk_manager
    process = _process(test_user_cro, code="F8803")
    db_session.add_all([process, _scenario()])
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/processes/{process.id}",
            json={
                "process_owner_user_id": test_user_employee.id,
                "request_reason": "Independent review required",
            },
        )
        self_approved = await requester.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Attempt self approval"},
        )

    assert self_approved.status_code == 403, self_approved.text
    await db_session.refresh(process)
    assert process.process_owner_user_id == test_user_cro.id


@pytest.mark.asyncio
async def test_process_accountability_requires_an_independent_approver(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    test_user_risk_manager.is_active = False
    process = _process(test_user_cro, code="F8804")
    db_session.add_all([process, _scenario()])
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/processes/{process.id}",
            json={
                "process_owner_user_id": test_user_employee.id,
                "request_reason": "No independent approver exists",
            },
        )

    assert submitted.status_code == 409, submitted.text
    assert (
        submitted.json()["detail"]["code"]
        == "governed_mutation_approver_missing"
    )
    await db_session.refresh(process)
    assert process.process_owner_user_id == test_user_cro.id
