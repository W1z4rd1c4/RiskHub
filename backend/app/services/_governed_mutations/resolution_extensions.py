"""Atomic resolution for #85 Process create/link/archive proposals."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.audit import process as audit_process
from app.core.datetime_utils import utc_now
from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.permissions import has_permission
from app.models import (
    ApprovalRequest,
    ApprovalStatus,
    Asset,
    Department,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Permission,
    Process,
    Role,
    RolePermission,
    User,
    Vendor,
)
from app.models.approval_scenario import ApprovalScenario
from app.schemas.process import ProcessCreate
from app.services._ict_register_lifecycle.policy import (
    can_read_process_record,
    process_owner_eligibility_error,
)
from app.services._ict_register_lifecycle.projection import load_governed_process_derived_blocks
from app.services._ict_register_reference.parameters import IctWorkbookParameterSet
from app.services._process_owner_lock import acquire_process_owner_identity_locks
from app.services.approval_scenario_policy import (
    can_access_malformed_extended_process_resolution_scope,
    can_resolve_extended_process_approval,
)
from app.services.transaction_boundary import commit_service_boundary

from .fixed_asset_policy import ASSET_SCENARIO_KEY, validated_fixed_asset_roles
from .fixed_policy import SCENARIO_KEY, validated_fixed_process_roles
from .fixed_vendor_policy import VENDOR_SCENARIO_KEY, validated_fixed_vendor_roles
from .process_mutation_policy import safe_process_department_label, safe_process_user_label
from .process_mutations import (
    PROCESS_ARCHIVE_KIND,
    PROCESS_CREATE_KIND,
    PROCESS_RELATIONSHIP_PREFIX,
    ExtendedProcessMutationIdentity,
    extended_process_approval_envelope_is_valid,
    strict_extended_process_identity,
)
from .resolution_lock_plan import GovernedProcessResolutionLocks, lock_governed_process_resolution_suffix
from .terminal_transitions import finalize_governed_terminal_transition

_PENDING = (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED)


async def _load_envelope(
    db: AsyncSession, approval_id: int
) -> tuple[
    ApprovalRequest,
    GovernedMutationProposal,
    ExtendedProcessMutationIdentity | None,
    list[GovernedMutationImpactLock],
]:
    approval = (
        await db.execute(select(ApprovalRequest).where(ApprovalRequest.id == approval_id).with_for_update())
    ).scalar_one_or_none()
    if approval is None:
        raise NotFoundError("Approval request not found")
    proposal = (
        await db.execute(
            select(GovernedMutationProposal)
            .options(selectinload(GovernedMutationProposal.approval_request))
            .where(GovernedMutationProposal.approval_request_id == approval.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if proposal is None:
        raise ValidationError("Approval is not a governed mutation proposal")
    try:
        identity = strict_extended_process_identity(
            proposal,
            validate_approval_envelope=False,
        )
    except ValueError:
        identity = None
    locks = list(
        (
            await db.execute(
                select(GovernedMutationImpactLock)
                .where(GovernedMutationImpactLock.proposal_id == proposal.id)
                .order_by(GovernedMutationImpactLock.resource_type, GovernedMutationImpactLock.resource_id)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    return approval, proposal, identity, locks


async def _expire_malformed_extended(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    proposal: GovernedMutationProposal,
    locks: list[GovernedMutationImpactLock],
    current_user: User,
    requester_cancel: bool = False,
) -> ApprovalRequest:
    """Authorize a bounded expiry without trusting malformed proposal JSON."""
    if approval.status != ApprovalStatus.PENDING:
        raise ValidationError(f"Cannot resolve request with status: {approval.status.value}")
    actor = (await _locked_actor_context(db, {current_user.id})).get(current_user.id)
    if actor is None:
        raise AuthorizationError("Approval actor identity no longer exists")
    if requester_cancel:
        if not (approval.requested_by_id == actor.id and proposal.requested_by_id == actor.id):
            raise AuthorizationError(
                "Only the requester may cancel a governed mutation request",
                code="governed_mutation_requester_cancel_required",
            )

    process_ids = (approval.resource_id,) if type(approval.resource_id) is int and approval.resource_id > 0 else ()
    actor_department_ids = (actor.department_id,) if actor.department_id is not None else ()
    locked = await lock_governed_process_resolution_suffix(
        db,
        process_ids=process_ids,
        additional_department_ids=actor_department_ids,
    )
    process = locked.processes.get(approval.resource_id) if process_ids else None
    if not requester_cancel:
        roles = validated_fixed_process_roles(locked.scenario)
        role_name = getattr(getattr(actor, "role", None), "name", None)
        if not (
            actor.is_active
            and actor.id not in {approval.requested_by_id, proposal.requested_by_id}
            and role_name in roles
        ):
            raise AuthorizationError(
                "Only an active independent configured reviewer may expire a corrupt governed mutation"
            )
    if not requester_cancel and not can_access_malformed_extended_process_resolution_scope(actor, process):
        raise AuthorizationError("Reviewer cannot access the corrupted governed Process scope")
    await _finish_stale(
        db,
        approval=approval,
        proposal=proposal,
        locks=locks,
        actor=actor,
        reason="Governed mutation identity integrity check failed",
        department_id=process.owning_department_id if process is not None else None,
    )
    return await _reload(db, approval.id)


def _envelope_stale_reason(
    approval: ApprovalRequest,
    proposal: GovernedMutationProposal,
    identity: ExtendedProcessMutationIdentity,
    locks: list[GovernedMutationImpactLock],
) -> str | None:
    if not extended_process_approval_envelope_is_valid(proposal, identity):
        return "Governed mutation envelope integrity check failed"
    expected = sorted(
        (
            item["resource_type"],
            item["resource_id"],
            item["base_governance_version"],
        )
        for item in proposal.impacted_resources_snapshot
    )
    actual = sorted(
        (lock.resource_type, lock.resource_id, lock.base_governance_version)
        for lock in locks
        if lock.released_at is None and lock.release_reason is None
    )
    if expected != actual or len(actual) != len(locks):
        return "Governed mutation impact lock integrity check failed"
    return None


async def _locked_actor_context(db: AsyncSession, user_ids: set[int]) -> dict[int, User]:
    """Lock actor identity, manager, Role, and permission state deterministically."""
    primary_ids = sorted(user_id for user_id in user_ids if user_id > 0)
    snapshots = list(
        (
            await db.execute(
                select(User.id, User.role_id, User.manager_id).where(User.id.in_(primary_ids)).order_by(User.id)
            )
        ).all()
    )
    snapshot_by_id = {row.id: row for row in snapshots}
    all_user_ids = sorted(set(primary_ids) | {row.manager_id for row in snapshots if row.manager_id is not None})
    locked_states = list(
        (
            await db.execute(
                select(User.id, User.role_id, User.manager_id)
                .where(User.id.in_(all_user_ids))
                .order_by(User.id)
                .with_for_update()
            )
        ).all()
    )
    locked_state_by_id = {row.id: row for row in locked_states}
    if any(
        user_id not in snapshot_by_id
        or user_id not in locked_state_by_id
        or snapshot_by_id[user_id].role_id != locked_state_by_id[user_id].role_id
        or snapshot_by_id[user_id].manager_id != locked_state_by_id[user_id].manager_id
        for user_id in primary_ids
    ):
        raise ConflictError(
            "Approval actor scope changed concurrently; retry",
            code="approval_actor_scope_changed",
        )
    role_ids = sorted({state.role_id for state in locked_states if state.role_id is not None})
    roles = list(
        (
            await db.execute(
                select(Role)
                .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
                .where(Role.id.in_(role_ids))
                .order_by(Role.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .unique()
        .scalars()
        .all()
    )
    roles_by_id = {role.id: role for role in roles}
    role_permissions = list(
        (
            await db.execute(
                select(RolePermission)
                .options(selectinload(RolePermission.permission))
                .where(RolePermission.role_id.in_(role_ids))
                .order_by(RolePermission.role_id, RolePermission.permission_id, RolePermission.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    permission_ids = sorted({item.permission_id for item in role_permissions})
    if permission_ids:
        await db.execute(
            select(Permission).where(Permission.id.in_(permission_ids)).order_by(Permission.id).with_for_update()
        )
    permissions_by_role = {
        role_id: [item for item in role_permissions if item.role_id == role_id] for role_id in role_ids
    }
    for role in roles:
        set_committed_value(role, "permissions", permissions_by_role.get(role.id, []))
    users = list(
        (
            await db.execute(
                select(User)
                .options(selectinload(User.department))
                .where(User.id.in_(all_user_ids))
                .order_by(User.id)
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    users_by_id = {user.id: user for user in users}
    for user in users:
        set_committed_value(user, "role", roles_by_id.get(user.role_id))
        set_committed_value(user, "manager", users_by_id.get(user.manager_id))
    return users_by_id


def _assert_resolver(
    identity: ExtendedProcessMutationIdentity,
    resolver: User,
    *,
    proposal: GovernedMutationProposal,
    process: Process | None,
) -> None:
    if not can_resolve_extended_process_approval(
        resolver,
        proposal,
        requester_id=identity.requested_by_id,
        configured_roles=identity.approver_roles,
        process=process,
    ):
        raise AuthorizationError("Only an independent configured Risk Manager or CRO may resolve this request")


async def _live_policy_stale_reason(
    identity: ExtendedProcessMutationIdentity,
    resolver: User,
    scenarios: dict[str, ApprovalScenario],
) -> str | None:
    live_role_lists: list[list[str]] = []
    for scenario_key, policy_snapshot in zip(
        identity.triggered_scenarios,
        identity.triggered_policy_snapshots,
        strict=True,
    ):
        scenario = scenarios.get(scenario_key)
        if scenario is None or not scenario.requires_approval:
            return "A triggering governed mutation scenario was disabled after submission"
        if scenario_key == SCENARIO_KEY:
            live_roles = validated_fixed_process_roles(scenario)
        elif scenario_key == ASSET_SCENARIO_KEY:
            live_roles = validated_fixed_asset_roles(scenario)
        else:
            live_roles = validated_fixed_vendor_roles(scenario)
        if live_roles != policy_snapshot["configured_roles"]:
            return "Governed mutation approver roles changed after submission"
        live_role_lists.append(live_roles)
    roles = [role for role in live_role_lists[0] if all(role in configured for configured in live_role_lists[1:])]
    if roles != list(identity.approver_roles):
        return "Governed mutation effective approver roles changed after submission"
    if resolver.role is None or resolver.role.name not in roles:
        return "Resolver is no longer eligible under the live scenario"
    return None


async def _finish_stale(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    proposal: GovernedMutationProposal,
    locks: list[GovernedMutationImpactLock],
    actor: User,
    reason: str,
    department_id: int | None,
) -> None:
    await finalize_governed_terminal_transition(
        db,
        actor=actor,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        department_id=department_id,
        status=ApprovalStatus.EXPIRED,
        resolution_notes=reason,
    )
    await commit_service_boundary(db, boundary="governed_mutation.process_extended.expire")


def _impacted_process_ids(proposal: GovernedMutationProposal) -> list[int]:
    ids = sorted(
        {
            int(item["resource_id"])
            for item in proposal.impacted_resources_snapshot
            if item.get("resource_type") == "process"
        }
    )
    return ids


def _impacted_asset_ids(proposal: GovernedMutationProposal) -> list[int]:
    return sorted(
        {
            int(item["resource_id"])
            for item in proposal.impacted_resources_snapshot
            if item.get("resource_type") == "asset"
        }
    )


def _impacted_vendor_ids(proposal: GovernedMutationProposal) -> list[int]:
    return sorted(
        {
            int(item["resource_id"])
            for item in proposal.impacted_resources_snapshot
            if item.get("resource_type") == "vendor"
        }
    )


async def _lock_extended_resolution_suffix(
    db: AsyncSession,
    *,
    proposal: GovernedMutationProposal,
    identity: ExtendedProcessMutationIdentity,
    additional_department_ids: tuple[int, ...] = (),
) -> GovernedProcessResolutionLocks:
    """Delegate every extended terminal path to the canonical lock suffix."""
    creation_department_ids: tuple[int, ...] = ()
    if identity.mutation_kind == PROCESS_CREATE_KIND:
        department_id = proposal.proposed_changes.get("after", {}).get("owning_department_id")
        if type(department_id) is int and department_id > 0:
            creation_department_ids = (department_id,)
    return await lock_governed_process_resolution_suffix(
        db,
        process_ids=_impacted_process_ids(proposal),
        asset_ids=_impacted_asset_ids(proposal),
        vendor_ids=_impacted_vendor_ids(proposal),
        additional_department_ids=(*additional_department_ids, *creation_department_ids),
        scenario_keys=identity.triggered_scenarios,
    )


def _version_stale_reason(
    proposal: GovernedMutationProposal,
    processes: dict[int, Process],
    assets: dict[int, Asset] | None = None,
    vendors: dict[int, Vendor] | None = None,
) -> str | None:
    for item in proposal.impacted_resources_snapshot:
        if item.get("resource_type") == "process":
            process = processes.get(item["resource_id"])
            if process is None:
                return "An impacted Process no longer exists"
            if process.governance_version != item["base_governance_version"]:
                return "An impacted Process governance version changed after submission"
        elif item.get("resource_type") == "asset":
            asset = (assets or {}).get(item["resource_id"])
            if asset is None:
                return "An impacted Asset no longer exists"
            if asset.governance_version != item["base_governance_version"]:
                return "An impacted Asset governance version changed after submission"
        elif item.get("resource_type") == "vendor":
            vendor = (vendors or {}).get(item["resource_id"])
            if vendor is None:
                return "An impacted Vendor no longer exists"
            if vendor.governance_version != item["base_governance_version"]:
                return "An impacted Vendor governance version changed after submission"
    return None


async def _create_stale_reason(
    db: AsyncSession,
    *,
    proposal: GovernedMutationProposal,
    requester: User | None,
    owner: User | None,
    departments: dict[int, Department],
    parameters: IctWorkbookParameterSet,
) -> tuple[str | None, ProcessCreate | None, User | None, Department | None, Any | None]:
    try:
        proposed_after = proposal.proposed_changes["after"]
        payload = ProcessCreate.model_validate(proposed_after)
    except (KeyError, PydanticValidationError, TypeError):
        return "Proposed Process creation payload is invalid", None, None, None, None
    if requester is None or not requester.is_active or not has_permission(requester, "processes", "write"):
        return "Requester is no longer eligible to create Processes", payload, None, None, None
    department = departments.get(payload.owning_department_id)
    if owner is None or process_owner_eligibility_error(owner) is not None:
        return "Proposed Process owner is no longer eligible", payload, owner, department, None
    if department is None or not department.is_active:
        return "Proposed owning Department is no longer active", payload, owner, department, None
    values = payload.model_dump(exclude={"request_reason"})
    canonical_after = jsonable_encoder(values)
    safe_after = {
        field: value
        for field, value in canonical_after.items()
        if field not in {"process_owner_user_id", "owning_department_id"}
    }
    safe_after["process_owner"] = safe_process_user_label(owner)
    safe_after["owning_department"] = safe_process_department_label(department)
    if proposed_after != canonical_after or proposal.after_snapshot != safe_after:
        return "Proposed Process creation snapshot changed after submission", payload, owner, department, None
    transient = Process(id=0, f_code="pending", **values)
    _, derived = await load_governed_process_derived_blocks(
        db,
        transient,
        updates={},
        parameters=parameters,
    )
    expected = {"before": None, "after": {"cif": derived.cif, "criticality_class": derived.criticality_class}}
    if derived.cif != "yes" or proposal.derived_impact_snapshot != expected:
        return "Proposed Process creation derivation changed after submission", payload, owner, department, derived
    return None, payload, owner, department, derived


async def approve_extended_process_mutation(
    db: AsyncSession, *, approval_id: int, current_user: User, resolution_notes: str
) -> ApprovalRequest:
    approval, proposal, identity, locks = await _load_envelope(db, approval_id)
    if identity is None:
        return await _expire_malformed_extended(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            current_user=current_user,
        )
    if approval.status not in _PENDING:
        raise ValidationError(f"Cannot resolve request with status: {approval.status.value}")
    proposed_owner_id = (
        proposal.proposed_changes.get("after", {}).get("process_owner_user_id")
        if identity.mutation_kind == PROCESS_CREATE_KIND
        else None
    )
    if type(proposed_owner_id) is int and proposed_owner_id > 0:
        # Canonical identity -> User/Process order shared with owner
        # deactivation. Eligibility is decided only after this lock is held.
        await acquire_process_owner_identity_locks(
            db,
            user_ids=(proposed_owner_id,),
        )
    relationship_snapshot = None
    if identity.mutation_kind.startswith(PROCESS_RELATIONSHIP_PREFIX):
        from app.services._governed_mutations.process_relationships import (
            snapshot_process_relationship_authorization,
        )

        relationship_snapshot = await snapshot_process_relationship_authorization(
            db,
            process_ids=set(_impacted_process_ids(proposal)),
            operation=proposal.proposed_changes["operation"],
        )
    actor_ids = {identity.requested_by_id, current_user.id}
    if type(proposed_owner_id) is int and proposed_owner_id > 0:
        actor_ids.add(proposed_owner_id)
    if relationship_snapshot is not None:
        actor_ids.update(relationship_snapshot.owner_user_ids)
    actors = await _locked_actor_context(db, actor_ids)
    requester = actors.get(identity.requested_by_id)
    resolver = actors.get(current_user.id)
    proposed_owner = actors.get(proposed_owner_id) if type(proposed_owner_id) is int else None
    if resolver is None:
        raise AuthorizationError("Resolver identity no longer exists")
    actor_department_ids = tuple(
        sorted({actor.department_id for actor in actors.values() if actor.department_id is not None})
    )
    relationship_department_ids = relationship_snapshot.department_ids if relationship_snapshot is not None else ()
    locked_suffix = await _lock_extended_resolution_suffix(
        db,
        proposal=proposal,
        identity=identity,
        additional_department_ids=(*actor_department_ids, *relationship_department_ids),
    )
    processes = locked_suffix.processes
    point_assets = list(locked_suffix.assets.values())
    point_assets_by_id = {asset.id: asset for asset in point_assets}
    point_vendors = list(locked_suffix.vendors.values())
    point_vendors_by_id = {vendor.id: vendor for vendor in point_vendors}
    primary = processes.get(identity.primary_resource_id) if identity.primary_resource_id else None
    _assert_resolver(identity, resolver, proposal=proposal, process=primary)
    department_id = (
        primary.owning_department_id
        if primary is not None
        else proposal.proposed_changes.get("after", {}).get("owning_department_id")
    )
    stale = _envelope_stale_reason(approval, proposal, identity, locks)
    if stale is None:
        stale = _version_stale_reason(
            proposal,
            processes,
            point_assets_by_id,
            point_vendors_by_id,
        )
    if stale is None:
        stale = await _live_policy_stale_reason(identity, resolver, locked_suffix.scenarios)

    changes: dict[str, dict[str, Any]] = dict(identity.pending_changes)
    if identity.mutation_kind == PROCESS_CREATE_KIND:
        payload = owner = department = None
        if stale is None:
            stale, payload, owner, department, _ = await _create_stale_reason(
                db,
                proposal=proposal,
                requester=requester,
                owner=proposed_owner,
                departments=locked_suffix.departments,
                parameters=locked_suffix.parameters,
            )
        if stale is None:
            assert payload is not None and owner is not None and department is not None
            process = Process(
                **payload.model_dump(exclude={"request_reason"}),
                f_code=f"pending-{uuid4().hex[:12]}",
            )
            process.process_owner = owner
            process.owning_department = department
            db.add(process)
            await db.flush()
            process.f_code = f"F{process.id}"
            await audit_process.process_created(db, actor=resolver, process=process)
            department_id = process.owning_department_id
    elif identity.mutation_kind == PROCESS_ARCHIVE_KIND:
        if stale is None and (
            primary is None
            or primary.is_archived
            or requester is None
            or not requester.is_active
            or not has_permission(requester, "processes", "delete")
            or not can_read_process_record(requester, primary)
        ):
            stale = "Requester is no longer eligible to archive the impacted Process"
        if stale is None:
            assert primary is not None
            current, _ = await load_governed_process_derived_blocks(
                db,
                primary,
                updates={},
                parameters=locked_suffix.parameters,
            )
            process_impact = {
                "before": {"cif": current.cif, "criticality_class": current.criticality_class},
                "after": {"cif": current.cif, "criticality_class": current.criticality_class},
            }
            if point_assets:
                from app.services._governed_mutations.asset_mutations import (
                    process_point_asset_impacts,
                )

                _, asset_rows = await process_point_asset_impacts(
                    db,
                    process=primary,
                    updates={},
                    archive=True,
                    assets=point_assets,
                    parameters=locked_suffix.parameters,
                )
                expected = {
                    "processes": [{"resource_id": primary.id, **process_impact}],
                    "assets": asset_rows,
                }
            else:
                expected = process_impact
            if point_vendors:
                from app.services._governed_mutations.vendor_impact import (
                    process_point_vendor_impacts,
                    vendor_impact_is_protected,
                )

                _, vendor_rows = await process_point_vendor_impacts(
                    db,
                    process=primary,
                    updates={},
                    archive=True,
                    vendors=point_vendors,
                    parameters=locked_suffix.parameters,
                )
                if "processes" not in expected:
                    expected = {
                        "processes": [{"resource_id": primary.id, **process_impact}],
                    }
                expected["vendors"] = vendor_rows
            if (
                SCENARIO_KEY in identity.triggered_scenarios and current.cif != "yes"
            ) or proposal.derived_impact_snapshot != expected:
                stale = "Impacted Process archive derivation changed after submission"
            elif ASSET_SCENARIO_KEY in identity.triggered_scenarios and not any(
                block["cif"] == "yes" or block["resulting_criticality"] == "critical"
                for row in asset_rows
                for block in (row["before"], row["after"])
            ):
                stale = "Downstream Assets are no longer protected by the current policy"
            elif VENDOR_SCENARIO_KEY in identity.triggered_scenarios and not any(
                vendor_impact_is_protected(block)
                for row in vendor_rows
                for block in (row["before"], row["after"])
            ):
                stale = "Downstream Vendors are no longer protected by the current policy"
        if stale is None:
            assert primary is not None
            primary.is_archived = True
            primary.archived_at = utc_now()
            primary.archived_by_id = resolver.id
            primary.governance_version += 1
            for asset in point_assets:
                asset.governance_version += 1
            for vendor in point_vendors:
                vendor.governance_version += 1
            await audit_process.process_archived(db, actor=resolver, process=primary, changes=changes)
    elif identity.mutation_kind.startswith(PROCESS_RELATIONSHIP_PREFIX):
        assert relationship_snapshot is not None
        from app.services._governed_mutations.process_relationships import (
            lock_process_relationship_authorization_rows,
        )

        try:
            await lock_process_relationship_authorization_rows(
                db,
                snapshot=relationship_snapshot,
            )
        except ConflictError as exc:
            stale = str(exc)
        locked_composite_assets: dict[int, Asset] = {}
        if stale is None:
            derived_rows = []
            protected = False
            for process_id in sorted(processes):
                current, _ = await load_governed_process_derived_blocks(
                    db,
                    processes[process_id],
                    updates={},
                    parameters=locked_suffix.parameters,
                )
                block = {"cif": current.cif, "criticality_class": current.criticality_class}
                protected = protected or current.cif == "yes"
                derived_rows.append({"resource_id": process_id, "before": block, "after": block})
            expected_impact: dict[str, object] = {"processes": derived_rows}
            if proposal.derived_impact_snapshot.get("assets"):
                from app.services._governed_mutations.asset_mutations import (
                    process_asset_composite_impact,
                )

                try:
                    asset, asset_impact, asset_protected = await process_asset_composite_impact(
                        db,
                        operation=proposal.proposed_changes["operation"],
                        proposal_db_id=proposal.id,
                        asset=locked_suffix.assets.get(
                            int(proposal.proposed_changes["operation"]["related_resource_id"])
                        ),
                        parameters=locked_suffix.parameters,
                    )
                    locked_composite_assets[asset.id] = asset
                    asset_descriptor = next(
                        (
                            item
                            for item in proposal.impacted_resources_snapshot
                            if item.get("resource_type") == "asset" and item.get("resource_id") == asset.id
                        ),
                        None,
                    )
                    if asset_descriptor is None:
                        stale = "Impacted Asset descriptor is missing"
                    elif asset.governance_version != asset_descriptor.get("base_governance_version"):
                        stale = "An impacted Asset governance version changed after submission"
                    expected_impact["assets"] = [asset_impact]
                    protected = protected or asset_protected
                except (ConflictError, NotFoundError, ValidationError) as exc:
                    stale = str(exc)
            if stale is None and proposal.derived_impact_snapshot.get("vendors"):
                from app.services._governed_mutations.vendor_impact import (
                    process_relationship_vendor_impacts,
                    vendor_impact_is_protected,
                )

                try:
                    _, vendor_rows = await process_relationship_vendor_impacts(
                        db,
                        process=primary,
                        operation=proposal.proposed_changes["operation"],
                        vendors=point_vendors,
                        parameters=locked_suffix.parameters,
                    )
                    expected_impact["vendors"] = vendor_rows
                    vendor_protected = any(
                        vendor_impact_is_protected(block)
                        for row in vendor_rows
                        for block in (row["before"], row["after"])
                    )
                    protected = protected or vendor_protected
                    if VENDOR_SCENARIO_KEY in identity.triggered_scenarios and not vendor_protected:
                        stale = "Downstream Vendors are no longer protected by the current policy"
                except (ConflictError, NotFoundError, ValidationError) as exc:
                    stale = str(exc)
            if stale is None and (not protected or proposal.derived_impact_snapshot != expected_impact):
                stale = "Impacted Process relationship derivation changed after submission"
        if stale is None:
            if primary is None or requester is None or not requester.is_active:
                stale = "Requester or impacted Process is no longer eligible"
            else:
                from app.services._governed_mutations.process_relationships import (
                    apply_process_relationship_operation,
                    validate_process_relationship_requester,
                )

                try:
                    await validate_process_relationship_requester(
                        db, process=primary, operation=proposal.proposed_changes["operation"], requester=requester
                    )
                    changes = await apply_process_relationship_operation(
                        db, process=primary, operation=proposal.proposed_changes["operation"], current_user=resolver
                    )
                    for impacted_asset in locked_composite_assets.values():
                        impacted_asset.governance_version += 1
                    for impacted_vendor in point_vendors:
                        impacted_vendor.governance_version += 1
                except (AuthorizationError, ConflictError, NotFoundError, ValidationError) as exc:
                    stale = str(exc)
    else:  # pragma: no cover - the strict parser makes this unreachable
        raise ValidationError("Unsupported governed mutation proposal", code="governed_mutation_unsupported")

    if stale is not None:
        await _finish_stale(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=resolver,
            reason=stale,
            department_id=department_id,
        )
        return await _reload(db, approval.id)

    await finalize_governed_terminal_transition(
        db,
        actor=resolver,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        department_id=department_id,
        status=ApprovalStatus.APPROVED,
        resolution_notes=resolution_notes,
        applied_changes=changes,
    )
    await commit_service_boundary(db, boundary=f"governed_mutation.{identity.mutation_kind}.apply")
    return await _reload(db, approval.id)


async def reject_extended_process_mutation(
    db: AsyncSession, *, approval_id: int, current_user: User, resolution_notes: str
) -> ApprovalRequest:
    reason = resolution_notes.strip()
    if not reason:
        raise ValidationError(
            "A non-blank rejection reason is mandatory",
            code="governed_mutation_rejection_reason_required",
            status_code=422,
        )
    approval, proposal, identity, locks = await _load_envelope(db, approval_id)
    if identity is None:
        return await _expire_malformed_extended(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            current_user=current_user,
        )
    if approval.status not in _PENDING:
        raise ValidationError(f"Cannot resolve request with status: {approval.status.value}")
    resolver = (await _locked_actor_context(db, {current_user.id})).get(current_user.id)
    if resolver is None:
        raise AuthorizationError("Resolver identity no longer exists")
    locked_suffix = await _lock_extended_resolution_suffix(db, proposal=proposal, identity=identity)
    processes = locked_suffix.processes
    primary = processes.get(identity.primary_resource_id) if identity.primary_resource_id else None
    _assert_resolver(identity, resolver, proposal=proposal, process=primary)
    stale = _envelope_stale_reason(approval, proposal, identity, locks)
    if stale is None:
        stale = await _live_policy_stale_reason(identity, resolver, locked_suffix.scenarios)
    department_id = (
        primary.owning_department_id
        if primary
        else proposal.proposed_changes.get("after", {}).get("owning_department_id")
    )
    if stale is not None:
        await _finish_stale(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=resolver,
            reason=stale,
            department_id=department_id,
        )
        return await _reload(db, approval.id)
    await finalize_governed_terminal_transition(
        db,
        actor=resolver,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        department_id=department_id,
        status=ApprovalStatus.REJECTED,
        resolution_notes=reason,
    )
    await commit_service_boundary(db, boundary="governed_mutation.process_extended.reject")
    return await _reload(db, approval.id)


async def cancel_extended_process_mutation(
    db: AsyncSession, *, approval_id: int, current_user: User
) -> ApprovalRequest:
    approval, proposal, identity, locks = await _load_envelope(db, approval_id)
    if identity is None:
        return await _expire_malformed_extended(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            current_user=current_user,
            requester_cancel=True,
        )
    if approval.status not in _PENDING:
        raise ValidationError(f"Cannot resolve request with status: {approval.status.value}")
    if identity.requested_by_id != current_user.id:
        raise AuthorizationError(
            "Only the requester may cancel a governed mutation request",
            code="governed_mutation_requester_cancel_required",
        )
    actor = (await _locked_actor_context(db, {current_user.id})).get(current_user.id)
    if actor is None:
        raise AuthorizationError("Requester identity no longer exists")
    locked_suffix = await _lock_extended_resolution_suffix(db, proposal=proposal, identity=identity)
    processes = locked_suffix.processes
    primary = processes.get(identity.primary_resource_id) if identity.primary_resource_id else None
    stale = _envelope_stale_reason(approval, proposal, identity, locks)
    department_id = (
        primary.owning_department_id
        if primary
        else proposal.proposed_changes.get("after", {}).get("owning_department_id")
    )
    if stale is not None:
        await _finish_stale(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=actor,
            reason=stale,
            department_id=department_id,
        )
        return await _reload(db, approval.id)
    await finalize_governed_terminal_transition(
        db,
        actor=actor,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        department_id=department_id,
        status=ApprovalStatus.CANCELLED,
    )
    await commit_service_boundary(db, boundary="governed_mutation.process_extended.cancel")
    return await _reload(db, approval.id)


async def _reload(db: AsyncSession, approval_id: int) -> ApprovalRequest:
    return (
        await db.execute(
            select(ApprovalRequest)
            .options(
                selectinload(ApprovalRequest.requested_by),
                selectinload(ApprovalRequest.resolved_by),
                selectinload(ApprovalRequest.governed_mutation_proposal).selectinload(
                    GovernedMutationProposal.requested_by
                ),
            )
            .where(ApprovalRequest.id == approval_id)
        )
    ).scalar_one()


__all__ = ["approve_extended_process_mutation", "cancel_extended_process_mutation", "reject_extended_process_mutation"]
