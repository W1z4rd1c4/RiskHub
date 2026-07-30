"""Canonical locking and validation for the fixed Process approval policy."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ApprovalScenarioConfigurationError
from app.models.approval_scenario import ApprovalScenario

SCENARIO_KEY = "protected_process_edit"


@dataclass(frozen=True, slots=True)
class FixedProcessPolicyDefinition:
    threshold: Literal["current_or_proposed_cif_yes"]
    covered_actions: tuple[Literal["edit"], ...]
    allow_self_approval: Literal[False]


FIXED_PROCESS_POLICY = FixedProcessPolicyDefinition(
    threshold="current_or_proposed_cif_yes",
    covered_actions=("edit",),
    allow_self_approval=False,
)
ALLOWED_APPROVER_ROLES = frozenset({"risk_manager", "cro"})


async def load_fixed_process_scenario_for_update(
    db: AsyncSession,
) -> ApprovalScenario:
    """Lock the fixed scenario through the caller-owned transaction boundary."""
    scenario = (
        await db.execute(
            select(ApprovalScenario)
            .where(ApprovalScenario.key == SCENARIO_KEY)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if scenario is None:
        raise ApprovalScenarioConfigurationError(
            "The fixed protected Process approval scenario is missing"
        )
    return scenario


async def load_fixed_process_scenario(
    db: AsyncSession,
) -> ApprovalScenario | None:
    return (
        await db.execute(
            select(ApprovalScenario).where(ApprovalScenario.key == SCENARIO_KEY)
        )
    ).scalar_one_or_none()


def validated_fixed_process_roles(scenario: ApprovalScenario) -> list[str]:
    """Return the fixed policy roles, rejecting unsafe live configuration."""
    roles = [str(role) for role in (scenario.approver_roles or [])]
    if scenario.requires_approval and (
        not roles
        or len(roles) != len(set(roles))
        or not set(roles).issubset(ALLOWED_APPROVER_ROLES)
    ):
        raise ApprovalScenarioConfigurationError(
            "The protected Process scenario requires one or more Risk Manager/CRO roles"
        )
    return roles


__all__ = [
    "ALLOWED_APPROVER_ROLES",
    "FIXED_PROCESS_POLICY",
    "FixedProcessPolicyDefinition",
    "SCENARIO_KEY",
    "load_fixed_process_scenario",
    "load_fixed_process_scenario_for_update",
    "validated_fixed_process_roles",
]
