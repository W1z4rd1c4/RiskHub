"""Fixed protection contract for governed Vendors."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ApprovalScenarioConfigurationError
from app.models import GovernedMutationProposal, User
from app.models.approval_scenario import ApprovalScenario

from .composite_policy import live_visibility_policy_roles, role_visible_in_snapshot

VENDOR_SCENARIO_KEY = "protected_vendor_edit"
VENDOR_ALLOWED_APPROVER_ROLES = frozenset({"risk_manager", "cro"})


@dataclass(frozen=True, slots=True)
class FixedVendorPolicyDefinition:
    threshold: Literal["current_or_proposed_tier_critical_or_significant"]
    covered_actions: tuple[Literal["create", "edit", "link", "archive"], ...]
    allow_self_approval: Literal[False]


FIXED_VENDOR_POLICY = FixedVendorPolicyDefinition(
    threshold="current_or_proposed_tier_critical_or_significant",
    covered_actions=("create", "edit", "link", "archive"),
    allow_self_approval=False,
)


async def load_fixed_vendor_scenario_for_update(db: AsyncSession) -> ApprovalScenario:
    scenario = (
        await db.execute(
            select(ApprovalScenario)
            .where(ApprovalScenario.key == VENDOR_SCENARIO_KEY)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if scenario is None:
        raise ApprovalScenarioConfigurationError(
            "The fixed protected Vendor approval scenario is missing"
        )
    return scenario


async def load_fixed_vendor_scenario(db: AsyncSession) -> ApprovalScenario | None:
    return (
        await db.execute(
            select(ApprovalScenario).where(ApprovalScenario.key == VENDOR_SCENARIO_KEY)
        )
    ).scalar_one_or_none()


def validated_fixed_vendor_roles(scenario: ApprovalScenario) -> list[str]:
    roles = [str(role) for role in (scenario.approver_roles or [])]
    if scenario.requires_approval and (
        not roles
        or len(roles) != len(set(roles))
        or not set(roles).issubset(VENDOR_ALLOWED_APPROVER_ROLES)
    ):
        raise ApprovalScenarioConfigurationError(
            "The protected Vendor scenario requires one or more Risk Manager/CRO roles"
        )
    return roles


def is_fixed_vendor_resolution_authority(
    user: User,
    proposal: GovernedMutationProposal,
) -> bool:
    from app.services.approval_scenario_policy import approval_privilege_tier

    role_name = getattr(getattr(user, "role", None), "name", None)
    return bool(
        user.is_active
        and user.id != proposal.requested_by_id
        and approval_privilege_tier(user).is_privileged
        and role_name in VENDOR_ALLOWED_APPROVER_ROLES
    )


def is_live_eligible_vendor_resolver(
    user: User,
    proposal: GovernedMutationProposal,
    scenarios: Mapping[str, ApprovalScenario],
) -> bool:
    """Use strict immutable identity and only its actual live triggering policies."""
    from .vendor_identity import strict_vendor_mutation_kind, vendor_triggered_scenarios

    if strict_vendor_mutation_kind(proposal) is None:
        return False
    scenario_keys = vendor_triggered_scenarios(proposal)
    role_name = getattr(getattr(user, "role", None), "name", None)
    return bool(
        is_fixed_vendor_resolution_authority(user, proposal)
        and role_visible_in_snapshot(
            role_name,
            proposal.scenario_snapshot["approver_roles"],
            live_policy_roles=[
                live_visibility_policy_roles(scenario.requires_approval, scenario.approver_roles)
                if (scenario := scenarios.get(key)) is not None
                else None
                for key in scenario_keys
            ],
        )
    )


async def load_vendor_visibility_scenarios(db: AsyncSession) -> dict[str, ApprovalScenario]:
    """Batch-load the bounded policy domain once, then select strict proposal keys."""
    rows = (
        await db.scalars(
            select(ApprovalScenario).where(
                ApprovalScenario.key.in_(("protected_vendor_edit", "accountability_reassignment"))
            )
        )
    ).all()
    return {scenario.key: scenario for scenario in rows}
