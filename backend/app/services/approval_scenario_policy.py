"""Runtime policy helpers for Risk Hub approval scenarios."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import and_, false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_read_control_id, can_read_kri_id, can_read_risk_id, can_resolve_approvals
from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    GovernedMutationProposal,
    Process,
    User,
)
from app.models.approval_scenario import ApprovalScenario
from app.services._governed_mutations.process_identity import (
    InvalidGovernedProcessIdentity,
    any_governed_mutation_proposal_exists_clause,
    exact_governed_process_proposal_exists_clause,
    governed_process_role_match_clause,
    is_exact_governed_process_proposal,
    strict_governed_process_identity,
    valid_governed_process_proposal_exists_clause,
)
from app.services._ict_register_lifecycle.policy import (
    can_read_process_record,
    process_visibility_clause,
)
from app.services._riskhub_config.approval_scenario_roles import get_approval_scenario_roles

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
    current_role = (
        role_name
        if role_name is not None
        else getattr(getattr(user, "role", None), "name", None)
    )
    return bool(
        active
        and user.id != requester_id
        and current_role in {str(role) for role in configured_roles}
        and (
            can_resolve_approvals(user)
            or can_read_process_record(user, process)
        )
    )


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


def process_approval_visibility_clause(user: User):
    """SQL equivalent of the Process resolver's authority-or-visibility arm."""
    if can_resolve_approvals(user):
        return None
    return process_visibility_clause(user)


def is_governed_process_approval(approval: ApprovalRequest) -> bool:
    """Classify the fixed workflow from its immutable proposal evidence."""
    return is_exact_governed_process_proposal(
        approval.governed_mutation_proposal
    )


def governed_process_approval_exists_clause():
    """Correlated immutable-evidence classifier for approval SQL queries."""
    return exact_governed_process_proposal_exists_clause()


def approval_resource_type_filter_clause(resource_type: ApprovalResourceType):
    """Filter fixed approvals by immutable proposal type and legacy rows by envelope."""
    any_proposal = any_governed_mutation_proposal_exists_clause()
    governed_type_match = (
        select(GovernedMutationProposal.id)
        .where(
            GovernedMutationProposal.approval_request_id == ApprovalRequest.id,
            GovernedMutationProposal.mutation_kind == "process.edit",
            GovernedMutationProposal.primary_resource_type == resource_type.value,
        )
        .exists()
    )
    return or_(
        governed_type_match,
        and_(
            ~any_proposal,
            ApprovalRequest.resource_type == resource_type,
        ),
    )


def process_approval_resolver_clause(user: User):
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
    return valid_governed_process_proposal_exists_clause(
        *conditions,
        join_process=True,
    )


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
                GovernedMutationProposal.mutation_kind == "process.edit",
                GovernedMutationProposal.primary_resource_type == "process",
            )
        )
    ).scalar_one_or_none()
    if proposal is not None:
        try:
            identity = strict_governed_process_identity(proposal)
        except InvalidGovernedProcessIdentity:
            return False
        assert identity is not None
        process = await db.get(Process, identity.primary_resource_id)
        return bool(
            process is not None
            and can_resolve_process_approval(
                user,
                process,
                requester_id=identity.requested_by_id,
                configured_roles=identity.approver_roles,
            )
        )
    if user_matches_approval_scenario_role(approval, user) is not True:
        return False
    return can_resolve_approvals(user) or await can_view_approval_resource(
        db, user, approval
    )


async def can_view_approval_resource(db: AsyncSession, user: User, approval: ApprovalRequest) -> bool:
    """Return whether a user can read the approval's underlying business resource."""
    if approval.resource_type == ApprovalResourceType.RISK:
        return await can_read_risk_id(db, user, approval.resource_id)
    if approval.resource_type == ApprovalResourceType.CONTROL:
        return await can_read_control_id(db, user, approval.resource_id)
    if approval.resource_type == ApprovalResourceType.KRI:
        return await can_read_kri_id(db, user, approval.resource_id)
    if approval.resource_type == ApprovalResourceType.PROCESS:
        process = await db.get(Process, approval.resource_id)
        return process is not None and can_read_process_record(user, process)
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
