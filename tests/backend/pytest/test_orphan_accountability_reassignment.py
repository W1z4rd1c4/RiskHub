"""Approved orphan accountability reassignment through the public API."""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.datetime_utils import coerce_utc, utc_now
from app.models import (
    ApprovalScenario,
    Asset,
    AssetVendorLink,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    OrphanedItem,
    Permission,
    Process,
    ProcessAssetLink,
    Role,
    RolePermission,
    Threat,
    User,
    Vendor,
)
from app.models.user import AccessScope
from app.services._governed_mutations.asset_identity import (
    valid_asset_governed_envelope,
)
from app.services._orphaned_items import flag_orphaned_items


async def _accountability_scenario(
    db: AsyncSession,
    *,
    requires_approval: bool = True,
) -> None:
    db.add(
        ApprovalScenario(
            key="accountability_reassignment",
            display_name="Accountability reassignments",
            description="Independent approval for accountability reassignments",
            requires_approval=requires_approval,
            approver_roles=["risk_manager", "cro"],
        )
    )
    await db.commit()


async def _protected_scenario(
    db: AsyncSession,
    *,
    item_type: str,
    requires_approval: bool,
) -> None:
    scenario_keys = {
        "process": "protected_process_edit",
        "asset": "protected_asset_edit",
        "vendor": "protected_vendor_edit",
    }
    db.add(
        ApprovalScenario(
            key=scenario_keys[item_type],
            display_name=f"Protected {item_type.title()} mutations",
            description=f"Independent approval for protected {item_type.title()} mutations",
            requires_approval=requires_approval,
            approver_roles=["risk_manager", "cro"],
        )
    )
    await db.commit()


async def _users_write_only_operator(
    db: AsyncSession,
    *,
    test_department,
) -> User:
    role = Role(
        name="delegated_orphan_operator",
        display_name="Delegated orphan operator",
    )
    permission = Permission(
        resource="users",
        action="write",
        description="Operate delegated governance workflows",
    )
    db.add_all([role, permission])
    await db.flush()
    db.add(
        RolePermission(
            role_id=role.id,
            permission_id=permission.id,
        )
    )
    operator = User(
        name="Delegated orphan operator",
        email="delegated-orphan-operator@test.local",
        role_id=role.id,
        department_id=test_department.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db.add(operator)
    await db.commit()
    await db.refresh(operator, attribute_names=["role"])
    await db.refresh(operator.role, attribute_names=["permissions"])
    return operator


async def _orphan_reassignment_case(
    db: AsyncSession,
    *,
    item_type: str,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    protected: bool = False,
) -> tuple[object, OrphanedItem, int, str]:
    previous_owner = test_user_employee
    replacement_owner_id = test_user_risk_manager.id
    if item_type == "process":
        entity = Process(
            f_code="F-ORPHAN-REASON",
            l0_area="Operations",
            l1_process="Reason policy matrix",
            process_owner_user_id=previous_owner.id,
            owning_department_id=test_department.id,
            cif_override="yes" if protected else "no",
        )
        owner_field = "process_owner_user_id"
    elif item_type == "asset":
        entity = Asset(
            name="Reason policy Asset",
            business_owner_user_id=previous_owner.id,
            ict_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
            preliminary_criticality="critical" if protected else "low",
        )
        owner_field = "business_owner_user_id"
    elif item_type == "vendor":
        entity = Vendor(
            name="Reason policy Vendor",
            process="Operations",
            outsourcing_owner_user_id=previous_owner.id,
            department_id=test_department.id,
            replaceability=(
                "not_substitutable" if protected else "easily_substitutable"
            ),
        )
        owner_field = "outsourcing_owner_user_id"
    else:
        ciso_role = Role(
            name="ciso",
            display_name="Chief Information Security Officer",
        )
        db.add(ciso_role)
        await db.flush()
        previous_owner = User(
            name="Former reason-policy CISO",
            email="former-reason-policy-ciso@test.local",
            role_id=ciso_role.id,
            department_id=test_department.id,
            access_scope=AccessScope.GLOBAL,
            is_active=True,
        )
        replacement_owner = User(
            name="Replacement reason-policy CISO",
            email="replacement-reason-policy-ciso@test.local",
            role_id=ciso_role.id,
            department_id=test_department.id,
            access_scope=AccessScope.GLOBAL,
            is_active=True,
        )
        db.add_all([previous_owner, replacement_owner])
        await db.flush()
        replacement_owner_id = replacement_owner.id
        entity = Threat(
            name="Reason policy Threat",
            threat_steward_user_id=previous_owner.id,
        )
        owner_field = "threat_steward_user_id"

    db.add(entity)
    await db.commit()
    previous_owner.is_active = False
    orphans = await flag_orphaned_items(db, previous_owner.id)
    await db.commit()
    orphan = next(item for item in orphans if item.item_type == item_type)
    return entity, orphan, replacement_owner_id, owner_field


@pytest.mark.asyncio
async def test_users_write_only_operator_can_initialize_process_orphan_resolution_modal(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _accountability_scenario(db_session, requires_approval=False)
    await _protected_scenario(
        db_session,
        item_type="process",
        requires_approval=False,
    )
    _, orphan, _, _ = await _orphan_reassignment_case(
        db_session,
        item_type="process",
        test_department=test_department,
        test_user_cro=test_user_cro,
        test_user_employee=test_user_employee,
        test_user_risk_manager=test_user_risk_manager,
    )
    operator = await _users_write_only_operator(
        db_session,
        test_department=test_department,
    )

    async with client_factory(user=operator) as requester:
        listed = await requester.get("/api/v1/orphaned-items/")
        detailed = await requester.get(f"/api/v1/orphaned-items/{orphan.id}")
        owner_candidates = await requester.get(
            "/api/v1/users/lookup/process-owners?limit=50"
        )
        department_candidates = await requester.get(
            "/api/v1/departments/lookup/process-owners?limit=50"
        )
        generic_users = await requester.get("/api/v1/users/lookup?limit=50")
        risk_owner_candidates = await requester.get(
            "/api/v1/users/lookup/risk-owners?limit=50"
        )
        control_owner_candidates = await requester.get(
            "/api/v1/users/lookup/control-owners?limit=50"
        )

    assert listed.status_code == 200, listed.text
    assert detailed.status_code == 200, detailed.text
    assert owner_candidates.status_code == 200, owner_candidates.text
    assert department_candidates.status_code == 200, department_candidates.text
    assert generic_users.status_code == 403
    assert risk_owner_candidates.status_code == 403
    assert control_owner_candidates.status_code == 403
    owner_ids = {candidate["id"] for candidate in owner_candidates.json()}
    assert test_user_risk_manager.id in owner_ids
    assert test_user_employee.id not in owner_ids
    assert {
        "id": test_department.id,
        "name": test_department.name,
        "code": test_department.code,
    } in department_candidates.json()


@pytest.mark.asyncio
@pytest.mark.parametrize("item_type", ["asset", "vendor", "threat"])
async def test_users_write_only_operator_can_load_purpose_scoped_orphan_candidates(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    item_type: str,
) -> None:
    await _accountability_scenario(db_session, requires_approval=False)
    if item_type in {"asset", "vendor"}:
        await _protected_scenario(
            db_session,
            item_type=item_type,
            requires_approval=False,
        )
    _, orphan, replacement_owner_id, _ = await _orphan_reassignment_case(
        db_session,
        item_type=item_type,
        test_department=test_department,
        test_user_cro=test_user_cro,
        test_user_employee=test_user_employee,
        test_user_risk_manager=test_user_risk_manager,
    )
    operator = await _users_write_only_operator(
        db_session,
        test_department=test_department,
    )
    owner_lookup_path = {
        "asset": "/api/v1/users/lookup/asset-owners?limit=50",
        "vendor": "/api/v1/users/lookup/vendor-owners?limit=50",
        "threat": "/api/v1/users/lookup/threat-stewards?limit=50",
    }[item_type]

    async with client_factory(user=operator) as requester:
        detailed = await requester.get(f"/api/v1/orphaned-items/{orphan.id}")
        owner_candidates = await requester.get(owner_lookup_path)
        department_candidates = (
            await requester.get(
                "/api/v1/departments/lookup/asset-owners?limit=50"
            )
            if item_type == "asset"
            else None
        )
        vendor_department_candidates = (
            await requester.get(
                "/api/v1/departments/lookup/vendor-owners?limit=50"
            )
            if item_type == "vendor"
            else None
        )

    assert detailed.status_code == 200, detailed.text
    assert owner_candidates.status_code == 200, owner_candidates.text
    assert replacement_owner_id in {
        candidate["id"] for candidate in owner_candidates.json()
    }
    if department_candidates is not None:
        assert department_candidates.status_code == 200, department_candidates.text
        assert {
            "id": test_department.id,
            "name": test_department.name,
            "code": test_department.code,
        } in department_candidates.json()
    if vendor_department_candidates is not None:
        assert vendor_department_candidates.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("item_type", ["process", "asset", "vendor", "threat"])
@pytest.mark.parametrize("requires_approval", [True, False])
async def test_users_write_only_operator_receives_live_orphan_reason_policy(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    item_type: str,
    requires_approval: bool,
) -> None:
    await _accountability_scenario(
        db_session,
        requires_approval=requires_approval,
    )
    if item_type in {"process", "asset", "vendor"}:
        await _protected_scenario(
            db_session,
            item_type=item_type,
            requires_approval=False,
        )
    _, orphan, _, _ = await _orphan_reassignment_case(
        db_session,
        item_type=item_type,
        test_department=test_department,
        test_user_cro=test_user_cro,
        test_user_employee=test_user_employee,
        test_user_risk_manager=test_user_risk_manager,
    )
    operator = await _users_write_only_operator(
        db_session,
        test_department=test_department,
    )

    async with client_factory(user=operator) as requester:
        listed = await requester.get("/api/v1/orphaned-items/")
        detailed = await requester.get(f"/api/v1/orphaned-items/{orphan.id}")

    assert listed.status_code == 200, listed.text
    assert detailed.status_code == 200, detailed.text
    row = next(item for item in listed.json() if item["id"] == orphan.id)
    assert row["request_reason_required"] is requires_approval
    assert detailed.json()["request_reason_required"] is requires_approval


@pytest.mark.asyncio
@pytest.mark.parametrize("item_type", ["process", "asset", "vendor"])
@pytest.mark.parametrize("requires_approval", [True, False])
async def test_orphan_reason_policy_projects_primary_fixed_protection(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    item_type: str,
    requires_approval: bool,
) -> None:
    await _accountability_scenario(
        db_session,
        requires_approval=False,
    )
    await _protected_scenario(
        db_session,
        item_type=item_type,
        requires_approval=requires_approval,
    )
    _, orphan, _, _ = await _orphan_reassignment_case(
        db_session,
        item_type=item_type,
        test_department=test_department,
        test_user_cro=test_user_cro,
        test_user_employee=test_user_employee,
        test_user_risk_manager=test_user_risk_manager,
        protected=True,
    )
    operator = await _users_write_only_operator(
        db_session,
        test_department=test_department,
    )

    async with client_factory(user=operator) as requester:
        listed = await requester.get("/api/v1/orphaned-items/")
        detailed = await requester.get(f"/api/v1/orphaned-items/{orphan.id}")

    assert listed.status_code == 200, listed.text
    assert detailed.status_code == 200, detailed.text
    row = next(item for item in listed.json() if item["id"] == orphan.id)
    assert row["request_reason_required"] is requires_approval
    assert detailed.json()["request_reason_required"] is requires_approval


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("orphan_type", "triggered_policy"),
    [
        ("process", "asset"),
        ("process", "vendor"),
        ("asset", "vendor"),
    ],
)
@pytest.mark.parametrize("requires_approval", [True, False])
async def test_orphan_reason_policy_projects_complete_downstream_cascade(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    orphan_type: str,
    triggered_policy: str,
    requires_approval: bool,
) -> None:
    await _accountability_scenario(
        db_session,
        requires_approval=False,
    )
    for policy_type in ("process", "asset", "vendor"):
        await _protected_scenario(
            db_session,
            item_type=policy_type,
            requires_approval=(
                requires_approval and policy_type == triggered_policy
            ),
        )
    process = Process(
        f_code=(
            f"F-DR-{orphan_type[0]}-{triggered_policy[0]}-"
            f"{int(requires_approval)}"
        ),
        l0_area="Operations",
        l1_process="Downstream reason policy",
        process_owner_user_id=(
            test_user_employee.id
            if orphan_type == "process"
            else test_user_cro.id
        ),
        owning_department_id=test_department.id,
        cif_override="no",
    )
    asset = Asset(
        name=f"Downstream reason Asset {orphan_type} {triggered_policy}",
        business_owner_user_id=(
            test_user_employee.id
            if orphan_type == "asset"
            else test_user_cro.id
        ),
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_department.id,
        preliminary_criticality=(
            "critical" if triggered_policy == "asset" else "low"
        ),
    )
    vendor = Vendor(
        name=f"Downstream reason Vendor {orphan_type} {triggered_policy}",
        process="Operations",
        outsourcing_owner_user_id=test_user_cro.id,
        department_id=test_department.id,
        replaceability=(
            "not_substitutable"
            if triggered_policy == "vendor"
            else "easily_substitutable"
        ),
    )
    db_session.add_all([process, asset, vendor])
    await db_session.flush()
    if orphan_type == "process":
        db_session.add(
            ProcessAssetLink(
                process_id=process.id,
                asset_id=asset.id,
                is_primary=True,
            )
        )
    if triggered_policy == "vendor":
        db_session.add(
            AssetVendorLink(
                asset_id=asset.id,
                vendor_id=vendor.id,
                ict_service_code="S01",
            )
        )
    await db_session.commit()
    test_user_employee.is_active = False
    orphans = await flag_orphaned_items(db_session, test_user_employee.id)
    await db_session.commit()
    orphan = next(item for item in orphans if item.item_type == orphan_type)
    operator = await _users_write_only_operator(
        db_session,
        test_department=test_department,
    )

    async with client_factory(user=operator) as requester:
        listed = await requester.get("/api/v1/orphaned-items/")
        detailed = await requester.get(f"/api/v1/orphaned-items/{orphan.id}")

    assert listed.status_code == 200, listed.text
    assert detailed.status_code == 200, detailed.text
    row = next(item for item in listed.json() if item["id"] == orphan.id)
    assert row["request_reason_required"] is requires_approval
    assert detailed.json()["request_reason_required"] is requires_approval


@pytest.mark.asyncio
@pytest.mark.parametrize("item_type", ["process", "asset", "vendor"])
@pytest.mark.parametrize(
    ("protected_requires_approval", "request_reason", "expected_status"),
    [
        (True, None, 422),
        (True, "Restore protected accountability", 202),
        (False, None, 200),
    ],
)
async def test_protected_orphan_reassignment_remains_governed_when_accountability_is_disabled(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    item_type: str,
    protected_requires_approval: bool,
    request_reason: str | None,
    expected_status: int,
) -> None:
    await _accountability_scenario(
        db_session,
        requires_approval=False,
    )
    await _protected_scenario(
        db_session,
        item_type=item_type,
        requires_approval=protected_requires_approval,
    )
    entity, orphan, replacement_owner_id, owner_field = (
        await _orphan_reassignment_case(
            db_session,
            item_type=item_type,
            test_department=test_department,
            test_user_cro=test_user_cro,
            test_user_employee=test_user_employee,
            test_user_risk_manager=test_user_risk_manager,
            protected=True,
        )
    )
    previous_owner_id = getattr(entity, owner_field)
    entity_type = type(entity)
    entity_id = entity.id
    orphan_id = orphan.id
    request = {"new_owner_id": replacement_owner_id}
    if item_type in {"process", "asset"}:
        request["department_id"] = test_department.id
    if request_reason is not None:
        request["request_reason"] = request_reason

    async with client_factory(user=test_user_cro) as requester:
        response = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json=request,
        )

    assert response.status_code == expected_status, response.text
    db_session.expire_all()
    persisted_entity = await db_session.get(entity_type, entity_id)
    persisted_orphan = await db_session.get(OrphanedItem, orphan_id)
    assert persisted_entity is not None and persisted_orphan is not None
    if expected_status == 200:
        assert getattr(persisted_entity, owner_field) == replacement_owner_id
        assert persisted_orphan.status == "resolved"
        assert await db_session.scalar(
            select(GovernedMutationProposal.id).limit(1)
        ) is None
    else:
        assert getattr(persisted_entity, owner_field) == previous_owner_id
        assert persisted_orphan.status == "pending"
        proposal = await db_session.scalar(
            select(GovernedMutationProposal).limit(1)
        )
        if expected_status == 422:
            assert response.json()["detail"]["code"] == (
                "governed_mutation_reason_required"
            )
            assert proposal is None
        else:
            assert proposal is not None
            assert proposal.scenario_snapshot["key"] == {
                "process": "protected_process_edit",
                "asset": "protected_asset_edit",
                "vendor": "protected_vendor_edit",
            }[item_type]


@pytest.mark.asyncio
@pytest.mark.parametrize("item_type", ["process", "asset", "vendor", "threat"])
@pytest.mark.parametrize(
    ("reason_shape", "reason_value"),
    [("omitted", None), ("null", None), ("blank", "   ")],
)
@pytest.mark.parametrize("requires_approval", [True, False])
async def test_orphan_reassignment_reason_policy_follows_live_accountability_scenario(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    item_type: str,
    reason_shape: str,
    reason_value: str | None,
    requires_approval: bool,
) -> None:
    await _accountability_scenario(
        db_session,
        requires_approval=requires_approval,
    )
    entity, orphan, replacement_owner_id, owner_field = (
        await _orphan_reassignment_case(
            db_session,
            item_type=item_type,
            test_department=test_department,
            test_user_cro=test_user_cro,
            test_user_employee=test_user_employee,
            test_user_risk_manager=test_user_risk_manager,
        )
    )
    previous_owner_id = getattr(entity, owner_field)
    entity_type = type(entity)
    entity_id = entity.id
    orphan_id = orphan.id
    request = {"new_owner_id": replacement_owner_id}
    if item_type in {"process", "asset"}:
        request["department_id"] = test_department.id
    if reason_shape != "omitted":
        request["request_reason"] = reason_value

    async with client_factory(user=test_user_cro) as requester:
        response = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json=request,
        )

    db_session.expire_all()
    persisted_entity = await db_session.get(entity_type, entity_id)
    persisted_orphan = await db_session.get(OrphanedItem, orphan_id)
    assert persisted_entity is not None and persisted_orphan is not None
    if requires_approval:
        assert response.status_code == 422, response.text
        assert response.json()["detail"]["code"] == "governed_mutation_reason_required"
        assert getattr(persisted_entity, owner_field) == previous_owner_id
        assert persisted_orphan.status == "pending"
        assert await db_session.scalar(
            select(GovernedMutationProposal.id).limit(1)
        ) is None
    else:
        assert response.status_code == 200, response.text
        assert getattr(persisted_entity, owner_field) == replacement_owner_id
        assert persisted_orphan.status == "resolved"


@pytest.mark.asyncio
async def test_process_orphan_resolution_waits_for_atomic_approval(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _accountability_scenario(db_session)
    process = Process(
        f_code="F-ORPHAN-APPROVAL",
        l0_area="Operations",
        l1_process="Approved orphan reassignment",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
    )
    db_session.add(process)
    await db_session.commit()
    process_id = process.id
    replacement_owner_id = test_user_risk_manager.id
    test_user_employee.is_active = False
    orphans = await flag_orphaned_items(db_session, test_user_employee.id)
    await db_session.commit()
    orphan = next(item for item in orphans if item.item_type == "process")
    orphan_id = orphan.id
    original_orphaned_at = orphan.orphaned_at

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": replacement_owner_id,
                "department_id": test_department.id,
                "request_reason": "Restore accountable Process ownership",
            },
        )

    assert submitted.status_code == 202, submitted.text
    assert submitted.json()["action_type"] == "edit"
    await db_session.refresh(process)
    await db_session.refresh(orphan)
    assert process.process_owner_user_id == test_user_employee.id
    assert process.owning_department_id == test_department.id
    assert process.governance_version == 1
    assert orphan.status == "pending"
    assert orphan.previous_owner_id == test_user_employee.id
    assert coerce_utc(orphan.orphaned_at) == coerce_utc(original_orphaned_at)
    assert orphan.new_owner_id is None

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Process accountability restored"},
        )

    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved", approved.text
    db_session.expire_all()
    process = await db_session.get(Process, process_id)
    orphan = await db_session.scalar(
        select(OrphanedItem).where(OrphanedItem.id == orphan_id)
    )
    assert process is not None and orphan is not None
    assert process.process_owner_user_id == replacement_owner_id
    assert process.owning_department_id == test_department.id
    assert process.governance_version == 2
    assert orphan.status == "resolved"
    assert orphan.resolved_by_id == replacement_owner_id
    assert orphan.new_owner_id == replacement_owner_id


@pytest.mark.asyncio
async def test_users_write_only_operator_process_orphan_composite_approval_applies_atomically(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _accountability_scenario(db_session)
    await _protected_scenario(
        db_session,
        item_type="asset",
        requires_approval=True,
    )
    process = Process(
        f_code="F-ORPHAN-DELEGATED",
        l0_area="Operations",
        l1_process="Delegated composite orphan reassignment",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
        cif_override="no",
    )
    asset = Asset(
        name="Critical delegated orphan Asset",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_department.id,
        preliminary_criticality="critical",
    )
    db_session.add_all([process, asset])
    await db_session.flush()
    db_session.add(
        ProcessAssetLink(
            process_id=process.id,
            asset_id=asset.id,
            is_primary=True,
        )
    )
    await db_session.commit()
    process_id = process.id
    asset_id = asset.id
    previous_owner_id = test_user_employee.id
    replacement_owner_id = test_user_risk_manager.id
    test_user_employee.is_active = False
    orphans = await flag_orphaned_items(db_session, previous_owner_id)
    await db_session.commit()
    orphan = next(item for item in orphans if item.item_type == "process")
    orphan_id = orphan.id
    operator = await _users_write_only_operator(
        db_session,
        test_department=test_department,
    )

    async with client_factory(user=operator) as requester:
        denied_process_read = await requester.get(
            f"/api/v1/processes/{process_id}"
        )
        denied_asset_read = await requester.get(f"/api/v1/assets/{asset_id}")
        denied_ordinary_edit = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={"l1_process": "Unauthorized ordinary edit"},
        )
        submitted = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": replacement_owner_id,
                "department_id": test_department.id,
                "request_reason": "Restore accountability through Governance",
            },
        )

    assert denied_process_read.status_code in {403, 404}
    assert denied_asset_read.status_code in {403, 404}
    assert denied_ordinary_edit.status_code in {403, 404}
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    proposal_db_id = proposal.id
    assert {
        (item["resource_type"], item["resource_id"])
        for item in proposal.impacted_resources_snapshot
    } == {("process", process_id), ("asset", asset_id)}

    async with client_factory(user=test_user_cro) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Approve delegated orphan reassignment"},
        )

    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved", approved.text
    db_session.expire_all()
    persisted_process = await db_session.get(Process, process_id)
    persisted_asset = await db_session.get(Asset, asset_id)
    persisted_orphan = await db_session.get(OrphanedItem, orphan_id)
    locks = list(
        (
            await db_session.execute(
                select(GovernedMutationImpactLock)
                .where(GovernedMutationImpactLock.proposal_id == proposal_db_id)
                .order_by(
                    GovernedMutationImpactLock.resource_type,
                    GovernedMutationImpactLock.resource_id,
                )
            )
        ).scalars()
    )
    assert persisted_process is not None
    assert persisted_asset is not None
    assert persisted_orphan is not None
    assert persisted_process.process_owner_user_id == replacement_owner_id
    assert persisted_process.governance_version == 2
    assert persisted_asset.governance_version == 2
    assert persisted_orphan.status == "resolved"
    assert persisted_orphan.previous_owner_id == previous_owner_id
    assert persisted_orphan.new_owner_id == replacement_owner_id
    assert all(lock.released_at is not None for lock in locks)
    assert {lock.release_reason for lock in locks} == {"approved"}


@pytest.mark.asyncio
async def test_users_write_only_operator_process_orphan_approval_expires_after_authority_revocation(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _accountability_scenario(db_session)
    await _protected_scenario(
        db_session,
        item_type="asset",
        requires_approval=True,
    )
    process = Process(
        f_code="F-ORPHAN-REVOKED",
        l0_area="Operations",
        l1_process="Revoked delegated orphan reassignment",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
        cif_override="no",
    )
    asset = Asset(
        name="Critical revoked orphan Asset",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_department.id,
        preliminary_criticality="critical",
    )
    db_session.add_all([process, asset])
    await db_session.flush()
    db_session.add(
        ProcessAssetLink(
            process_id=process.id,
            asset_id=asset.id,
            is_primary=True,
        )
    )
    await db_session.commit()
    process_id = process.id
    asset_id = asset.id
    previous_owner_id = test_user_employee.id
    test_user_employee.is_active = False
    orphans = await flag_orphaned_items(db_session, previous_owner_id)
    await db_session.commit()
    orphan = next(item for item in orphans if item.item_type == "process")
    orphan_id = orphan.id
    operator = await _users_write_only_operator(
        db_session,
        test_department=test_department,
    )

    async with client_factory(user=operator) as requester:
        submitted = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": test_user_risk_manager.id,
                "department_id": test_department.id,
                "request_reason": "Restore accountability before authority revocation",
            },
        )

    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    proposal_db_id = proposal.id
    role_permission = await db_session.scalar(
        select(RolePermission).where(RolePermission.role_id == operator.role_id)
    )
    assert role_permission is not None
    await db_session.delete(role_permission)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as approver:
        expired = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Attempt approval after authority revocation"},
        )

    assert expired.status_code == 200, expired.text
    assert expired.json()["status"] == "expired", expired.text
    db_session.expire_all()
    persisted_process = await db_session.get(Process, process_id)
    persisted_asset = await db_session.get(Asset, asset_id)
    persisted_orphan = await db_session.get(OrphanedItem, orphan_id)
    locks = list(
        (
            await db_session.execute(
                select(GovernedMutationImpactLock)
                .where(GovernedMutationImpactLock.proposal_id == proposal_db_id)
                .order_by(
                    GovernedMutationImpactLock.resource_type,
                    GovernedMutationImpactLock.resource_id,
                )
            )
        ).scalars()
    )
    assert persisted_process is not None
    assert persisted_asset is not None
    assert persisted_orphan is not None
    assert persisted_process.process_owner_user_id == previous_owner_id
    assert persisted_process.governance_version == 1
    assert persisted_asset.governance_version == 1
    assert persisted_orphan.status == "pending"
    assert persisted_orphan.previous_owner_id == previous_owner_id
    assert persisted_orphan.new_owner_id is None
    assert all(lock.released_at is not None for lock in locks)
    assert {lock.release_reason for lock in locks} == {"expired"}


@pytest.mark.asyncio
@pytest.mark.parametrize("terminal_action", ["reject", "cancel"])
async def test_process_orphan_terminal_without_approval_preserves_truth(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    terminal_action: str,
) -> None:
    await _accountability_scenario(db_session)
    process = Process(
        f_code=f"F-ORPHAN-{terminal_action.upper()}",
        l0_area="Operations",
        l1_process="Terminal orphan reassignment",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
    )
    db_session.add(process)
    await db_session.commit()
    process_id = process.id
    previous_owner_id = test_user_employee.id
    test_user_employee.is_active = False
    orphans = await flag_orphaned_items(db_session, previous_owner_id)
    await db_session.commit()
    orphan = next(item for item in orphans if item.item_type == "process")
    orphan_id = orphan.id

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": test_user_risk_manager.id,
                "department_id": test_department.id,
                "request_reason": "Exercise terminal preservation",
            },
        )
    assert submitted.status_code == 202, submitted.text
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
    db_session.expire_all()
    process = await db_session.get(Process, process_id)
    orphan = await db_session.get(OrphanedItem, orphan_id)
    assert process is not None and orphan is not None
    assert process.process_owner_user_id == previous_owner_id
    assert process.governance_version == 1
    assert orphan.status == "pending"
    assert orphan.previous_owner_id == previous_owner_id
    assert orphan.new_owner_id is None


@pytest.mark.asyncio
async def test_process_orphan_stale_resource_version_expires_without_applying(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _accountability_scenario(db_session)
    process = Process(
        f_code="F-ORPHAN-STALE",
        l0_area="Operations",
        l1_process="Stale orphan reassignment",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
    )
    db_session.add(process)
    await db_session.commit()
    process_id = process.id
    previous_owner_id = test_user_employee.id
    test_user_employee.is_active = False
    orphans = await flag_orphaned_items(db_session, previous_owner_id)
    await db_session.commit()
    orphan = next(item for item in orphans if item.item_type == "process")
    orphan_id = orphan.id

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": test_user_risk_manager.id,
                "department_id": test_department.id,
                "request_reason": "Exercise stale proposal expiry",
            },
        )
    assert submitted.status_code == 202, submitted.text
    await db_session.refresh(process)
    process.governance_version += 1
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        expired = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Attempt stale reassignment"},
        )
    assert expired.status_code == 200, expired.text
    assert expired.json()["status"] == "expired"
    db_session.expire_all()
    process = await db_session.get(Process, process_id)
    orphan = await db_session.get(OrphanedItem, orphan_id)
    assert process is not None and orphan is not None
    assert process.process_owner_user_id == previous_owner_id
    assert process.governance_version == 2
    assert orphan.status == "pending"
    assert orphan.previous_owner_id == previous_owner_id
    assert orphan.new_owner_id is None


@pytest.mark.asyncio
async def test_asset_business_owner_orphan_waits_for_atomic_approval(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _accountability_scenario(db_session)
    asset = Asset(
        name="Approved orphan Asset",
        business_owner_user_id=test_user_employee.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_department.id,
    )
    db_session.add(asset)
    await db_session.commit()
    asset_id = asset.id
    replacement_owner_id = test_user_risk_manager.id
    test_user_employee.is_active = False
    orphans = await flag_orphaned_items(db_session, test_user_employee.id)
    await db_session.commit()
    orphan = next(
        item
        for item in orphans
        if item.item_type == "asset"
        and item.responsibility_role == "business_owner"
    )
    orphan_id = orphan.id

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": replacement_owner_id,
                "department_id": test_department.id,
                "request_reason": "Restore accountable Asset ownership",
            },
        )

    assert submitted.status_code == 202, submitted.text
    proposal = await db_session.scalar(select(GovernedMutationProposal))
    assert proposal is not None
    assert valid_asset_governed_envelope(proposal), {
        "scenario": proposal.scenario_snapshot,
        "changes": proposal.proposed_changes,
        "before": proposal.before_snapshot,
        "after": proposal.after_snapshot,
        "impacts": proposal.impacted_resources_snapshot,
        "base": proposal.base_versions,
        "derived": proposal.derived_impact_snapshot,
        "pending": proposal.approval_request.pending_changes,
    }
    await db_session.refresh(asset)
    await db_session.refresh(orphan)
    assert asset.business_owner_user_id == test_user_employee.id
    assert asset.governance_version == 1
    assert orphan.status == "pending"

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Asset accountability restored"},
        )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved", approved.text
    db_session.expire_all()
    asset = await db_session.get(Asset, asset_id)
    orphan = await db_session.get(OrphanedItem, orphan_id)
    assert asset is not None and orphan is not None
    assert asset.business_owner_user_id == replacement_owner_id
    assert asset.governance_version == 2
    assert orphan.status == "resolved"
    assert orphan.resolved_by_id == replacement_owner_id


@pytest.mark.asyncio
async def test_vendor_outsourcing_owner_orphan_waits_for_atomic_approval(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _accountability_scenario(db_session)
    vendor = Vendor(
        name="Approved orphan Vendor",
        process="Operations",
        outsourcing_owner_user_id=test_user_employee.id,
        department_id=test_department.id,
    )
    db_session.add(vendor)
    await db_session.commit()
    vendor_id = vendor.id
    replacement_owner_id = test_user_risk_manager.id
    test_user_employee.is_active = False
    orphans = await flag_orphaned_items(db_session, test_user_employee.id)
    await db_session.commit()
    orphan = next(item for item in orphans if item.item_type == "vendor")
    orphan_id = orphan.id

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": replacement_owner_id,
                "request_reason": "Restore accountable Vendor ownership",
            },
        )

    assert submitted.status_code == 202, submitted.text
    await db_session.refresh(vendor)
    await db_session.refresh(orphan)
    assert vendor.outsourcing_owner_user_id == test_user_employee.id
    assert vendor.governance_version == 1
    assert orphan.status == "pending"

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Vendor accountability restored"},
        )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    db_session.expire_all()
    vendor = await db_session.get(Vendor, vendor_id)
    orphan = await db_session.get(OrphanedItem, orphan_id)
    assert vendor is not None and orphan is not None
    assert vendor.outsourcing_owner_user_id == replacement_owner_id
    assert vendor.governance_version == 2
    assert orphan.status == "resolved"
    assert orphan.resolved_by_id == replacement_owner_id


@pytest.mark.asyncio
async def test_threat_steward_orphan_waits_for_atomic_approval(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _accountability_scenario(db_session)
    ciso_role = Role(
        name="ciso",
        display_name="Chief Information Security Officer",
    )
    db_session.add(ciso_role)
    await db_session.flush()
    former_steward = User(
        name="Former CISO",
        email="former-ciso-orphan@test.local",
        role_id=ciso_role.id,
        department_id=test_department.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    replacement_steward = User(
        name="Replacement CISO",
        email="replacement-ciso-orphan@test.local",
        role_id=ciso_role.id,
        department_id=test_department.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db_session.add_all([former_steward, replacement_steward])
    await db_session.flush()
    threat = Threat(
        name="Approved orphan Threat",
        threat_steward_user_id=former_steward.id,
    )
    db_session.add(threat)
    await db_session.commit()
    threat_id = threat.id
    previous_owner_id = former_steward.id
    replacement_owner_id = replacement_steward.id
    resolver_id = test_user_risk_manager.id
    former_steward.is_active = False
    orphans = await flag_orphaned_items(db_session, previous_owner_id)
    await db_session.commit()
    orphan = next(item for item in orphans if item.item_type == "threat")
    orphan_id = orphan.id

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": replacement_owner_id,
                "request_reason": "Restore active CISO stewardship",
            },
        )
    assert submitted.status_code == 202, submitted.text
    await db_session.refresh(threat)
    await db_session.refresh(orphan)
    assert threat.threat_steward_user_id == previous_owner_id
    assert threat.governance_version == 1
    assert orphan.status == "pending"

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Threat stewardship restored"},
        )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved", approved.text
    db_session.expire_all()
    threat = await db_session.get(Threat, threat_id)
    orphan = await db_session.get(OrphanedItem, orphan_id)
    assert threat is not None and orphan is not None
    assert threat.threat_steward_user_id == replacement_owner_id
    assert threat.governance_version == 2
    assert orphan.status == "resolved"
    assert orphan.resolved_by_id == resolver_id
    assert orphan.new_owner_id == replacement_owner_id


async def _run_vendor_orphan_resolution_rejected_while_impact_lock_is_active(
    db: AsyncSession,
    client_factory,
    *,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _accountability_scenario(db)
    vendor, orphan, replacement_owner_id, owner_field = (
        await _orphan_reassignment_case(
            db,
            item_type="vendor",
            test_department=test_department,
            test_user_cro=test_user_cro,
            test_user_employee=test_user_employee,
            test_user_risk_manager=test_user_risk_manager,
        )
    )
    vendor_id = vendor.id
    previous_owner_id = getattr(vendor, owner_field)
    orphan_id = orphan.id

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": replacement_owner_id,
                "request_reason": "Queue the governed reassignment",
            },
        )
    assert submitted.status_code == 202, submitted.text

    scenario = await db.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "accountability_reassignment"
        )
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db.commit()

    async with client_factory(user=test_user_cro) as requester:
        rejected = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": test_user_cro.id,
                "request_reason": "Attempt bypass while proposal pending",
            },
        )
    assert rejected.status_code == 409, rejected.text
    assert rejected.json()["detail"]["code"] == "vendor_pending_mutation"
    db.expire_all()
    vendor = await db.get(Vendor, vendor_id)
    orphan = await db.get(OrphanedItem, orphan_id)
    assert vendor is not None and orphan is not None
    assert vendor.outsourcing_owner_user_id == previous_owner_id
    assert vendor.governance_version == 1
    assert orphan.status == "pending"
    assert orphan.new_owner_id is None


async def _run_threat_orphan_resolution_rejected_while_impact_lock_is_active(
    db: AsyncSession,
    client_factory,
    *,
    test_department,
    test_user_cro: User,
) -> None:
    # Hand-rolled arrangement: this scenario needs a third CISO (the bypass
    # replacement), which _orphan_reassignment_case cannot supply.
    await _accountability_scenario(db)
    ciso_role = Role(
        name="ciso",
        display_name="Chief Information Security Officer",
    )
    db.add(ciso_role)
    await db.flush()
    former_steward = User(
        name="Former impact-lock CISO",
        email="former-impact-lock-ciso@test.local",
        role_id=ciso_role.id,
        department_id=test_department.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    governed_replacement = User(
        name="Governed replacement CISO",
        email="governed-impact-lock-ciso@test.local",
        role_id=ciso_role.id,
        department_id=test_department.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    bypass_replacement = User(
        name="Bypass replacement CISO",
        email="bypass-impact-lock-ciso@test.local",
        role_id=ciso_role.id,
        department_id=test_department.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db.add_all([former_steward, governed_replacement, bypass_replacement])
    await db.flush()
    threat = Threat(
        name="Impact-locked Threat orphan",
        threat_steward_user_id=former_steward.id,
    )
    db.add(threat)
    await db.commit()
    threat_id = threat.id
    previous_owner_id = former_steward.id
    bypass_replacement_id = bypass_replacement.id
    former_steward.is_active = False
    orphans = await flag_orphaned_items(db, previous_owner_id)
    await db.commit()
    orphan = next(item for item in orphans if item.item_type == "threat")
    orphan_id = orphan.id

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": governed_replacement.id,
                "request_reason": "Queue the governed reassignment",
            },
        )
    assert submitted.status_code == 202, submitted.text

    scenario = await db.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "accountability_reassignment"
        )
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db.commit()

    async with client_factory(user=test_user_cro) as requester:
        rejected = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": bypass_replacement_id,
                "request_reason": "Attempt bypass while proposal pending",
            },
        )
    assert rejected.status_code == 409, rejected.text
    assert rejected.json()["detail"]["code"] == "threat_pending_mutation"
    db.expire_all()
    threat = await db.get(Threat, threat_id)
    orphan = await db.get(OrphanedItem, orphan_id)
    assert threat is not None and orphan is not None
    assert threat.threat_steward_user_id == previous_owner_id
    assert threat.governance_version == 1
    assert orphan.status == "pending"
    assert orphan.new_owner_id is None


async def _run_vendor_orphan_stale_resource_version_expires_without_applying(
    db: AsyncSession,
    client_factory,
    *,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _accountability_scenario(db)
    vendor, orphan, replacement_owner_id, owner_field = (
        await _orphan_reassignment_case(
            db,
            item_type="vendor",
            test_department=test_department,
            test_user_cro=test_user_cro,
            test_user_employee=test_user_employee,
            test_user_risk_manager=test_user_risk_manager,
        )
    )
    vendor_id = vendor.id
    previous_owner_id = getattr(vendor, owner_field)
    orphan_id = orphan.id

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": replacement_owner_id,
                "request_reason": "Exercise stale proposal expiry",
            },
        )
    assert submitted.status_code == 202, submitted.text
    await db.refresh(vendor)
    vendor.governance_version += 1
    await db.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        expired = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Attempt stale reassignment"},
        )
    assert expired.status_code == 200, expired.text
    assert expired.json()["status"] == "expired"
    db.expire_all()
    vendor = await db.get(Vendor, vendor_id)
    orphan = await db.get(OrphanedItem, orphan_id)
    assert vendor is not None and orphan is not None
    assert vendor.outsourcing_owner_user_id == previous_owner_id
    assert vendor.governance_version == 2
    assert orphan.status == "pending"
    assert orphan.previous_owner_id == previous_owner_id
    assert orphan.new_owner_id is None


async def _run_threat_orphan_stale_resource_version_expires_without_applying(
    db: AsyncSession,
    client_factory,
    *,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _accountability_scenario(db)
    threat, orphan, replacement_owner_id, owner_field = (
        await _orphan_reassignment_case(
            db,
            item_type="threat",
            test_department=test_department,
            test_user_cro=test_user_cro,
            test_user_employee=test_user_employee,
            test_user_risk_manager=test_user_risk_manager,
        )
    )
    threat_id = threat.id
    previous_owner_id = getattr(threat, owner_field)
    orphan_id = orphan.id

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": replacement_owner_id,
                "request_reason": "Exercise stale proposal expiry",
            },
        )
    assert submitted.status_code == 202, submitted.text
    await db.refresh(threat)
    threat.governance_version += 1
    await db.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        expired = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Attempt stale reassignment"},
        )
    assert expired.status_code == 200, expired.text
    assert expired.json()["status"] == "expired"
    db.expire_all()
    threat = await db.get(Threat, threat_id)
    orphan = await db.get(OrphanedItem, orphan_id)
    assert threat is not None and orphan is not None
    assert threat.threat_steward_user_id == previous_owner_id
    assert threat.governance_version == 2
    assert orphan.status == "pending"
    assert orphan.previous_owner_id == previous_owner_id
    assert orphan.new_owner_id is None


async def _run_vendor_orphan_stale_proposal_expires_after_real_reassignment(
    db: AsyncSession,
    client_factory,
    *,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    """LOAD-BEARING: a real HTTP orphan repair advances governance_version (proven
    by inversion). BELT: the pre-existing proposal expires on approve via the
    envelope-malformed branch, since its impact lock was released. The stale-version
    branch (vendor_resolution.py "version changed after submission") is structurally
    unreachable in full composition: the repair requires the lock released, and a
    released lock already invalidates the envelope; manual-bump siblings pin it."""
    await _accountability_scenario(db)
    # The expiry path revalidates the fixed Vendor scenario once the
    # proposal envelope is no longer intact, so it must exist.
    await _protected_scenario(db, item_type="vendor", requires_approval=True)
    # Threat mirror skipped: needs a third CISO actor (assert_active_ciso_steward); over budget — see note near :1415.
    vendor, orphan, replacement_owner_id, owner_field = (
        await _orphan_reassignment_case(
            db,
            item_type="vendor",
            test_department=test_department,
            test_user_cro=test_user_cro,
            test_user_employee=test_user_employee,
            test_user_risk_manager=test_user_risk_manager,
        )
    )
    vendor_id = vendor.id
    previous_owner_id = getattr(vendor, owner_field)
    orphan_id = orphan.id
    repaired_owner_id = test_user_cro.id

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": replacement_owner_id,
                "request_reason": "Exercise composed stale proposal expiry",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]

    # Drop governance for the follow-up repair and release the pending
    # proposal's impact lock so the real repair is not rejected with 409.
    scenario = await db.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "accountability_reassignment"
        )
    )
    assert scenario is not None
    scenario.requires_approval = False
    impact_lock = await db.scalar(
        select(GovernedMutationImpactLock).where(
            GovernedMutationImpactLock.resource_type == "vendor",
            GovernedMutationImpactLock.resource_id == vendor_id,
            GovernedMutationImpactLock.released_at.is_(None),
        )
    )
    assert impact_lock is not None
    impact_lock.released_at = utc_now()
    impact_lock.release_reason = "test_continue_orphan_resolution"
    await db.commit()

    # A real reassignment through the public API advances governance_version.
    async with client_factory(user=test_user_cro) as requester:
        repaired = await requester.post(
            f"/api/v1/orphaned-items/{orphan_id}/resolve",
            json={
                "new_owner_id": repaired_owner_id,
                "request_reason": "Repair the orphan through the real seam",
            },
        )
    assert repaired.status_code == 200, repaired.text
    assert repaired.json()["status"] == "resolved"
    await db.refresh(vendor)
    assert vendor.outsourcing_owner_user_id == repaired_owner_id
    assert vendor.governance_version == 2

    # The original proposal is now stale and must expire without applying.
    async with client_factory(user=test_user_risk_manager) as approver:
        expired = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Attempt stale reassignment"},
        )
    assert expired.status_code == 200, expired.text
    assert expired.json()["status"] == "expired"
    db.expire_all()
    vendor = await db.get(Vendor, vendor_id)
    orphan = await db.get(OrphanedItem, orphan_id)
    assert vendor is not None and orphan is not None
    assert vendor.outsourcing_owner_user_id == repaired_owner_id
    assert vendor.outsourcing_owner_user_id != replacement_owner_id
    assert vendor.governance_version == 2
    assert orphan.status == "resolved"
    assert orphan.previous_owner_id == previous_owner_id
    assert orphan.new_owner_id == repaired_owner_id


@pytest.mark.asyncio
async def test_vendor_orphan_resolution_rejected_while_impact_lock_is_active(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _run_vendor_orphan_resolution_rejected_while_impact_lock_is_active(
        db_session,
        client_factory,
        test_department=test_department,
        test_user_cro=test_user_cro,
        test_user_employee=test_user_employee,
        test_user_risk_manager=test_user_risk_manager,
    )


@pytest.mark.asyncio
async def test_threat_orphan_resolution_rejected_while_impact_lock_is_active(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    del test_user_risk_manager
    await _run_threat_orphan_resolution_rejected_while_impact_lock_is_active(
        db_session,
        client_factory,
        test_department=test_department,
        test_user_cro=test_user_cro,
    )


@pytest.mark.asyncio
async def test_vendor_orphan_stale_resource_version_expires_without_applying(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _run_vendor_orphan_stale_resource_version_expires_without_applying(
        db_session,
        client_factory,
        test_department=test_department,
        test_user_cro=test_user_cro,
        test_user_employee=test_user_employee,
        test_user_risk_manager=test_user_risk_manager,
    )


@pytest.mark.asyncio
async def test_threat_orphan_stale_resource_version_expires_without_applying(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _run_threat_orphan_stale_resource_version_expires_without_applying(
        db_session,
        client_factory,
        test_department=test_department,
        test_user_cro=test_user_cro,
        test_user_employee=test_user_employee,
        test_user_risk_manager=test_user_risk_manager,
    )


@pytest.mark.asyncio
async def test_vendor_orphan_stale_proposal_expires_after_real_reassignment(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    await _run_vendor_orphan_stale_proposal_expires_after_real_reassignment(
        db_session,
        client_factory,
        test_department=test_department,
        test_user_cro=test_user_cro,
        test_user_employee=test_user_employee,
        test_user_risk_manager=test_user_risk_manager,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("item_type", ["process", "asset", "vendor", "threat"])
async def test_deactivation_during_pending_reassignment_is_resolved_atomically(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user: User,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    item_type: str,
) -> None:
    await _accountability_scenario(db_session)
    former_owner = test_user_employee
    replacement_owner = test_user_risk_manager
    if item_type == "process":
        entity = Process(
            f_code="F-LATE-ORPHAN",
            l0_area="Operations",
            l1_process="Late orphan approval",
            process_owner_user_id=former_owner.id,
            owning_department_id=test_department.id,
            cif_override="no",
        )
        owner_field = "process_owner_user_id"
        url_prefix = "/api/v1/processes"
        payload = {
            owner_field: replacement_owner.id,
            "request_reason": "Transfer before deactivation",
        }
        responsibility_role = None
    elif item_type == "asset":
        entity = Asset(
            name="Late orphan Asset approval",
            business_owner_user_id=former_owner.id,
            ict_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
            preliminary_criticality="low",
        )
        owner_field = "business_owner_user_id"
        url_prefix = "/api/v1/assets"
        payload = {
            owner_field: replacement_owner.id,
            "request_reason": "Transfer before deactivation",
        }
        responsibility_role = "business_owner"
    elif item_type == "vendor":
        entity = Vendor(
            name="Late orphan Vendor approval",
            process="Operations",
            outsourcing_owner_user_id=former_owner.id,
            department_id=test_department.id,
            replaceability="easily_substitutable",
        )
        owner_field = "outsourcing_owner_user_id"
        url_prefix = "/api/v1/vendors"
        payload = {
            owner_field: replacement_owner.id,
            "request_reason": "Transfer before deactivation",
        }
        responsibility_role = "outsourcing_owner"
    else:
        ciso_role = Role(
            name="ciso",
            display_name="Chief Information Security Officer",
        )
        db_session.add(ciso_role)
        await db_session.flush()
        former_owner = User(
            name="Late orphan former CISO",
            email="late-orphan-former-ciso@test.local",
            role_id=ciso_role.id,
            department_id=test_department.id,
            access_scope=AccessScope.GLOBAL,
            is_active=True,
        )
        replacement_owner = User(
            name="Late orphan replacement CISO",
            email="late-orphan-replacement-ciso@test.local",
            role_id=ciso_role.id,
            department_id=test_department.id,
            access_scope=AccessScope.GLOBAL,
            is_active=True,
        )
        db_session.add_all([former_owner, replacement_owner])
        await db_session.flush()
        entity = Threat(
            name="Late orphan Threat approval",
            threat_steward_user_id=former_owner.id,
        )
        owner_field = "threat_steward_user_id"
        url_prefix = "/api/v1/threats"
        payload = {
            owner_field: replacement_owner.id,
            "request_reason": "Transfer before deactivation",
        }
        responsibility_role = None

    db_session.add(entity)
    await db_session.commit()
    entity_id = entity.id
    former_owner_id = former_owner.id
    replacement_owner_id = replacement_owner.id

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"{url_prefix}/{entity_id}",
            json=payload,
        )
    async with client_factory(user=test_user) as admin:
        deactivated = await admin.patch(
            f"/api/v1/users/{former_owner_id}",
            json={"is_active": False},
        )

    assert submitted.status_code == 202, submitted.text
    assert deactivated.status_code == 200, deactivated.text
    orphan = await db_session.scalar(
        select(OrphanedItem).where(
            OrphanedItem.item_type == item_type,
            OrphanedItem.item_id == entity_id,
            OrphanedItem.status == "pending",
            OrphanedItem.previous_owner_id == former_owner_id,
            OrphanedItem.responsibility_role == responsibility_role,
        )
    )
    assert orphan is not None
    orphan_id = orphan.id

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Apply reassignment and close late orphan"},
        )

    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    db_session.expire_all()
    persisted_entity = await db_session.get(type(entity), entity_id)
    persisted_orphan = await db_session.get(OrphanedItem, orphan_id)
    assert persisted_entity is not None and persisted_orphan is not None
    assert getattr(persisted_entity, owner_field) == replacement_owner_id
    assert persisted_orphan.status == "resolved"
    assert persisted_orphan.previous_owner_id == former_owner_id
    assert persisted_orphan.new_owner_id == replacement_owner_id


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("terminal_action", "expected_status"),
    [
        ("approve", "approved"),
        ("reject", "rejected"),
        ("cancel", "cancelled"),
        ("stale", "expired"),
    ],
)
async def test_composite_asset_reassignment_preserves_both_late_owner_orphans_atomically(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user: User,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    terminal_action: str,
    expected_status: str,
) -> None:
    await _accountability_scenario(db_session)
    former_business_owner = User(
        name="Former composite business owner",
        email="former-composite-business@test.local",
        role_id=test_user_employee.role_id,
        department_id=test_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    former_ict_owner = User(
        name="Former composite ICT owner",
        email="former-composite-ict@test.local",
        role_id=test_user_employee.role_id,
        department_id=test_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add_all([former_business_owner, former_ict_owner])
    await db_session.flush()
    asset = Asset(
        name="Composite late-orphan Asset",
        business_owner_user_id=former_business_owner.id,
        ict_owner_user_id=former_ict_owner.id,
        owning_department_id=test_department.id,
        preliminary_criticality="low",
    )
    db_session.add(asset)
    await db_session.commit()
    asset_id = asset.id
    former_by_role = {
        "business_owner": former_business_owner.id,
        "ict_owner": former_ict_owner.id,
    }
    replacement_by_role = {
        "business_owner": test_user_risk_manager.id,
        "ict_owner": test_user_cro.id,
    }

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{asset_id}",
            json={
                "business_owner_user_id": replacement_by_role[
                    "business_owner"
                ],
                "ict_owner_user_id": replacement_by_role["ict_owner"],
                "request_reason": "Transfer both Asset responsibilities",
            },
        )
    assert submitted.status_code == 202, submitted.text

    async with client_factory(user=test_user) as admin:
        for former_owner_id in former_by_role.values():
            deactivated = await admin.patch(
                f"/api/v1/users/{former_owner_id}",
                json={"is_active": False},
            )
            assert deactivated.status_code == 200, deactivated.text

    pending_orphans = list(
        (
            await db_session.execute(
                select(OrphanedItem)
                .where(
                    OrphanedItem.item_type == "asset",
                    OrphanedItem.item_id == asset_id,
                    OrphanedItem.status == "pending",
                )
                .order_by(OrphanedItem.responsibility_role)
            )
        ).scalars()
    )
    assert {
        orphan.responsibility_role: orphan.previous_owner_id
        for orphan in pending_orphans
    } == former_by_role

    if terminal_action == "reject":
        async with client_factory(user=test_user_risk_manager) as actor:
            terminal = await actor.post(
                f"/api/v1/approvals/{submitted.json()['approval_id']}/reject",
                json={"resolution_notes": "Reject both Asset responsibilities"},
            )
    elif terminal_action == "cancel":
        async with client_factory(user=test_user_cro) as actor:
            terminal = await actor.post(
                f"/api/v1/approvals/{submitted.json()['approval_id']}/cancel"
            )
    else:
        if terminal_action == "stale":
            asset.governance_version += 1
            await db_session.commit()
        async with client_factory(user=test_user_risk_manager) as actor:
            terminal = await actor.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approve both Asset responsibilities"},
        )

    assert terminal.status_code == 200, terminal.text
    assert terminal.json()["status"] == expected_status
    db_session.expire_all()
    persisted_asset = await db_session.get(Asset, asset_id)
    persisted_orphans = list(
        (
            await db_session.execute(
                select(OrphanedItem)
                .where(
                    OrphanedItem.item_type == "asset",
                    OrphanedItem.item_id == asset_id,
                )
                .order_by(OrphanedItem.responsibility_role)
            )
        ).scalars()
    )
    assert persisted_asset is not None
    expected_owner_by_role = (
        replacement_by_role if terminal_action == "approve" else former_by_role
    )
    assert persisted_asset.business_owner_user_id == expected_owner_by_role[
        "business_owner"
    ]
    assert persisted_asset.ict_owner_user_id == expected_owner_by_role["ict_owner"]
    assert {
        orphan.responsibility_role: (
            orphan.status,
            orphan.previous_owner_id,
            orphan.new_owner_id,
        )
        for orphan in persisted_orphans
    } == (
        {
            role: ("resolved", former_by_role[role], replacement_by_role[role])
            for role in former_by_role
        }
        if terminal_action == "approve"
        else {
            role: ("pending", former_by_role[role], None)
            for role in former_by_role
        }
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("terminal_action", "expected_status"),
    [
        ("reject", "rejected"),
        ("cancel", "cancelled"),
        ("stale", "expired"),
    ],
)
async def test_late_process_orphan_remains_pending_without_approved_apply(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user: User,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    terminal_action: str,
    expected_status: str,
) -> None:
    await _accountability_scenario(db_session)
    process = Process(
        f_code=f"F-LATE-ORPHAN-{terminal_action.upper()}",
        l0_area="Operations",
        l1_process="Late orphan terminal preservation",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
        cif_override="no",
    )
    db_session.add(process)
    await db_session.commit()
    process_id = process.id
    former_owner_id = test_user_employee.id

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "process_owner_user_id": test_user_risk_manager.id,
                "request_reason": "Queue before owner deactivation",
            },
        )
    assert submitted.status_code == 202, submitted.text
    async with client_factory(user=test_user) as admin:
        deactivated = await admin.patch(
            f"/api/v1/users/{former_owner_id}",
            json={"is_active": False},
        )
    assert deactivated.status_code == 200, deactivated.text
    orphan = await db_session.scalar(
        select(OrphanedItem).where(
            OrphanedItem.item_type == "process",
            OrphanedItem.item_id == process_id,
            OrphanedItem.status == "pending",
            OrphanedItem.previous_owner_id == former_owner_id,
        )
    )
    assert orphan is not None
    orphan_id = orphan.id

    if terminal_action == "reject":
        async with client_factory(user=test_user_risk_manager) as actor:
            terminal = await actor.post(
                f"/api/v1/approvals/{submitted.json()['approval_id']}/reject",
                json={"resolution_notes": "Do not transfer accountability"},
            )
    elif terminal_action == "cancel":
        async with client_factory(user=test_user_cro) as actor:
            terminal = await actor.post(
                f"/api/v1/approvals/{submitted.json()['approval_id']}/cancel"
            )
    else:
        process.governance_version += 1
        await db_session.commit()
        async with client_factory(user=test_user_risk_manager) as actor:
            terminal = await actor.post(
                f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
                json={"resolution_notes": "Attempt stale transfer"},
            )

    assert terminal.status_code == 200, terminal.text
    assert terminal.json()["status"] == expected_status
    db_session.expire_all()
    persisted_process = await db_session.get(Process, process_id)
    persisted_orphan = await db_session.get(OrphanedItem, orphan_id)
    assert persisted_process is not None and persisted_orphan is not None
    assert persisted_process.process_owner_user_id == former_owner_id
    assert persisted_orphan.status == "pending"
    assert persisted_orphan.previous_owner_id == former_owner_id
    assert persisted_orphan.new_owner_id is None


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_protected_vendor_edit_and_distinct_orphan_reassignment_do_not_deadlock(
    async_engine,
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL row locks")
    await _accountability_scenario(db_session)
    await _protected_scenario(
        db_session,
        item_type="vendor",
        requires_approval=True,
    )
    replacement_owner = User(
        name="Distinct orphan replacement owner",
        email="distinct-orphan-replacement@test.local",
        role_id=test_user_employee.role_id,
        department_id=test_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    ordinary_vendor = Vendor(
        name="Ordinary protected Vendor reassignment",
        process="Operations",
        outsourcing_owner_user_id=test_user_cro.id,
        department_id=test_department.id,
        replaceability="not_substitutable",
    )
    orphan_vendor = Vendor(
        name="Distinct protected orphan Vendor reassignment",
        process="Operations",
        outsourcing_owner_user_id=test_user_employee.id,
        department_id=test_department.id,
        replaceability="not_substitutable",
    )
    db_session.add_all(
        [
            replacement_owner,
            ordinary_vendor,
            orphan_vendor,
        ]
    )
    await db_session.commit()
    ordinary_vendor_id = ordinary_vendor.id
    orphan_vendor_id = orphan_vendor.id
    replacement_owner_id = replacement_owner.id
    test_user_employee.is_active = False
    orphans = await flag_orphaned_items(db_session, test_user_employee.id)
    await db_session.commit()
    orphan = next(
        item
        for item in orphans
        if item.item_type == "vendor" and item.item_id == orphan_vendor_id
    )

    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def override_get_db():
        async with session_maker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    settings = Settings(mock_auth_enabled=True, debug=True)
    async with session_maker() as scenario_blocker:
        blocker_pid = await scenario_blocker.scalar(
            text("SELECT pg_backend_pid()")
        )
        locked_scenario = (
            await scenario_blocker.execute(
                select(ApprovalScenario)
                .where(ApprovalScenario.key == "protected_vendor_edit")
                .with_for_update()
            )
        ).scalar_one()
        assert locked_scenario.requires_approval is True
        async with (
            client_factory(
                user=test_user_cro,
                settings=settings,
                db_override=override_get_db,
                raise_app_exceptions=False,
            ) as ordinary_editor,
            client_factory(
                user=test_user_cro,
                settings=settings,
                db_override=override_get_db,
                raise_app_exceptions=False,
            ) as orphan_resolver,
        ):
            ordinary_task = asyncio.create_task(
                ordinary_editor.patch(
                    f"/api/v1/vendors/{ordinary_vendor_id}",
                    json={
                        "outsourcing_owner_user_id": test_user_risk_manager.id,
                        "request_reason": (
                            "Submit an ordinary protected reassignment"
                        ),
                    },
                )
            )
            for _ in range(200):
                await scenario_blocker.execute(
                    text("SELECT pg_stat_clear_snapshot()")
                )
                ordinary_is_waiting = await scenario_blocker.scalar(
                    text(
                        "SELECT EXISTS ("
                        "SELECT 1 FROM pg_stat_activity "
                        "WHERE datname = current_database() "
                        "AND pid != :blocker_pid "
                        "AND state = 'active' "
                        "AND wait_event_type = 'Lock' "
                        "AND query ILIKE '%approval_scenarios%'"
                        ")"
                    ),
                    {"blocker_pid": blocker_pid},
                )
                if ordinary_is_waiting:
                    break
                await asyncio.sleep(0.01)
            else:
                raise AssertionError(
                    "The ordinary protected edit must wait on its scenario row"
                )
            assert not ordinary_task.done()

            orphan_task = asyncio.create_task(
                orphan_resolver.post(
                    f"/api/v1/orphaned-items/{orphan.id}/resolve",
                    json={
                        "new_owner_id": replacement_owner_id,
                        "request_reason": (
                            "Resolve a distinct protected Vendor orphan"
                        ),
                    },
                )
            )
            for _ in range(200):
                await scenario_blocker.execute(
                    text("SELECT pg_stat_clear_snapshot()")
                )
                scenario_waiters = await scenario_blocker.scalar(
                    text(
                        "SELECT count(*) FROM pg_stat_activity "
                        "WHERE datname = current_database() "
                        "AND pid != :blocker_pid "
                        "AND state = 'active' "
                        "AND wait_event_type = 'Lock' "
                        "AND query ILIKE '%approval_scenarios%'"
                    ),
                    {"blocker_pid": blocker_pid},
                )
                if scenario_waiters >= 2:
                    break
                await asyncio.sleep(0.01)
            else:
                raise AssertionError(
                    "Both public requests must wait on the protected Vendor scenario"
                )
            assert not orphan_task.done()
            await scenario_blocker.commit()
            ordinary_response, orphan_response = await asyncio.wait_for(
                asyncio.gather(ordinary_task, orphan_task),
                timeout=10,
            )

    assert ordinary_response.status_code == 202, ordinary_response.text
    assert orphan_response.status_code == 202, orphan_response.text
    assert ordinary_response.json()["approval_id"] != (
        orphan_response.json()["approval_id"]
    )


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_process_orphan_and_ordinary_reassignment_do_not_deadlock(
    async_engine,
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL row and advisory locks")
    await _accountability_scenario(db_session)
    process = Process(
        f_code="F-ORPHAN-PG-OVERLAP",
        l0_area="Operations",
        l1_process="Overlapping orphan submissions",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
    )
    db_session.add(process)
    await db_session.commit()
    process_id = process.id
    replacement_owner_id = test_user_risk_manager.id
    test_user_employee.is_active = False
    orphans = await flag_orphaned_items(db_session, test_user_employee.id)
    await db_session.commit()
    orphan = next(item for item in orphans if item.item_type == "process")
    orphan_id = orphan.id
    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def override_get_db():
        async with session_maker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    settings = Settings(mock_auth_enabled=True, debug=True)
    orphan_request = {
        "new_owner_id": replacement_owner_id,
        "department_id": test_department.id,
        "request_reason": "Resolve Process orphan concurrently",
    }
    async with client_factory(
        user=test_user_cro,
        settings=settings,
        db_override=override_get_db,
    ) as requester:
        responses = await asyncio.wait_for(
            asyncio.gather(
                requester.post(
                    f"/api/v1/orphaned-items/{orphan_id}/resolve",
                    json=orphan_request,
                ),
                requester.patch(
                    f"/api/v1/processes/{process_id}",
                    json={
                        "process_owner_user_id": test_user_cro.id,
                        "request_reason": "Attempt ordinary concurrent transfer",
                    },
                ),
            ),
            timeout=10,
        )
    assert sorted(response.status_code for response in responses) == [202, 409]
    queued = next(response for response in responses if response.status_code == 202)

    async with client_factory(
        user=test_user_risk_manager,
        settings=settings,
        db_override=override_get_db,
    ) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{queued.json()['approval_id']}/approve",
            json={"resolution_notes": "Approve serialized orphan reassignment"},
        )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    async with session_maker() as session:
        persisted = await session.get(Process, process_id)
        persisted_orphan = await session.get(OrphanedItem, orphan_id)
        assert persisted is not None and persisted_orphan is not None
        assert persisted.process_owner_user_id == replacement_owner_id
        assert persisted.governance_version == 2
        assert persisted_orphan.status == "resolved"


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_threat_orphan_and_ordinary_reassignment_do_not_deadlock(
    async_engine,
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    del test_user_risk_manager
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL row and advisory locks")
    await _accountability_scenario(db_session)
    ciso_role = Role(
        name="ciso",
        display_name="Chief Information Security Officer",
    )
    db_session.add(ciso_role)
    await db_session.flush()
    stewards = [
        User(
            name=name,
            email=email,
            role_id=ciso_role.id,
            department_id=test_department.id,
            access_scope=AccessScope.GLOBAL,
            is_active=True,
        )
        for name, email in (
            ("Former concurrent CISO", "former-concurrent-ciso@test.local"),
            ("Governance replacement CISO", "governance-concurrent-ciso@test.local"),
            ("Ordinary replacement CISO", "ordinary-concurrent-ciso@test.local"),
        )
    ]
    db_session.add_all(stewards)
    await db_session.flush()
    threat = Threat(
        name="Concurrent orphan and ordinary Threat reassignment",
        threat_steward_user_id=stewards[0].id,
    )
    db_session.add(threat)
    await db_session.commit()
    stewards[0].is_active = False
    orphans = await flag_orphaned_items(db_session, stewards[0].id)
    await db_session.commit()
    orphan = next(item for item in orphans if item.item_type == "threat")
    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def override_get_db():
        async with session_maker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    settings = Settings(mock_auth_enabled=True, debug=True)
    async with client_factory(
        user=test_user_cro,
        settings=settings,
        db_override=override_get_db,
    ) as requester:
        orphan_response, ordinary_response = await asyncio.wait_for(
            asyncio.gather(
                requester.post(
                    f"/api/v1/orphaned-items/{orphan.id}/resolve",
                    json={
                        "new_owner_id": stewards[1].id,
                        "request_reason": "Resolve orphan concurrently",
                    },
                ),
                requester.patch(
                    f"/api/v1/threats/{threat.id}",
                    json={
                        "threat_steward_user_id": stewards[2].id,
                        "request_reason": "Attempt ordinary concurrent transfer",
                    },
                ),
            ),
            timeout=10,
        )

    assert orphan_response.status_code == 202, orphan_response.text
    assert ordinary_response.status_code == 409, ordinary_response.text


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_vendor_orphan_resolution_rejected_while_impact_lock_is_active(
    async_engine,
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL row and advisory locks")
    await _run_vendor_orphan_resolution_rejected_while_impact_lock_is_active(
        db_session,
        client_factory,
        test_department=test_department,
        test_user_cro=test_user_cro,
        test_user_employee=test_user_employee,
        test_user_risk_manager=test_user_risk_manager,
    )


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_threat_orphan_resolution_rejected_while_impact_lock_is_active(
    async_engine,
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    del test_user_risk_manager
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL row and advisory locks")
    await _run_threat_orphan_resolution_rejected_while_impact_lock_is_active(
        db_session,
        client_factory,
        test_department=test_department,
        test_user_cro=test_user_cro,
    )


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_vendor_orphan_stale_resource_version_expires_without_applying(
    async_engine,
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL row and advisory locks")
    await _run_vendor_orphan_stale_resource_version_expires_without_applying(
        db_session,
        client_factory,
        test_department=test_department,
        test_user_cro=test_user_cro,
        test_user_employee=test_user_employee,
        test_user_risk_manager=test_user_risk_manager,
    )


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_threat_orphan_stale_resource_version_expires_without_applying(
    async_engine,
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL row and advisory locks")
    await _run_threat_orphan_stale_resource_version_expires_without_applying(
        db_session,
        client_factory,
        test_department=test_department,
        test_user_cro=test_user_cro,
        test_user_employee=test_user_employee,
        test_user_risk_manager=test_user_risk_manager,
    )


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_vendor_orphan_stale_proposal_expires_after_real_reassignment(
    async_engine,
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL row and advisory locks")
    await _run_vendor_orphan_stale_proposal_expires_after_real_reassignment(
        db_session,
        client_factory,
        test_department=test_department,
        test_user_cro=test_user_cro,
        test_user_employee=test_user_employee,
        test_user_risk_manager=test_user_risk_manager,
    )
