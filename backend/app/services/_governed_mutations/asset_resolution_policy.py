"""Shared lock, live-policy, and terminal seams for Asset resolution."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.exceptions import (
    ApprovalScenarioConfigurationError,
    AuthorizationError,
    NotFoundError,
    ValidationError,
)
from app.core.permissions import has_permission
from app.models import (
    ApprovalRequest,
    ApprovalStatus,
    Asset,
    AssetAssetLink,
    AssetVendorLink,
    Department,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Permission,
    Risk,
    RiskAssetLink,
    Role,
    RolePermission,
    User,
    Vendor,
)
from app.services._ict_register_reference.parameters import (
    load_ict_workbook_parameter_set_for_update,
)

from .asset_identity import ASSET_CREATE_KIND, valid_asset_governed_envelope
from .fixed_asset_policy import (
    is_fixed_asset_resolution_authority,
    load_fixed_asset_scenario_for_update,
    validated_fixed_asset_roles,
)
from .fixed_vendor_policy import (
    VENDOR_SCENARIO_KEY,
    load_fixed_vendor_scenario_for_update,
    validated_fixed_vendor_roles,
)
from .terminal_transitions import finalize_governed_terminal_transition


async def commit_asset_boundary(db: AsyncSession, *, boundary: str) -> None:
    """Keep the public Asset mutation facade as the injectable commit seam."""
    from . import asset_mutations

    await asset_mutations.commit_service_boundary(db, boundary=boundary)


async def load_asset_envelope(
    db: AsyncSession,
    approval_id: int,
) -> tuple[ApprovalRequest, GovernedMutationProposal, list[GovernedMutationImpactLock]]:
    approval = (
        await db.execute(select(ApprovalRequest).where(ApprovalRequest.id == approval_id).with_for_update())
    ).scalar_one_or_none()
    if approval is None:
        raise NotFoundError("Approval request not found")
    proposal = (
        await db.execute(
            select(GovernedMutationProposal)
            .where(GovernedMutationProposal.approval_request_id == approval.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if proposal is None or proposal.primary_resource_type != "asset":
        raise ValidationError("Approval is not a governed Asset mutation")
    locks = list(
        (
            await db.execute(
                select(GovernedMutationImpactLock)
                .where(GovernedMutationImpactLock.proposal_id == proposal.id)
                .order_by(
                    GovernedMutationImpactLock.resource_type,
                    GovernedMutationImpactLock.resource_id,
                )
                .with_for_update()
            )
        ).scalars()
    )
    return approval, proposal, locks


async def reload_asset_approval(db: AsyncSession, approval_id: int) -> ApprovalRequest:
    return (
        await db.execute(
            select(ApprovalRequest)
            .options(
                selectinload(ApprovalRequest.requested_by),
                selectinload(ApprovalRequest.resolved_by),
                selectinload(ApprovalRequest.governed_mutation_proposal),
            )
            .where(ApprovalRequest.id == approval_id)
        )
    ).scalar_one()


def _positive_ids_for_keys(value: object, keys: frozenset[str]) -> set[int]:
    if isinstance(value, dict):
        found = {item for key, item in value.items() if key in keys and type(item) is int and item > 0}
        for nested in value.values():
            found.update(_positive_ids_for_keys(nested, keys))
        return found
    if isinstance(value, list):
        found: set[int] = set()
        for nested in value:
            found.update(_positive_ids_for_keys(nested, keys))
        return found
    return set()


async def _lock_asset_resolution_actors(
    db: AsyncSession,
    *,
    proposal: GovernedMutationProposal,
    resolver_id: int,
) -> dict[int, User]:
    """Lock sorted actors and their live Role/RP/Permission authorization graph."""
    actor_ids = sorted(
        {proposal.requested_by_id, resolver_id}
        | _positive_ids_for_keys(
            proposal.proposed_changes,
            frozenset({"business_owner_user_id", "ict_owner_user_id"}),
        )
    )
    actor_states = list(
        (
            await db.execute(
                select(User)
                .where(User.id.in_(actor_ids))
                .order_by(User.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    role_ids = sorted({actor.role_id for actor in actor_states if actor.role_id is not None})
    roles = list(
        (
            await db.execute(
                select(Role)
                .where(Role.id.in_(role_ids))
                .order_by(Role.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    role_permissions = list(
        (
            await db.execute(
                select(RolePermission)
                .where(RolePermission.role_id.in_(role_ids))
                .order_by(
                    RolePermission.role_id,
                    RolePermission.permission_id,
                    RolePermission.id,
                )
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    permission_ids = sorted({row.permission_id for row in role_permissions})
    permissions = list(
        (
            await db.execute(
                select(Permission)
                .where(Permission.id.in_(permission_ids))
                .order_by(Permission.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    permissions_by_id = {permission.id: permission for permission in permissions}
    role_permissions_by_role: dict[int, list[RolePermission]] = {role_id: [] for role_id in role_ids}
    for row in role_permissions:
        set_committed_value(row, "permission", permissions_by_id.get(row.permission_id))
        role_permissions_by_role.setdefault(row.role_id, []).append(row)
    roles_by_id = {role.id: role for role in roles}
    for role in roles:
        set_committed_value(role, "permissions", role_permissions_by_role.get(role.id, []))
    actors_by_id = {actor.id: actor for actor in actor_states}
    for actor in actor_states:
        set_committed_value(actor, "role", roles_by_id.get(actor.role_id))
    return actors_by_id


async def _lock_asset_departments_resources_and_references(
    db: AsyncSession,
    *,
    proposal: GovernedMutationProposal,
    actors: dict[int, User],
) -> None:
    """Lock Department -> Asset -> relationship references in stable id order."""
    asset_ids = {
        item["resource_id"]
        for item in proposal.impacted_resources_snapshot
        if isinstance(item, dict) and item.get("resource_type") == "asset" and type(item.get("resource_id")) is int
    }
    if type(proposal.primary_resource_id) is int:
        asset_ids.add(proposal.primary_resource_id)
    asset_department_snapshot = dict(
        (
            await db.execute(
                select(Asset.id, Asset.owning_department_id).where(Asset.id.in_(sorted(asset_ids))).order_by(Asset.id)
            )
        ).all()
    )
    department_ids = (
        {actor.department_id for actor in actors.values() if actor.department_id is not None}
        | {department_id for department_id in asset_department_snapshot.values() if department_id is not None}
        | _positive_ids_for_keys(
            proposal.proposed_changes,
            frozenset({"owning_department_id"}),
        )
    )
    await db.execute(
        select(Department).where(Department.id.in_(sorted(department_ids))).order_by(Department.id).with_for_update()
    )
    locked_assets = list(
        (
            await db.execute(
                select(Asset)
                .where(Asset.id.in_(sorted(asset_ids)))
                .order_by(Asset.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    if any(asset.owning_department_id != asset_department_snapshot.get(asset.id) for asset in locked_assets):
        raise ValidationError("Asset Department changed concurrently")

    reference_ids = _positive_ids_for_keys(
        proposal.proposed_changes,
        frozenset({"risk_id", "vendor_id", "related_resource_id"}),
    )
    reference_ids.update(
        item["resource_id"]
        for item in proposal.impacted_resources_snapshot
        if isinstance(item, dict)
        and item.get("resource_type") == "vendor"
        and type(item.get("resource_id")) is int
    )
    link_ids = _positive_ids_for_keys(proposal.proposed_changes, frozenset({"id", "link_id"}))
    for model in (Risk, Vendor):
        await db.execute(select(model).where(model.id.in_(sorted(reference_ids))).order_by(model.id).with_for_update())
    for model in (AssetAssetLink, AssetVendorLink, RiskAssetLink):
        await db.execute(select(model).where(model.id.in_(sorted(link_ids))).order_by(model.id).with_for_update())


async def load_live_asset_resolution_policy(
    db: AsyncSession,
    *,
    proposal: GovernedMutationProposal,
    current_user: User,
) -> tuple[User, User | None, str | None]:
    if not is_fixed_asset_resolution_authority(current_user, proposal):
        raise AuthorizationError("Only an independent configured Risk Manager or CRO may resolve this request")
    if not valid_asset_governed_envelope(proposal):
        return current_user, None, "Governed Asset approval envelope is malformed"
    actors = await _lock_asset_resolution_actors(
        db,
        proposal=proposal,
        resolver_id=current_user.id,
    )
    requester = actors.get(proposal.requested_by_id)
    resolver = actors.get(current_user.id)
    if resolver is None:
        raise AuthorizationError("The resolver account is unavailable")
    if not is_fixed_asset_resolution_authority(resolver, proposal):
        raise AuthorizationError("Only an independent configured Risk Manager or CRO may resolve this request")
    await _lock_asset_departments_resources_and_references(
        db,
        proposal=proposal,
        actors=actors,
    )
    await load_ict_workbook_parameter_set_for_update(db)
    snapshot_roles = list(proposal.scenario_snapshot.get("approver_roles", []))
    stale_reason: str | None = None
    triggered_scenarios = proposal.proposed_changes.get(
        "triggered_scenarios",
        ["protected_asset_edit"],
    )
    live_roles = snapshot_roles
    scenario = None
    try:
        # Scenarios are deliberately the final locks in the Asset resolution plan.
        if "protected_asset_edit" in triggered_scenarios:
            scenario = await load_fixed_asset_scenario_for_update(db)
            live_roles = validated_fixed_asset_roles(scenario)
            if not scenario.requires_approval:
                stale_reason = "Protected Asset approval scenario was disabled after submission"
        if stale_reason is None and VENDOR_SCENARIO_KEY in triggered_scenarios:
            vendor_scenario = await load_fixed_vendor_scenario_for_update(db)
            vendor_roles = validated_fixed_vendor_roles(vendor_scenario)
            triggered_policies = proposal.scenario_snapshot.get("triggered_policies", [])
            vendor_snapshot = next(
                (
                    item
                    for item in triggered_policies
                    if isinstance(item, dict) and item.get("key") == VENDOR_SCENARIO_KEY
                ),
                None,
            )
            if not vendor_scenario.requires_approval:
                stale_reason = "Protected Vendor approval scenario was disabled after submission"
            elif vendor_snapshot is None or vendor_snapshot.get("configured_roles") != vendor_roles:
                stale_reason = "Protected Vendor approver roles changed after submission"
            else:
                live_roles = [role for role in live_roles if role in vendor_roles]
        if stale_reason is None and live_roles != snapshot_roles:
            stale_reason = "Composite approver roles changed after submission"
    except ApprovalScenarioConfigurationError:
        stale_reason = "Protected Asset approval scenario is unavailable"
    resolver_role = getattr(getattr(resolver, "role", None), "name", None)
    if stale_reason is None and (
        not is_fixed_asset_resolution_authority(resolver, proposal)
        or resolver_role not in live_roles
    ):
        raise AuthorizationError("Only an independent configured Risk Manager or CRO may resolve this request")
    if requester is None or not requester.is_active:
        stale_reason = "The governed Asset requester is no longer authorized"
    elif proposal.mutation_kind == ASSET_CREATE_KIND and not has_permission(requester, "assets", "write"):
        stale_reason = "The governed Asset requester is no longer authorized"
    return resolver, requester, stale_reason


async def expire_asset_approval(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    proposal: GovernedMutationProposal,
    locks: list[GovernedMutationImpactLock],
    actor: User,
    reason: str,
    department_id: int | None = None,
) -> ApprovalRequest:
    await finalize_governed_terminal_transition(
        db,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        actor=actor,
        department_id=department_id,
        status=ApprovalStatus.EXPIRED,
        resolution_notes=reason,
    )
    await commit_asset_boundary(db, boundary="governed_mutation.asset.resolve")
    return await reload_asset_approval(db, approval.id)


__all__ = [
    "commit_asset_boundary",
    "expire_asset_approval",
    "load_asset_envelope",
    "load_live_asset_resolution_policy",
    "reload_asset_approval",
]
