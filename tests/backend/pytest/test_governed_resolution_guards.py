"""Public approval seams share rejection and corrupt-envelope decisions (#256/257)."""

from __future__ import annotations

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ActivityLog,
    ApprovalRequest,
    ApprovalScenario,
    ApprovalStatus,
    Asset,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    OutboxEvent,
    Process,
    Role,
    Threat,
    User,
    Vendor,
)
from app.models.user import AccessScope

FAMILIES = ("process", "process_extended", "asset", "vendor", "threat")


async def _submit(client_factory, db: AsyncSession, owner: User, family: str) -> int:
    for key in (
        "protected_process_edit",
        "protected_asset_edit",
        "protected_vendor_edit",
        "accountability_reassignment",
    ):
        db.add(
            ApprovalScenario(
                key=key,
                display_name=key,
                description=key,
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            )
        )
    reason = "Review the proposed governed change"
    if family in ("process", "process_extended"):
        row = Process(
            f_code="F-GUARD",
            l0_area="Operations",
            l1_process="Guard test",
            process_owner_user_id=owner.id,
            owning_department_id=owner.department_id,
            cif_override="yes",
        )
        db.add(row)
        await db.commit()
        path = f"/api/v1/processes/{row.id}"
        method = "DELETE" if family == "process_extended" else "PATCH"
        payload = {"request_reason": reason}
        if family == "process":
            payload["notes"] = "Proposed change"
    elif family == "asset":
        row = Asset(
            name="Guard Asset",
            business_owner_user_id=owner.id,
            ict_owner_user_id=owner.id,
            owning_department_id=owner.department_id,
            preliminary_criticality="low",
        )
        db.add(row)
        await db.commit()
        path, method = f"/api/v1/assets/{row.id}", "PATCH"
        payload = {"preliminary_criticality": "critical", "request_reason": reason}
    elif family == "vendor":
        row = Vendor(
            name="Guard Vendor",
            process="Operations",
            outsourcing_owner_user_id=owner.id,
            department_id=owner.department_id,
            replaceability="not_substitutable",
        )
        db.add(row)
        await db.commit()
        path, method = f"/api/v1/vendors/{row.id}", "PATCH"
        payload = {"description": "Proposed change", "request_reason": reason}
    else:
        role = Role(name="ciso", display_name="CISO", is_active=True)
        db.add(role)
        await db.flush()
        stewards = [
            User(
                name=f"Steward {n}",
                email=f"guard-steward-{n}@test.local",
                role_id=role.id,
                department_id=owner.department_id,
                access_scope=AccessScope.GLOBAL,
                is_active=True,
            )
            for n in range(2)
        ]
        db.add_all(stewards)
        await db.flush()
        row = Threat(name="Guard Threat", threat_steward_user_id=stewards[0].id)
        db.add(row)
        await db.commit()
        path, method = f"/api/v1/threats/{row.id}", "PATCH"
        payload = {"threat_steward_user_id": stewards[1].id, "request_reason": reason}
    async with client_factory(user=owner) as requester:
        response = await requester.request(method, path, json=payload)
    assert response.status_code == 202, response.text
    return response.json()["approval_id"]


@pytest.mark.asyncio
@pytest.mark.parametrize("family", FAMILIES)
@pytest.mark.parametrize("reason", ["", " \t\n "])
async def test_http_reject_requires_nonblank_reason_in_every_family(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    family: str,
    reason: str,
) -> None:
    approval_id = await _submit(client_factory, db_session, test_user_cro, family)
    async with client_factory(user=test_user_risk_manager) as reviewer:
        response = await reviewer.post(f"/api/v1/approvals/{approval_id}/reject", json={"resolution_notes": reason})
    approval = await db_session.get(ApprovalRequest, approval_id, populate_existing=True)
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(GovernedMutationProposal.approval_request_id == approval_id)
    )
    locks = list(
        (
            await db_session.scalars(
                select(GovernedMutationImpactLock).where(GovernedMutationImpactLock.proposal_id == proposal.id)
            )
        ).all()
    )
    assert response.status_code == 422, "nonblank reason guard decision violated: " + response.text
    assert approval.status == ApprovalStatus.PENDING
    assert approval.resolved_at is None
    assert locks and all(lock.released_at is None for lock in locks)


@pytest.mark.asyncio
@pytest.mark.parametrize("family", FAMILIES)
@pytest.mark.parametrize("action", ["cancel", "approve", "reject"])
@pytest.mark.parametrize(
    "corruption", ["blank_request_reason", "pending_privileged_status", "malformed_proposal", "malformed_changes"]
)
async def test_http_corrupt_envelope_expires_and_releases_every_family(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    family: str,
    action: str,
    corruption: str,
) -> None:
    if corruption in {"malformed_proposal", "malformed_changes"} and db_session.bind.dialect.name == "postgresql":
        pytest.skip(
            "PostgreSQL insert-only trigger prevents immutable JSON tampering; mutable envelope runs on both dialects"
        )
    approval_id = await _submit(client_factory, db_session, test_user_cro, family)
    before = await _operational_snapshot(db_session)
    actor_id = test_user_cro.id if action == "cancel" else test_user_risk_manager.id
    if corruption in {"malformed_proposal", "malformed_changes"}:
        await db_session.execute(
            update(GovernedMutationProposal)
            .where(GovernedMutationProposal.approval_request_id == approval_id)
            .values(
                **({"derived_impact_snapshot": {}} if corruption == "malformed_proposal" else {"proposed_changes": []})
            )
        )
    changes = (
        {"reason": "   "}
        if corruption == "blank_request_reason"
        else {
            "status": ApprovalStatus.PENDING_PRIVILEGED,
        }
    )
    if corruption not in {"malformed_proposal", "malformed_changes"}:
        await db_session.execute(update(ApprovalRequest).where(ApprovalRequest.id == approval_id).values(**changes))
    await db_session.commit()
    db_session.expire_all()
    async with client_factory(headers={"X-Mock-User-Id": str(actor_id)}) as actor:
        response = await actor.post(
            f"/api/v1/approvals/{approval_id}/{action}",
            **({} if action == "cancel" else {"json": {"resolution_notes": "Review corrupt envelope"}}),
        )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "expired"
    approval = await db_session.get(ApprovalRequest, approval_id, populate_existing=True)
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(GovernedMutationProposal.approval_request_id == approval_id)
    )
    locks = list(
        (
            await db_session.scalars(
                select(GovernedMutationImpactLock).where(GovernedMutationImpactLock.proposal_id == proposal.id)
            )
        ).all()
    )
    assert approval.status == ApprovalStatus.EXPIRED
    assert approval.resolved_at is not None
    assert locks and all(lock.released_at is not None and lock.release_reason == "expired" for lock in locks)

    assert await _operational_snapshot(db_session) == before
    effects = await _terminal_effects(db_session, approval_id)
    assert len(effects[0]) == 1
    assert len(effects[1]) == 1
    assert effects[1][0]["event_type"] == "approval.request_expired"
    async with client_factory(headers={"X-Mock-User-Id": str(actor_id)}) as actor:
        replay = await actor.post(
            f"/api/v1/approvals/{approval_id}/{action}",
            **({} if action == "cancel" else {"json": {"resolution_notes": "Repeated decision"}}),
        )
    assert replay.status_code in (400, 409, 422), replay.text
    assert await _terminal_effects(db_session, approval_id) == effects
    assert await _operational_snapshot(db_session) == before


async def _operational_snapshot(db):
    return [
        list((await db.execute(select(model.__table__).order_by(model.id))).mappings())
        for model in (Process, Asset, Vendor, Threat)
    ]


async def _terminal_effects(db, approval_id):
    from app.models.activity_log import ActivityAction, ActivityEntityType

    audits = list(
        (
            await db.execute(
                select(ActivityLog.__table__)
                .where(
                    ActivityLog.entity_type == ActivityEntityType.APPROVAL,
                    ActivityLog.entity_id == approval_id,
                    ActivityLog.action == ActivityAction.STATUS_CHANGE,
                )
                .order_by(ActivityLog.id)
            )
        ).mappings()
    )
    events = list(
        (
            await db.execute(
                select(OutboxEvent.__table__)
                .where(
                    OutboxEvent.aggregate_type == "approval_request",
                    OutboxEvent.aggregate_id == approval_id,
                    OutboxEvent.event_type.in_(
                        ["approval.request_expired", "approval.request_resolved", "approval.request_cancelled"]
                    ),
                )
                .order_by(OutboxEvent.id)
            )
        ).mappings()
    )
    return audits, events


@pytest.mark.asyncio
@pytest.mark.parametrize("family", FAMILIES)
@pytest.mark.parametrize("action", ["cancel", "approve", "reject"])
async def test_http_unauthorized_actor_cannot_expire_corrupt_proposal(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
    family: str,
    action: str,
) -> None:
    approval_id = await _submit(client_factory, db_session, test_user_cro, family)
    actor_id = test_user_employee.id
    await db_session.execute(
        update(ApprovalRequest)
        .where(ApprovalRequest.id == approval_id)
        .values(status=ApprovalStatus.PENDING_PRIVILEGED)
    )
    await db_session.commit()
    before = await _operational_snapshot(db_session)
    effects = await _terminal_effects(db_session, approval_id)
    db_session.expire_all()
    async with client_factory(headers={"X-Mock-User-Id": str(actor_id)}) as actor:
        response = await actor.post(
            f"/api/v1/approvals/{approval_id}/{action}",
            **({} if action == "cancel" else {"json": {"resolution_notes": "Unauthorized cleanup"}}),
        )
    assert response.status_code in (403, 404), response.text
    approval = await db_session.get(ApprovalRequest, approval_id, populate_existing=True)
    assert approval.status == ApprovalStatus.PENDING_PRIVILEGED
    assert approval.resolved_at is None
    assert await _terminal_effects(db_session, approval_id) == effects
    assert await _operational_snapshot(db_session) == before
    locks = list((await db_session.scalars(select(GovernedMutationImpactLock))).all())
    assert locks and all(lock.released_at is None for lock in locks)


@pytest.mark.asyncio
@pytest.mark.parametrize("revocation", ["inactive", "role"])
async def test_asset_corrupt_expiry_rechecks_locked_resolver_authority(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
    revocation: str,
) -> None:
    from app.core.exceptions import AuthorizationError
    from app.services._governed_mutations.asset_resolution import reject_asset_mutation

    approval_id = await _submit(client_factory, db_session, test_user_cro, "asset")
    # Keep a stale authenticated actor in memory, as when authority changes
    # after request authentication but before the resolver obtains its locks.
    changes = (
        {"is_active": False}
        if revocation == "inactive"
        else {
            "role_id": test_user_employee.role_id,
        }
    )
    await db_session.execute(
        update(User)
        .where(User.id == test_user_risk_manager.id)
        .values(**changes)
        .execution_options(synchronize_session=False)
    )
    await db_session.execute(
        update(ApprovalRequest)
        .where(ApprovalRequest.id == approval_id)
        .values(status=ApprovalStatus.PENDING_PRIVILEGED)
    )
    await db_session.commit()
    assert test_user_risk_manager.is_active
    before = await _terminal_effects(db_session, approval_id)
    with pytest.raises(AuthorizationError):
        await reject_asset_mutation(
            db_session, approval_id=approval_id, current_user=test_user_risk_manager, resolution_notes="Cleanup"
        )
    assert await _terminal_effects(db_session, approval_id) == before
    locks = list((await db_session.scalars(select(GovernedMutationImpactLock))).all())
    assert locks and all(lock.released_at is None for lock in locks)


def _family_module(family):
    from importlib import import_module

    module = {
        "process": "resolution",
        "process_extended": "resolution_extensions",
        "asset": "asset_resolution",
        "vendor": "vendor_resolution",
        "threat": "threat_resolution",
    }[family]
    return import_module(f"app.services._governed_mutations.{module}")


@pytest.mark.asyncio
@pytest.mark.parametrize("family", FAMILIES)
async def test_blank_reason_decision_probe_catches_seeded_guard_bypass(
    monkeypatch,
    client_factory,
    db_session,
    test_user_cro,
    test_user_risk_manager,
    family,
) -> None:
    monkeypatch.setattr(_family_module(family), "require_rejection_reason", lambda value: value)
    try:
        with pytest.raises(AssertionError, match="nonblank reason guard decision violated"):
            await test_http_reject_requires_nonblank_reason_in_every_family(
                client_factory,
                db_session,
                test_user_cro,
                test_user_risk_manager,
                family,
                " \t ",
            )
    except ValueError as exc:
        # Extended Process additionally refuses to serialize the illegally
        # rejected envelope. The seeded bypass still persisted the bad decision.
        assert family == "process_extended"
        assert "Malformed extended governed Process approval envelope" in str(exc)
        approval = (await db_session.scalars(select(ApprovalRequest))).one()
        assert approval.status == ApprovalStatus.REJECTED
        assert not approval.resolution_notes.strip()


async def _assert_terminal_replay_refused(client_factory, db, owner, reviewer, family):
    approval_id = await _submit(client_factory, db, owner, family)
    async with client_factory(user=reviewer) as actor:
        first = await actor.post(
            f"/api/v1/approvals/{approval_id}/reject", json={"resolution_notes": "Reject proposal"}
        )
        assert first.status_code == 200 and first.json()["status"] == "rejected", first.text
        effects = await _terminal_effects(db, approval_id)
        replay = await actor.post(
            f"/api/v1/approvals/{approval_id}/reject", json={"resolution_notes": "Repeated rejection"}
        )
    assert replay.status_code in (400, 409, 422), "pending guard decision violated: " + replay.text
    assert await _terminal_effects(db, approval_id) == effects
    approval = await db.get(ApprovalRequest, approval_id, populate_existing=True)
    assert approval.status == ApprovalStatus.REJECTED


@pytest.mark.asyncio
@pytest.mark.parametrize("family", FAMILIES)
async def test_http_terminal_replay_is_refused(
    client_factory, db_session, test_user_cro, test_user_risk_manager, family
):
    await _assert_terminal_replay_refused(client_factory, db_session, test_user_cro, test_user_risk_manager, family)


@pytest.mark.asyncio
@pytest.mark.parametrize("family", FAMILIES)
async def test_pending_decision_probe_catches_seeded_guard_bypass(
    monkeypatch,
    client_factory,
    db_session,
    test_user_cro,
    test_user_risk_manager,
    family,
):
    monkeypatch.setattr(_family_module(family), "require_pending_resolution", lambda approval: None)
    with pytest.raises(AssertionError, match="pending guard decision violated"):
        await _assert_terminal_replay_refused(client_factory, db_session, test_user_cro, test_user_risk_manager, family)


@pytest.mark.postgres
@pytest.mark.asyncio
@pytest.mark.parametrize("family", FAMILIES)
@pytest.mark.parametrize("action", ["cancel", "approve", "reject"])
async def test_postgres_tampered_envelope_releases_locks_once(
    client_factory,
    db_session,
    test_user_cro,
    test_user_risk_manager,
    family,
    action,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL mutable-envelope and impact-lock contract")
    await test_http_corrupt_envelope_expires_and_releases_every_family(
        client_factory,
        db_session,
        test_user_cro,
        test_user_risk_manager,
        family,
        action,
        "pending_privileged_status",
    )


@pytest.mark.postgres
@pytest.mark.asyncio
@pytest.mark.parametrize("family", FAMILIES)
async def test_postgres_rejection_reason_is_required(
    client_factory,
    db_session,
    test_user_cro,
    test_user_risk_manager,
    family,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL rejected-decision persistence contract")
    await test_http_reject_requires_nonblank_reason_in_every_family(
        client_factory,
        db_session,
        test_user_cro,
        test_user_risk_manager,
        family,
        " \t ",
    )
