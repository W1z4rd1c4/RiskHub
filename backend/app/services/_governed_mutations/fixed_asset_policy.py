"""Fixed, non-configurable protection contract for governed Assets."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ApprovalScenarioConfigurationError
from app.core.permissions import can_resolve_approvals
from app.models import GovernedMutationProposal, User
from app.models.approval_scenario import ApprovalScenario

ASSET_SCENARIO_KEY = "protected_asset_edit"
ASSET_ALLOWED_APPROVER_ROLES = frozenset({"risk_manager", "cro"})


@dataclass(frozen=True, slots=True)
class FixedAssetPolicyDefinition:
    threshold: Literal["current_or_proposed_cif_yes_or_resulting_criticality_critical"]
    covered_actions: tuple[Literal["create", "edit", "link", "archive"], ...]
    allow_self_approval: Literal[False]


FIXED_ASSET_POLICY = FixedAssetPolicyDefinition(
    threshold="current_or_proposed_cif_yes_or_resulting_criticality_critical",
    covered_actions=("create", "edit", "link", "archive"),
    allow_self_approval=False,
)


async def load_fixed_asset_scenario_for_update(db: AsyncSession) -> ApprovalScenario:
    scenario = (
        await db.execute(select(ApprovalScenario).where(ApprovalScenario.key == ASSET_SCENARIO_KEY).with_for_update())
    ).scalar_one_or_none()
    if scenario is None:
        raise ApprovalScenarioConfigurationError("The fixed protected Asset approval scenario is missing")
    return scenario


async def load_fixed_asset_scenario(db: AsyncSession) -> ApprovalScenario | None:
    return (
        await db.execute(select(ApprovalScenario).where(ApprovalScenario.key == ASSET_SCENARIO_KEY))
    ).scalar_one_or_none()


def validated_fixed_asset_roles(scenario: ApprovalScenario) -> list[str]:
    roles = [str(role) for role in (scenario.approver_roles or [])]
    if scenario.requires_approval and (
        not roles or len(roles) != len(set(roles)) or not set(roles).issubset(ASSET_ALLOWED_APPROVER_ROLES)
    ):
        raise ApprovalScenarioConfigurationError(
            "The protected Asset scenario requires one or more Risk Manager/CRO roles"
        )
    return roles


def is_live_eligible_asset_resolver(
    user: User,
    proposal: GovernedMutationProposal,
    scenario: ApprovalScenario | None,
) -> bool:
    """One live resolver predicate for every governed Asset consumer."""
    role_name = getattr(getattr(user, "role", None), "name", None)
    live_roles = tuple(str(role) for role in (scenario.approver_roles or ())) if scenario else ()
    return bool(
        is_fixed_asset_resolution_authority(user, proposal)
        and scenario is not None
        and scenario.requires_approval
        and role_name in live_roles
    )


def is_fixed_asset_resolution_authority(
    user: User,
    proposal: GovernedMutationProposal,
) -> bool:
    """Authorize bounded terminal cleanup without trusting mutable JSON or live scenario state."""
    role_name = getattr(getattr(user, "role", None), "name", None)
    return bool(
        user.is_active
        and user.id != proposal.requested_by_id
        and can_resolve_approvals(user)
        and role_name in ASSET_ALLOWED_APPROVER_ROLES
    )


async def can_live_resolve_asset_proposal(
    db: AsyncSession,
    *,
    user: User,
    proposal: GovernedMutationProposal,
) -> bool:
    return is_live_eligible_asset_resolver(
        user,
        proposal,
        await load_fixed_asset_scenario(db),
    )
