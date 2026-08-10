"""Public API behavior for governed Asset accountability reassignment."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import (
    ApprovalRequest,
    ApprovalScenario,
    Asset,
    Department,
    GovernedMutationProposal,
    User,
)


def _accountability_scenario() -> ApprovalScenario:
    return ApprovalScenario(
        key="accountability_reassignment",
        display_name="Accountability reassignments",
        description="Independent approval for accountability reassignments",
        requires_approval=True,
        approver_roles=["risk_manager", "cro"],
    )


def _unprotected_asset(owner: User, *, name: str) -> Asset:
    assert owner.department_id is not None
    return Asset(
        name=name,
        business_owner_user_id=owner.id,
        ict_owner_user_id=owner.id,
        owning_department_id=owner.department_id,
        preliminary_criticality="low",
    )


def _protected_asset(owner: User, *, name: str) -> Asset:
    asset = _unprotected_asset(owner, name=name)
    asset.preliminary_criticality = "critical"
    return asset


def _protected_asset_scenario() -> ApprovalScenario:
    return ApprovalScenario(
        key="protected_asset_edit",
        display_name="Protected Asset mutations",
        description="Independent approval for protected Asset mutations",
        requires_approval=True,
        approver_roles=["risk_manager", "cro"],
    )


@pytest.mark.asyncio
async def test_governed_asset_patch_projects_labels_from_a_fresh_session(
    async_engine,
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    asset = _protected_asset(test_user_employee, name="Fresh-session Asset snapshot")
    db_session.add_all(
        [asset, _protected_asset_scenario(), _accountability_scenario()]
    )
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
            f"/api/v1/assets/{asset.id}",
            json={
                "business_owner_user_id": test_user_risk_manager.id,
                "request_reason": "Review fresh-session Asset accountability",
            },
        )

    assert submitted.status_code == 202, submitted.text
    assert submitted.json()["pending_changes"]["business_owner"] == {
        "old": test_user_employee.name,
        "new": test_user_risk_manager.name,
    }
    assert "business_owner_user_id" not in submitted.json()["pending_changes"]


@pytest.mark.asyncio
async def test_non_protected_asset_business_owner_reassignment_waits_for_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    asset = _unprotected_asset(
        test_user_cro,
        name="Non-protected business-owner reassignment",
    )
    db_session.add_all([asset, _accountability_scenario()])
    await db_session.commit()
    base_version = asset.governance_version

    async with client_factory(user=test_user_cro) as requester:
        before = await requester.get(f"/api/v1/assets/{asset.id}")
        submitted = await requester.patch(
            f"/api/v1/assets/{asset.id}",
            json={
                "business_owner_user_id": test_user_employee.id,
                "request_reason": "Transfer business accountability",
            },
        )
        pending = await requester.get(f"/api/v1/assets/{asset.id}")

    assert before.status_code == 200, before.text
    assert submitted.status_code == 202, submitted.text
    assert submitted.json()["pending_fields"] == ["business_owner"]
    assert pending.status_code == 200, pending.text
    assert pending.json()["business_owner_user_id"] == before.json()["business_owner_user_id"] == test_user_cro.id
    await db_session.refresh(asset)
    assert asset.business_owner_user_id == test_user_cro.id
    assert asset.governance_version == base_version

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Business accountability approved"},
        )

    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    async with client_factory(user=test_user_cro) as reader:
        applied = await reader.get(f"/api/v1/assets/{asset.id}")

    assert applied.status_code == 200, applied.text
    assert applied.json()["business_owner_user_id"] == test_user_employee.id
    await db_session.refresh(asset)
    assert asset.governance_version == base_version + 1


@pytest.mark.asyncio
async def test_non_protected_asset_ict_owner_reassignment_waits_for_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    asset = _unprotected_asset(test_user_cro, name="ICT-owner reassignment")
    db_session.add_all([asset, _accountability_scenario()])
    await db_session.commit()
    base_version = asset.governance_version

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{asset.id}",
            json={
                "ict_owner_user_id": test_user_employee.id,
                "request_reason": "Transfer ICT accountability",
            },
        )

    assert submitted.status_code == 202, submitted.text
    assert submitted.json()["pending_fields"] == ["ict_owner"]
    await db_session.refresh(asset)
    assert asset.ict_owner_user_id == test_user_cro.id
    assert asset.governance_version == base_version

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "ICT accountability approved"},
        )

    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    await db_session.refresh(asset)
    assert asset.ict_owner_user_id == test_user_employee.id
    assert asset.governance_version == base_version + 1


@pytest.mark.asyncio
async def test_non_protected_asset_department_reassignment_waits_for_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    asset = _unprotected_asset(test_user_cro, name="Department reassignment")
    new_department = Department(name="Asset Operations", code="ASSET-OPS")
    db_session.add_all([asset, new_department, _accountability_scenario()])
    await db_session.commit()
    base_version = asset.governance_version

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{asset.id}",
            json={
                "owning_department_id": new_department.id,
                "request_reason": "Transfer departmental accountability",
            },
        )

    assert submitted.status_code == 202, submitted.text
    assert submitted.json()["pending_fields"] == ["owning_department"]
    await db_session.refresh(asset)
    assert asset.owning_department_id == test_user_cro.department_id
    assert asset.governance_version == base_version

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Department accountability approved"},
        )

    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    await db_session.refresh(asset)
    assert asset.owning_department_id == new_department.id
    assert asset.governance_version == base_version + 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field",
    [
        "business_owner_user_id",
        "ict_owner_user_id",
        "owning_department_id",
    ],
)
async def test_asset_required_accountability_fields_cannot_be_cleared(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    field: str,
) -> None:
    asset = _unprotected_asset(test_user_cro, name=f"Required {field}")
    db_session.add_all([asset, _accountability_scenario()])
    await db_session.commit()
    before = getattr(asset, field)
    base_version = asset.governance_version

    async with client_factory(user=test_user_cro) as requester:
        response = await requester.patch(
            f"/api/v1/assets/{asset.id}",
            json={field: None, "request_reason": "Invalid ownership clearing"},
        )

    assert response.status_code == 400, response.text
    await db_session.refresh(asset)
    assert getattr(asset, field) == before
    assert asset.governance_version == base_version


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field",
    [
        "business_owner_user_id",
        "ict_owner_user_id",
        "owning_department_id",
    ],
)
async def test_same_value_asset_accountability_patch_is_direct_noop(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    field: str,
) -> None:
    asset = _unprotected_asset(test_user_cro, name=f"Same value {field}")
    db_session.add_all([asset, _accountability_scenario()])
    await db_session.commit()
    before_count = await db_session.scalar(select(func.count(ApprovalRequest.id)))
    base_version = asset.governance_version

    async with client_factory(user=test_user_cro) as requester:
        response = await requester.patch(
            f"/api/v1/assets/{asset.id}",
            json={
                field: getattr(asset, field),
                "request_reason": "No effective ownership change",
            },
        )

    assert response.status_code == 200, response.text
    await db_session.refresh(asset)
    after_count = await db_session.scalar(select(func.count(ApprovalRequest.id)))
    assert after_count == before_count
    assert asset.governance_version == base_version


@pytest.mark.asyncio
@pytest.mark.parametrize("terminal_action", ["reject", "cancel"])
async def test_asset_accountability_terminal_without_approval_preserves_truth(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
    terminal_action: str,
) -> None:
    asset = _unprotected_asset(test_user_cro, name=f"Terminal {terminal_action}")
    db_session.add_all([asset, _accountability_scenario()])
    await db_session.commit()
    base_version = asset.governance_version

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{asset.id}",
            json={
                "business_owner_user_id": test_user_employee.id,
                "request_reason": "Exercise terminal preservation",
            },
        )

    if terminal_action == "reject":
        async with client_factory(user=test_user_risk_manager) as actor:
            terminal = await actor.post(
                f"/api/v1/approvals/{submitted.json()['approval_id']}/reject",
                json={"resolution_notes": "Reassignment rejected"},
            )
    else:
        async with client_factory(user=test_user_cro) as actor:
            terminal = await actor.post(f"/api/v1/approvals/{submitted.json()['approval_id']}/cancel")

    assert terminal.status_code == 200, terminal.text
    assert terminal.json()["status"] == ("rejected" if terminal_action == "reject" else "cancelled")
    await db_session.refresh(asset)
    assert asset.business_owner_user_id == test_user_cro.id
    assert asset.governance_version == base_version


@pytest.mark.asyncio
async def test_asset_accountability_approval_revalidates_active_proposed_owner(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    asset = _unprotected_asset(test_user_cro, name="Inactive proposed owner")
    db_session.add_all([asset, _accountability_scenario()])
    await db_session.commit()
    base_version = asset.governance_version

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{asset.id}",
            json={
                "business_owner_user_id": test_user_employee.id,
                "request_reason": "Owner must remain active",
            },
        )

    test_user_employee.is_active = False
    await db_session.commit()
    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Resolve stale owner"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    await db_session.refresh(asset)
    assert asset.business_owner_user_id == test_user_cro.id
    assert asset.governance_version == base_version


@pytest.mark.asyncio
async def test_asset_accountability_approval_revalidates_active_department(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    asset = _unprotected_asset(test_user_cro, name="Inactive proposed department")
    new_department = Department(name="Temporary Asset Team", code="TMP-ASSET")
    db_session.add_all([asset, new_department, _accountability_scenario()])
    await db_session.commit()
    base_version = asset.governance_version

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{asset.id}",
            json={
                "owning_department_id": new_department.id,
                "request_reason": "Department must remain active",
            },
        )

    new_department.is_active = False
    await db_session.commit()
    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Resolve stale department"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    await db_session.refresh(asset)
    assert asset.owning_department_id == test_user_cro.department_id
    assert asset.governance_version == base_version


@pytest.mark.asyncio
async def test_asset_accountability_approval_revalidates_base_version(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    asset = _unprotected_asset(test_user_cro, name="Stale Asset version")
    db_session.add_all([asset, _accountability_scenario()])
    await db_session.commit()
    base_version = asset.governance_version

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{asset.id}",
            json={
                "ict_owner_user_id": test_user_employee.id,
                "request_reason": "Version must remain current",
            },
        )

    asset.governance_version += 1
    await db_session.commit()
    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Resolve stale Asset version"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    await db_session.refresh(asset)
    assert asset.ict_owner_user_id == test_user_cro.id
    assert asset.governance_version == base_version + 1


@pytest.mark.asyncio
async def test_protected_asset_accountability_reassignment_composes_one_proposal(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    asset = _protected_asset(test_user_cro, name="Protected ownership composition")
    db_session.add_all([asset, _protected_asset_scenario(), _accountability_scenario()])
    await db_session.commit()
    base_version = asset.governance_version

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{asset.id}",
            json={
                "business_owner_user_id": test_user_employee.id,
                "notes": "Accountability and protected fields together",
                "request_reason": "One independent decision",
            },
        )

    assert submitted.status_code == 202, submitted.text
    proposals = (
        await db_session.scalars(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id == submitted.json()["approval_id"]
            )
        )
    ).all()
    assert len(proposals) == 1
    assert proposals[0].proposed_changes["triggered_scenarios"] == [
        "protected_asset_edit",
        "accountability_reassignment",
    ]
    await db_session.refresh(asset)
    assert asset.business_owner_user_id == test_user_cro.id
    assert asset.notes is None
    assert asset.governance_version == base_version

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Composite Asset edit approved"},
        )

    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    await db_session.refresh(asset)
    assert asset.business_owner_user_id == test_user_employee.id
    assert asset.notes == "Accountability and protected fields together"
    assert asset.governance_version == base_version + 1
