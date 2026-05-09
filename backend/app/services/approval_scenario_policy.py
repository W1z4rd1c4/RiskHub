"""Runtime policy helpers for Risk Hub approval scenarios."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_read_control_id, can_read_kri_id, can_read_risk_id, can_resolve_approvals
from app.models import ApprovalRequest, ApprovalResourceType, User
from app.models.approval_scenario import ApprovalScenario
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
    roles: list[str],
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
    default_roles: list[str] | None = None,
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


async def can_view_approval_resource(db: AsyncSession, user: User, approval: ApprovalRequest) -> bool:
    """Return whether a user can read the approval's underlying business resource."""
    if approval.resource_type == ApprovalResourceType.RISK:
        return await can_read_risk_id(db, user, approval.resource_id)
    if approval.resource_type == ApprovalResourceType.CONTROL:
        return await can_read_control_id(db, user, approval.resource_id)
    if approval.resource_type == ApprovalResourceType.KRI:
        return await can_read_kri_id(db, user, approval.resource_id)
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
