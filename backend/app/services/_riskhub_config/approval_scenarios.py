"""Approval-scenario configuration projection and update policy."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationError
from app.models import ApprovalScenario, User
from app.schemas.riskhub import (
    ApprovalScenarioFixedPolicyRead,
    ApprovalScenarioRead,
    ApprovalScenarioUpdate,
)
from app.services._authorization_capabilities import approval_scenario_capabilities
from app.services._governed_mutations.fixed_accountability_policy import (
    ACCOUNTABILITY_SCENARIO_KEY,
    FIXED_ACCOUNTABILITY_POLICY,
    load_fixed_accountability_scenario_for_update,
)
from app.services._governed_mutations.fixed_accountability_policy import (
    ALLOWED_APPROVER_ROLES as ACCOUNTABILITY_ALLOWED_APPROVER_ROLES,
)
from app.services._governed_mutations.fixed_asset_policy import (
    ASSET_ALLOWED_APPROVER_ROLES,
    ASSET_SCENARIO_KEY,
    FIXED_ASSET_POLICY,
    load_fixed_asset_scenario_for_update,
)
from app.services._governed_mutations.fixed_policy import (
    ALLOWED_APPROVER_ROLES,
    FIXED_PROCESS_POLICY,
    SCENARIO_KEY,
    load_fixed_process_scenario_for_update,
)
from app.services._governed_mutations.fixed_vendor_policy import (
    FIXED_VENDOR_POLICY,
    VENDOR_ALLOWED_APPROVER_ROLES,
    VENDOR_SCENARIO_KEY,
    load_fixed_vendor_scenario_for_update,
)
from app.services.approval_scenario_policy import normalize_approval_scenario_roles

from . import approval_scenario_roles

_FIXED_ALLOWED_APPROVER_ROLES = {
    SCENARIO_KEY: ALLOWED_APPROVER_ROLES,
    ASSET_SCENARIO_KEY: ASSET_ALLOWED_APPROVER_ROLES,
    VENDOR_SCENARIO_KEY: VENDOR_ALLOWED_APPROVER_ROLES,
    ACCOUNTABILITY_SCENARIO_KEY: ACCOUNTABILITY_ALLOWED_APPROVER_ROLES,
}


@dataclass(frozen=True, slots=True)
class ApprovalScenarioChanges:
    descriptions: tuple[str, ...]
    audit_changes: dict[str, dict[str, object]]


def _fixed_policy_definition(
    scenario_key: str,
) -> ApprovalScenarioFixedPolicyRead | None:
    policies = {
        SCENARIO_KEY: FIXED_PROCESS_POLICY,
        ASSET_SCENARIO_KEY: FIXED_ASSET_POLICY,
        VENDOR_SCENARIO_KEY: FIXED_VENDOR_POLICY,
        ACCOUNTABILITY_SCENARIO_KEY: FIXED_ACCOUNTABILITY_POLICY,
    }
    policy = policies.get(scenario_key)
    if policy is None:
        return None
    return ApprovalScenarioFixedPolicyRead(
        threshold=policy.threshold,
        covered_actions=list(policy.covered_actions),
        allow_self_approval=False,
    )


def approval_scenario_to_read(
    scenario: ApprovalScenario,
    *,
    viewer: User,
    updated_by_name: str | None = None,
) -> ApprovalScenarioRead:
    fixed_policy_definition = _fixed_policy_definition(scenario.key)
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
        capabilities=approval_scenario_capabilities(viewer),
        fixed_policy=fixed_policy_definition is not None,
        fixed_policy_definition=fixed_policy_definition,
    )


async def load_approval_scenario_for_update(
    db: AsyncSession,
    key: str,
) -> ApprovalScenario:
    fixed_loaders = {
        SCENARIO_KEY: load_fixed_process_scenario_for_update,
        ASSET_SCENARIO_KEY: load_fixed_asset_scenario_for_update,
        VENDOR_SCENARIO_KEY: load_fixed_vendor_scenario_for_update,
        ACCOUNTABILITY_SCENARIO_KEY: load_fixed_accountability_scenario_for_update,
    }
    if loader := fixed_loaders.get(key):
        return await loader(db)
    scenario = (
        await db.execute(
            select(ApprovalScenario)
            .options(selectinload(ApprovalScenario.updated_by))
            .where(ApprovalScenario.key == key)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if scenario is None:
        raise NotFoundError(f"Approval scenario '{key}' not found")
    return scenario


def validate_fixed_approval_scenario_update(
    scenario: ApprovalScenario,
    *,
    key: str,
    data: ApprovalScenarioUpdate,
) -> None:
    allowed_roles = _FIXED_ALLOWED_APPROVER_ROLES.get(key)
    if allowed_roles is None:
        return
    effective_requires_approval = (
        data.requires_approval
        if data.requires_approval is not None
        else scenario.requires_approval
    )
    effective_roles = (
        data.approver_roles
        if data.approver_roles is not None
        else scenario.approver_roles
    )
    roles = {str(role) for role in (effective_roles or [])}
    if effective_requires_approval and (
        not roles or not roles.issubset(allowed_roles)
    ):
        raise ValidationError(
            "Fixed scenarios may only be approved by Risk Manager or CRO roles",
            status_code=422,
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
    "load_approval_scenario_for_update",
    "validate_fixed_approval_scenario_update",
]
