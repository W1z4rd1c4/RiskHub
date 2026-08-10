"""Canonical locking and validation for accountability reassignments."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ApprovalScenarioConfigurationError
from app.models import GovernedMutationProposal, User
from app.models.approval_scenario import ApprovalScenario

ACCOUNTABILITY_SCENARIO_KEY = "accountability_reassignment"


@dataclass(frozen=True, slots=True)
class FixedAccountabilityPolicyDefinition:
    threshold: Literal["accountable_user_or_owning_department_change"]
    covered_actions: tuple[Literal["edit"], ...]
    allow_self_approval: Literal[False]


FIXED_ACCOUNTABILITY_POLICY = FixedAccountabilityPolicyDefinition(
    threshold="accountable_user_or_owning_department_change",
    covered_actions=("edit",),
    allow_self_approval=False,
)
ALLOWED_APPROVER_ROLES = frozenset({"risk_manager", "cro"})


async def load_fixed_accountability_scenario_for_update(
    db: AsyncSession,
) -> ApprovalScenario:
    """Lock the fixed scenario through the caller-owned transaction boundary."""
    scenario = (
        await db.execute(
            select(ApprovalScenario)
            .where(ApprovalScenario.key == ACCOUNTABILITY_SCENARIO_KEY)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if scenario is None:
        raise ApprovalScenarioConfigurationError(
            "The fixed accountability reassignment scenario is missing"
        )
    return scenario


async def load_fixed_accountability_scenario(
    db: AsyncSession,
) -> ApprovalScenario | None:
    return (
        await db.execute(
            select(ApprovalScenario).where(
                ApprovalScenario.key == ACCOUNTABILITY_SCENARIO_KEY
            )
        )
    ).scalar_one_or_none()


def validated_fixed_accountability_roles(
    scenario: ApprovalScenario,
) -> list[str]:
    """Return fixed policy roles, rejecting unsafe live configuration."""
    roles = [str(role) for role in (scenario.approver_roles or [])]
    if scenario.requires_approval and (
        not roles
        or len(roles) != len(set(roles))
        or not set(roles).issubset(ALLOWED_APPROVER_ROLES)
    ):
        raise ApprovalScenarioConfigurationError(
            "The accountability reassignment scenario requires one or more "
            "Risk Manager/CRO roles"
        )
    return roles


def is_fixed_accountability_resolution_authority(
    user: User,
    proposal: GovernedMutationProposal,
) -> bool:
    from app.services.approval_scenario_policy import approval_privilege_tier

    role_name = getattr(getattr(user, "role", None), "name", None)
    return bool(
        user.is_active
        and user.id != proposal.requested_by_id
        and approval_privilege_tier(user).is_privileged
        and role_name in ALLOWED_APPROVER_ROLES
    )


def is_live_eligible_accountability_resolver(
    user: User,
    proposal: GovernedMutationProposal,
    scenario: ApprovalScenario | None,
) -> bool:
    role_name = getattr(getattr(user, "role", None), "name", None)
    live_roles = (
        tuple(str(role) for role in (scenario.approver_roles or ()))
        if scenario
        else ()
    )
    snapshot = proposal.scenario_snapshot
    snapshot_roles = (
        tuple(str(role) for role in snapshot.get("approver_roles", ()))
        if isinstance(snapshot, dict)
        and isinstance(snapshot.get("approver_roles"), list)
        else ()
    )
    return bool(
        is_fixed_accountability_resolution_authority(user, proposal)
        and scenario is not None
        and scenario.requires_approval
        and role_name in live_roles
        and role_name in snapshot_roles
    )


__all__ = [
    "ACCOUNTABILITY_SCENARIO_KEY",
    "ALLOWED_APPROVER_ROLES",
    "FIXED_ACCOUNTABILITY_POLICY",
    "FixedAccountabilityPolicyDefinition",
    "load_fixed_accountability_scenario_for_update",
    "is_fixed_accountability_resolution_authority",
    "is_live_eligible_accountability_resolver",
    "load_fixed_accountability_scenario",
    "validated_fixed_accountability_roles",
]
