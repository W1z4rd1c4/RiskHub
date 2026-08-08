"""Runtime policy helpers for Risk Hub approval scenarios."""

from __future__ import annotations

from collections.abc import Collection, Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, cast

from sqlalchemy import and_, false, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    can_read_control_id,
    can_read_kri_id,
    can_read_risk_id,
    can_read_vendor_id,
    can_resolve_approvals,
    get_user_department_ids,
    has_permission,
    is_platform_admin,
)
from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    Asset,
    GovernedMutationProposal,
    Process,
    Threat,
    User,
)
from app.models.approval_scenario import ApprovalScenario
from app.services._governed_mutations.process_identity import (
    GovernedProcessIdentity,
    InvalidGovernedProcessIdentity,
    any_governed_mutation_proposal_exists_clause,
    exact_governed_process_proposal_exists_clause,
    governed_process_role_match_clause,
    is_exact_governed_process_proposal,
    strict_governed_process_identity,
    valid_governed_process_proposal_exists_clause,
)
from app.services._ict_register_lifecycle.asset_policy import can_read_asset_record
from app.services._ict_register_lifecycle.policy import (
    can_read_process_record,
    process_visibility_clause,
)
from app.services._riskhub_config.approval_scenario_roles import get_approval_scenario_roles

if TYPE_CHECKING:
    from app.services._governed_mutations.process_mutations import ExtendedProcessMutationIdentity

RISK_OWNER_APPROVER_ROLE = "risk_owner"
PRIVILEGED_APPROVER_ROLE_ORDER = ("risk_manager", "cro")
PRIVILEGED_APPROVER_ROLES = set(PRIVILEGED_APPROVER_ROLE_ORDER)
TIER_CAPABLE_SCENARIO_KEYS = {
    "risk_delete",
    "risk_edit_priority",
    "control_delete",
    "kri_delete",
    "kri_edit",
    "control_edit",
    "kri_value_submit",
    "kri_history_correction",
}


@dataclass(frozen=True)
class ApprovalScenarioPolicy:
    key: str
    requires_approval: bool
    approver_roles: list[str]


@dataclass(frozen=True)
class GovernedProcessResponsePolicy:
    """Canonical actor-facing access result for one governed Process approval."""

    requested_by_id: int
    can_access: bool
    can_view_snapshot: bool
    can_resolve: bool


@dataclass(frozen=True)
class _GovernedProcessPolicyEvaluation:
    requested_by_id: int
    configured_roles: tuple[str, ...]
    process: Process | None
    is_extended: bool
    can_resolve: bool


@dataclass(frozen=True)
class ApprovalPrivilegeTier:
    is_privileged: bool
    is_primary_approver: bool
    is_requester: bool
    scenario_match: bool | None
    privileged_scenario_match: bool | None


def normalize_approval_scenario_roles(
    key: str,
    roles: Sequence[str],
    *,
    requires_approval: bool = True,
) -> list[str]:
    """Make required approval scenario role lists safe for privileged-stage resolution."""
    normalized_roles: list[str] = []
    for role in roles:
        normalized_role = str(role)
        if normalized_role not in normalized_roles:
            normalized_roles.append(normalized_role)

    if not normalized_roles:
        return list(PRIVILEGED_APPROVER_ROLE_ORDER) if requires_approval else []

    if not requires_approval:
        return normalized_roles

    requires_privileged_fallback = key in TIER_CAPABLE_SCENARIO_KEYS or RISK_OWNER_APPROVER_ROLE in normalized_roles
    if not requires_privileged_fallback:
        return normalized_roles

    if any(role in PRIVILEGED_APPROVER_ROLES for role in normalized_roles):
        return normalized_roles

    return [*normalized_roles, *PRIVILEGED_APPROVER_ROLE_ORDER]


async def load_approval_scenario_policy(
    db: AsyncSession,
    key: str,
    *,
    default_roles: Sequence[str] | None = None,
    default_requires_approval: bool = True,
) -> ApprovalScenarioPolicy:
    """Load a live approval-scenario policy, falling back for legacy/missing rows."""
    result = await db.execute(select(ApprovalScenario).where(ApprovalScenario.key == key))
    scenario = result.scalar_one_or_none()
    if scenario is None:
        return ApprovalScenarioPolicy(
            key=key,
            requires_approval=default_requires_approval,
            approver_roles=normalize_approval_scenario_roles(
                key,
                list(default_roles or ["risk_manager", "cro"]),
                requires_approval=default_requires_approval,
            ),
        )
    return ApprovalScenarioPolicy(
        key=scenario.key,
        requires_approval=scenario.requires_approval,
        approver_roles=normalize_approval_scenario_roles(
            key,
            get_approval_scenario_roles(scenario),
            requires_approval=scenario.requires_approval,
        ),
    )


def apply_approval_scenario_snapshot(
    approval: ApprovalRequest,
    policy: ApprovalScenarioPolicy,
) -> ApprovalRequest:
    """Persist the scenario policy snapshot used by this approval request."""
    approval.scenario_key = policy.key
    approval.scenario_approver_roles = list(policy.approver_roles)
    return approval


def scenario_roles_for_approval(approval: ApprovalRequest) -> list[str] | None:
    roles = approval.scenario_approver_roles
    if roles is None:
        return None
    return [str(role) for role in roles]


def user_matches_approval_scenario_role(approval: ApprovalRequest, user: User) -> bool | None:
    """Return role-match result, or None when approval has no scenario snapshot."""
    roles = scenario_roles_for_approval(approval)
    if roles is None:
        return None
    if approval.requested_by_id == user.id:
        return False
    role_name = getattr(getattr(user, "role", None), "name", None)
    if role_name in roles:
        return True
    return bool(RISK_OWNER_APPROVER_ROLE in roles and approval.primary_approver_id == user.id)


def scenario_allows_privileged_resolution(approval: ApprovalRequest, user: User) -> bool | None:
    """Return privileged-stage role match, or None for legacy approvals."""
    roles = scenario_roles_for_approval(approval)
    if roles is None:
        return None
    role_name = getattr(getattr(user, "role", None), "name", None)
    return bool(role_name in roles and role_name in PRIVILEGED_APPROVER_ROLES)


def can_resolve_process_approval(
    user: User,
    process: Process,
    *,
    requester_id: int,
    configured_roles: Sequence[str],
    user_is_active: bool | None = None,
    role_name: str | None = None,
) -> bool:
    """Canonical Process scenario resolver rule over already loaded state."""
    active = user.is_active if user_is_active is None else user_is_active
    current_role = role_name if role_name is not None else getattr(getattr(user, "role", None), "name", None)
    return bool(
        active
        and user.id != requester_id
        and current_role in {str(role) for role in configured_roles}
        and (can_resolve_approvals(user) or can_read_process_record(user, process))
    )


def proposed_process_from_creation(
    proposal: GovernedMutationProposal,
) -> Process | None:
    """Rebuild the non-operational Process scope used during create intake."""
    if proposal.mutation_kind != "process.create":
        return None
    changes = proposal.proposed_changes
    after = changes.get("after") if isinstance(changes, dict) else None
    if not isinstance(after, dict):
        return None
    try:
        return Process(id=0, f_code="pending", **after)
    except (TypeError, ValueError):
        return None


def can_resolve_extended_process_approval(
    user: User,
    proposal: GovernedMutationProposal,
    *,
    requester_id: int,
    configured_roles: Sequence[str],
    process: Process | None,
) -> bool:
    """Apply the canonical resolver rule to #85 create/archive/link proposals."""
    scoped_process = proposed_process_from_creation(proposal) or process
    return bool(
        scoped_process is not None
        and can_resolve_process_approval(
            user,
            scoped_process,
            requester_id=requester_id,
            configured_roles=configured_roles,
        )
    )


def can_access_malformed_extended_process_resolution_scope(
    user: User,
    process: Process | None,
) -> bool:
    """Authorize only the trustworthy scope of a malformed #85 envelope.

    The caller separately enforces active, independent configured-reviewer
    eligibility. A rowless envelope has no trustworthy scoped resource and
    therefore requires global resolver privilege. When the referenced Process
    still exists, its current visibility is an additional bounded authority.
    """
    tier = approval_privilege_tier(user)
    return bool(tier.is_privileged or (process is not None and can_read_process_record(user, process)))


def can_view_governed_process_snapshot(
    user: User,
    process: Process,
    *,
    requester_id: int,
    configured_roles: Sequence[str],
) -> bool:
    """Expose a proposal snapshot only with Process read or resolver authority."""
    return can_read_process_record(user, process) or can_resolve_process_approval(
        user,
        process,
        requester_id=requester_id,
        configured_roles=configured_roles,
    )


async def _evaluate_governed_process_policy(
    db: AsyncSession,
    *,
    proposal: GovernedMutationProposal,
    user: User,
) -> _GovernedProcessPolicyEvaluation | None:
    """Strictly parse and evaluate one governed Process proposal scope."""
    identity: GovernedProcessIdentity | ExtendedProcessMutationIdentity | None = strict_governed_process_identity(
        proposal
    )
    is_extended = False
    if identity is None:
        from app.services._governed_mutations.process_mutations import (
            is_extended_process_kind,
            strict_extended_process_identity,
        )

        if not is_extended_process_kind(proposal.mutation_kind):
            return None
        identity = strict_extended_process_identity(proposal)
        is_extended = True
    if identity is None:
        return None
    process = await db.get(Process, identity.primary_resource_id) if identity.primary_resource_id is not None else None
    if is_extended:
        resolver = can_resolve_extended_process_approval(
            user,
            proposal,
            requester_id=identity.requested_by_id,
            configured_roles=identity.approver_roles,
            process=process,
        )
    else:
        resolver = bool(
            process is not None
            and can_resolve_process_approval(
                user,
                process,
                requester_id=identity.requested_by_id,
                configured_roles=identity.approver_roles,
            )
        )
    return _GovernedProcessPolicyEvaluation(
        requested_by_id=identity.requested_by_id,
        configured_roles=identity.approver_roles,
        process=process,
        is_extended=is_extended,
        can_resolve=resolver,
    )


async def governed_process_response_policy(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    user: User,
) -> GovernedProcessResponsePolicy | None:
    """Apply one identity/auth/snapshot policy to detail and terminal responses."""
    proposal = approval.governed_mutation_proposal
    if proposal is None:
        return None
    from app.services._governed_mutations.asset_mutations import (
        is_asset_governed_kind,
        valid_asset_governed_envelope,
    )

    if is_asset_governed_kind(proposal.mutation_kind):
        if not valid_asset_governed_envelope(proposal):
            raise ValueError("Malformed governed Asset approval envelope")
        from app.services._governed_mutations.fixed_asset_policy import (
            can_live_resolve_asset_proposal,
        )

        resolver = await can_live_resolve_asset_proposal(
            db,
            user=user,
            proposal=proposal,
        )
        can_access = proposal.requested_by_id == user.id or resolver
        return GovernedProcessResponsePolicy(
            requested_by_id=proposal.requested_by_id,
            can_access=can_access,
            can_view_snapshot=proposal.requested_by_id == user.id or resolver,
            can_resolve=resolver,
        )
    from app.services._governed_mutations.vendor_identity import (
        is_vendor_governed_kind,
        strict_vendor_mutation_kind,
    )

    if is_vendor_governed_kind(proposal.mutation_kind):
        if strict_vendor_mutation_kind(proposal) is None:
            raise ValueError("Malformed governed Vendor approval envelope")
        from app.services._governed_mutations.fixed_vendor_policy import (
            is_live_eligible_vendor_resolver,
            load_fixed_vendor_scenario,
        )

        resolver = is_live_eligible_vendor_resolver(
            user,
            proposal,
            await load_fixed_vendor_scenario(db),
        )
        can_access = proposal.requested_by_id == user.id or resolver
        return GovernedProcessResponsePolicy(
            requested_by_id=proposal.requested_by_id,
            can_access=can_access,
            can_view_snapshot=can_access,
            can_resolve=resolver,
        )
    if proposal.mutation_kind == "threat.edit":
        from app.services._governed_mutations.fixed_accountability_policy import (
            is_live_eligible_accountability_resolver,
            load_fixed_accountability_scenario,
        )
        from app.services._governed_mutations.threat_identity import (
            strict_threat_mutation_kind,
        )

        if strict_threat_mutation_kind(proposal) is None:
            raise ValueError("Malformed governed Threat approval envelope")
        resolver = is_live_eligible_accountability_resolver(
            user,
            proposal,
            await load_fixed_accountability_scenario(db),
        )
        can_access = proposal.requested_by_id == user.id or resolver
        return GovernedProcessResponsePolicy(
            requested_by_id=proposal.requested_by_id,
            can_access=can_access,
            can_view_snapshot=can_access,
            can_resolve=resolver,
        )
    evaluation = await _evaluate_governed_process_policy(
        db,
        proposal=proposal,
        user=user,
    )
    if evaluation is None:
        return None
    if evaluation.is_extended:
        can_view_snapshot = evaluation.requested_by_id == user.id or evaluation.can_resolve
    else:
        can_view_snapshot = bool(
            evaluation.process is not None
            and can_view_governed_process_snapshot(
                user,
                evaluation.process,
                requester_id=evaluation.requested_by_id,
                configured_roles=evaluation.configured_roles,
            )
        )
    return GovernedProcessResponsePolicy(
        requested_by_id=evaluation.requested_by_id,
        can_access=evaluation.requested_by_id == user.id or evaluation.can_resolve,
        can_view_snapshot=can_view_snapshot,
        can_resolve=evaluation.can_resolve,
    )


def process_approval_visibility_clause(user: User):
    """SQL equivalent of the Process resolver's authority-or-visibility arm."""
    if can_resolve_approvals(user):
        return None
    return process_visibility_clause(user)


def _proposed_process_visibility_clause(user: User):
    """SQL equivalent of Process visibility for a rowless create proposal."""
    if can_resolve_approvals(user):
        return None
    if is_platform_admin(user):
        return false()
    after = GovernedMutationProposal.proposed_changes["after"]
    owner_clause = after["process_owner_user_id"].as_integer() == user.id
    if not has_permission(user, "processes", "read"):
        return owner_clause
    department_ids = get_user_department_ids(user)
    if department_ids is None:
        return None
    if not department_ids:
        return owner_clause
    return or_(
        owner_clause,
        after["owning_department_id"].as_integer().in_(department_ids),
    )


def is_governed_process_approval(approval: ApprovalRequest) -> bool:
    """Classify the fixed workflow from its immutable proposal evidence."""
    proposal = approval.governed_mutation_proposal
    if is_exact_governed_process_proposal(proposal):
        return True
    if proposal is None:
        return False
    from app.services._governed_mutations.process_mutations import (
        is_extended_process_kind,
        strict_extended_process_identity,
    )

    if not is_extended_process_kind(proposal.mutation_kind):
        return False
    try:
        return strict_extended_process_identity(proposal) is not None
    except ValueError:
        return False


def _extended_process_approval_exists_clause(
    *extra_conditions,
    join_process: bool = False,
    valid_extended_approval_ids: Collection[int] = (),
):
    """Classify #85 envelopes by the exact strict-parser membership set."""
    valid_ids = tuple(sorted(set(valid_extended_approval_ids)))
    if not valid_ids:
        return false()
    proposal = GovernedMutationProposal
    statement = select(GovernedMutationProposal.id)
    if join_process:
        statement = statement.join(
            Process,
            Process.id == GovernedMutationProposal.primary_resource_id,
        )
    return statement.where(
        proposal.approval_request_id == ApprovalRequest.id,
        ApprovalRequest.id.in_(valid_ids),
        *extra_conditions,
    ).exists()


def governed_process_approval_exists_clause(
    valid_extended_approval_ids: Collection[int] = (),
):
    """Correlated immutable-evidence classifier for approval SQL queries."""
    return or_(
        exact_governed_process_proposal_exists_clause(),
        _extended_process_approval_exists_clause(
            valid_extended_approval_ids=valid_extended_approval_ids,
        ),
    )


def governed_process_requester_clause(
    user_id: int | None,
    valid_extended_approval_ids: Collection[int] = (),
):
    """Match requester-owned legacy and valid #85 Process proposals."""
    if user_id is None:
        return false()
    return or_(
        valid_governed_process_proposal_exists_clause(GovernedMutationProposal.requested_by_id == user_id),
        _extended_process_approval_exists_clause(
            GovernedMutationProposal.requested_by_id == user_id,
            valid_extended_approval_ids=valid_extended_approval_ids,
        ),
    )


def approval_resource_type_filter_clause(
    resource_type: ApprovalResourceType,
    valid_extended_approval_ids: Collection[int] = (),
):
    """Filter fixed approvals by immutable proposal type and legacy rows by envelope."""
    any_proposal = any_governed_mutation_proposal_exists_clause()
    exact_type_match = (
        select(GovernedMutationProposal.id)
        .where(
            GovernedMutationProposal.approval_request_id == ApprovalRequest.id,
            GovernedMutationProposal.mutation_kind == "process.edit",
            GovernedMutationProposal.primary_resource_type == resource_type.value,
        )
        .exists()
    )
    extended_type_match = and_(
        true() if resource_type == ApprovalResourceType.PROCESS else false(),
        _extended_process_approval_exists_clause(
            valid_extended_approval_ids=valid_extended_approval_ids,
        ),
    )
    return or_(
        exact_type_match,
        extended_type_match,
        and_(
            ~any_proposal,
            ApprovalRequest.resource_type == resource_type,
        ),
    )


def process_approval_resolver_clause(
    user: User,
    valid_extended_approval_ids: Collection[int] = (),
):
    """SQL equivalent of the canonical governed Process resolver predicate."""
    role_name = getattr(getattr(user, "role", None), "name", None)
    if not user.is_active or user.id is None or not role_name:
        return false()

    conditions = [
        GovernedMutationProposal.requested_by_id != user.id,
        governed_process_role_match_clause(str(role_name)),
    ]
    visibility_clause = process_approval_visibility_clause(user)
    if visibility_clause is not None:
        conditions.append(visibility_clause)
    exact = valid_governed_process_proposal_exists_clause(
        *conditions,
        join_process=True,
    )
    extended_role = governed_process_role_match_clause(str(role_name))
    extended_conditions = [
        GovernedMutationProposal.requested_by_id != user.id,
        extended_role,
    ]
    if visibility_clause is not None:
        extended_conditions.append(visibility_clause)
    extended_existing = _extended_process_approval_exists_clause(
        GovernedMutationProposal.mutation_kind != "process.create",
        *extended_conditions,
        join_process=True,
        valid_extended_approval_ids=valid_extended_approval_ids,
    )
    proposed_visibility = _proposed_process_visibility_clause(user)
    create_conditions = [
        GovernedMutationProposal.requested_by_id != user.id,
        extended_role,
    ]
    if proposed_visibility is not None:
        create_conditions.append(proposed_visibility)
    extended_create = _extended_process_approval_exists_clause(
        GovernedMutationProposal.mutation_kind == "process.create",
        *create_conditions,
        valid_extended_approval_ids=valid_extended_approval_ids,
    )
    return or_(exact, extended_existing, extended_create)


async def can_resolve_scenario_approval(
    db: AsyncSession,
    user: User,
    approval: ApprovalRequest,
) -> bool:
    """Apply scenario role and resource scope through one resolver policy."""
    proposal = (
        await db.execute(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id == approval.id,
                GovernedMutationProposal.mutation_kind.like("process.%"),
                GovernedMutationProposal.primary_resource_type == "process",
            )
        )
    ).scalar_one_or_none()
    if proposal is not None:
        try:
            evaluation = await _evaluate_governed_process_policy(
                db,
                proposal=proposal,
                user=user,
            )
        except (InvalidGovernedProcessIdentity, ValueError):
            return False
        return bool(evaluation is not None and evaluation.can_resolve)
    asset_proposal = approval.governed_mutation_proposal
    if asset_proposal is not None:
        if asset_proposal.mutation_kind == "threat.edit":
            from app.services._governed_mutations.fixed_accountability_policy import (
                is_live_eligible_accountability_resolver,
                load_fixed_accountability_scenario,
            )
            from app.services._governed_mutations.threat_identity import (
                strict_threat_mutation_kind,
            )

            if strict_threat_mutation_kind(asset_proposal) is None:
                return False
            return is_live_eligible_accountability_resolver(
                user,
                asset_proposal,
                await load_fixed_accountability_scenario(db),
            )
        from app.services._governed_mutations.vendor_identity import (
            is_vendor_governed_kind,
            strict_vendor_mutation_kind,
        )

        if is_vendor_governed_kind(asset_proposal.mutation_kind):
            if strict_vendor_mutation_kind(asset_proposal) is None:
                return False
            from app.services._governed_mutations.fixed_vendor_policy import (
                is_live_eligible_vendor_resolver,
                load_fixed_vendor_scenario,
            )

            return is_live_eligible_vendor_resolver(
                user,
                asset_proposal,
                await load_fixed_vendor_scenario(db),
            )
        from app.services._governed_mutations.asset_mutations import valid_asset_governed_envelope

        if not valid_asset_governed_envelope(asset_proposal):
            return False
        from app.services._governed_mutations.fixed_asset_policy import (
            can_live_resolve_asset_proposal,
        )

        return await can_live_resolve_asset_proposal(
            db,
            user=user,
            proposal=asset_proposal,
        )
    if user_matches_approval_scenario_role(approval, user) is not True:
        return False
    return can_resolve_approvals(user) or await can_view_approval_resource(db, user, approval)


async def can_view_approval_resource(db: AsyncSession, user: User, approval: ApprovalRequest) -> bool:
    """Return whether a user can read the approval's underlying business resource."""
    # cast: ck_approval_requests_process_create_resource_identity permits NULL resource_id
    # only for PROCESS/ASSET/VENDOR CREATE rows, so RISK/CONTROL/KRI rows carry an int.
    if approval.resource_type == ApprovalResourceType.RISK:
        return await can_read_risk_id(db, user, cast(int, approval.resource_id))
    if approval.resource_type == ApprovalResourceType.CONTROL:
        return await can_read_control_id(db, user, cast(int, approval.resource_id))
    if approval.resource_type == ApprovalResourceType.KRI:
        return await can_read_kri_id(db, user, cast(int, approval.resource_id))
    if approval.resource_type == ApprovalResourceType.PROCESS:
        process = await db.get(Process, approval.resource_id)
        return process is not None and can_read_process_record(user, process)
    if approval.resource_type == ApprovalResourceType.ASSET:
        asset = await db.get(Asset, approval.resource_id) if approval.resource_id else None
        return asset is not None and can_read_asset_record(user, asset)
    if approval.resource_type == ApprovalResourceType.VENDOR:
        return bool(
            approval.resource_id
            and await can_read_vendor_id(db, user, approval.resource_id)
        )
    if approval.resource_type == ApprovalResourceType.THREAT:
        return bool(
            approval.resource_id
            and await db.get(Threat, approval.resource_id) is not None
            and has_permission(user, "threats", "read")
        )
    return False


def approval_privilege_tier(
    user: User,
    approval: ApprovalRequest | None = None,
) -> ApprovalPrivilegeTier:
    """Resolve approval privilege data without requiring a database round-trip."""
    if approval is None:
        return ApprovalPrivilegeTier(
            is_privileged=can_resolve_approvals(user),
            is_primary_approver=False,
            is_requester=False,
            scenario_match=None,
            privileged_scenario_match=None,
        )

    return ApprovalPrivilegeTier(
        is_privileged=can_resolve_approvals(user),
        is_primary_approver=approval.primary_approver_id == user.id,
        is_requester=approval.requested_by_id == user.id,
        scenario_match=user_matches_approval_scenario_role(approval, user),
        privileged_scenario_match=scenario_allows_privileged_resolution(approval, user),
    )


async def resolve_approval_privilege_tier(
    db: AsyncSession,
    user: User,
    approval: ApprovalRequest | None = None,
) -> ApprovalPrivilegeTier:
    """Single source of truth for approval-resolution authorization tier."""
    _ = db
    return approval_privilege_tier(user, approval)
