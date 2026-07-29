"""Approval-scenario configuration projection and update policy."""

from dataclasses import dataclass

from app.models import ApprovalScenario
from app.schemas.riskhub import (
    ApprovalScenarioFixedPolicyRead,
    ApprovalScenarioRead,
    ApprovalScenarioUpdate,
)
from app.services._authorization_capabilities import approval_scenario_capabilities
from app.services._governed_mutations.fixed_asset_policy import (
    ASSET_SCENARIO_KEY,
    FIXED_ASSET_POLICY,
)
from app.services._governed_mutations.fixed_policy import FIXED_PROCESS_POLICY, SCENARIO_KEY
from app.services.approval_scenario_policy import normalize_approval_scenario_roles

from . import approval_scenario_roles


@dataclass(frozen=True, slots=True)
class ApprovalScenarioChanges:
    descriptions: tuple[str, ...]
    audit_changes: dict[str, dict[str, object]]


def approval_scenario_to_read(
    scenario: ApprovalScenario,
    *,
    updated_by_name: str | None = None,
) -> ApprovalScenarioRead:
    resolved_updated_by_name = (
        updated_by_name if updated_by_name is not None else (scenario.updated_by.name if scenario.updated_by else None)
    )
    return ApprovalScenarioRead(
        id=scenario.id,
        key=scenario.key,
        display_name=scenario.display_name,
        description=scenario.description,
        requires_approval=scenario.requires_approval,
        approver_roles=approval_scenario_roles.get_approval_scenario_roles(scenario),
        updated_at=scenario.updated_at.isoformat(),
        updated_by_name=resolved_updated_by_name,
        capabilities=approval_scenario_capabilities(),
        fixed_policy=scenario.key in {SCENARIO_KEY, ASSET_SCENARIO_KEY},
        fixed_policy_definition=(
            ApprovalScenarioFixedPolicyRead(
                threshold=(
                    FIXED_ASSET_POLICY.threshold
                    if scenario.key == ASSET_SCENARIO_KEY
                    else FIXED_PROCESS_POLICY.threshold
                ),
                covered_actions=list(
                    FIXED_ASSET_POLICY.covered_actions
                    if scenario.key == ASSET_SCENARIO_KEY
                    else FIXED_PROCESS_POLICY.covered_actions
                ),
                allow_self_approval=False,
            )
            if scenario.key in {SCENARIO_KEY, ASSET_SCENARIO_KEY}
            else None
        ),
    )


def apply_approval_scenario_changes(
    scenario: ApprovalScenario,
    *,
    key: str,
    data: ApprovalScenarioUpdate,
) -> ApprovalScenarioChanges:
    descriptions: list[str] = []
    audit_changes: dict[str, dict[str, object]] = {}
    if data.requires_approval is not None:
        old_value = scenario.requires_approval
        scenario.requires_approval = data.requires_approval
        if old_value != data.requires_approval:
            descriptions.append(f"requires_approval: {old_value} → {data.requires_approval}")
            audit_changes["requires_approval"] = {"old": old_value, "new": data.requires_approval}

    if data.approver_roles is not None or data.requires_approval is not None:
        old_roles = approval_scenario_roles.get_approval_scenario_roles(scenario)
        normalized_roles = normalize_approval_scenario_roles(
            key,
            data.approver_roles if data.approver_roles is not None else old_roles,
            requires_approval=scenario.requires_approval,
        )
        approval_scenario_roles.set_approval_scenario_roles(scenario, normalized_roles)
        if old_roles != normalized_roles:
            descriptions.append(f"approver_roles: {old_roles} → {normalized_roles}")
            audit_changes["approver_roles"] = {"old": old_roles, "new": normalized_roles}
    return ApprovalScenarioChanges(tuple(descriptions), audit_changes)


__all__ = [
    "ApprovalScenarioChanges",
    "apply_approval_scenario_changes",
    "approval_scenario_to_read",
]
