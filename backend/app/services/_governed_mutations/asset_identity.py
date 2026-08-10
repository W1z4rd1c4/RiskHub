"""Strict fixed identity and queue selection for governed Asset proposals."""

from __future__ import annotations

from collections.abc import Collection, Sequence
from typing import Any
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    GovernedMutationProposal,
)

from .composite_policy import strict_triggered_policy_snapshots
from .fixed_accountability_policy import ACCOUNTABILITY_SCENARIO_KEY
from .fixed_asset_policy import ASSET_SCENARIO_KEY
from .fixed_vendor_policy import VENDOR_SCENARIO_KEY

ASSET_CREATE_KIND = "asset.create"
ASSET_EDIT_KIND = "asset.edit"
ASSET_ARCHIVE_KIND = "asset.archive"
ASSET_RELATIONSHIP_PREFIX = "asset.link."
ASSET_RELATIONSHIP_KINDS = frozenset(
    f"{ASSET_RELATIONSHIP_PREFIX}{resource}.{action}"
    for resource in ("asset", "vendor", "risk")
    for action in ("add", "remove")
)
_MAX_JSON_DEPTH = 12
_MAX_JSON_NODES = 512
_MAX_JSON_CONTAINER_ITEMS = 128


def _bounded_json_shape(value: object) -> bool:
    """Validate attacker-controlled JSON iteratively before semantic traversal."""
    stack: list[tuple[object, int]] = [(value, 0)]
    visited = 0
    while stack:
        item, depth = stack.pop()
        visited += 1
        if visited > _MAX_JSON_NODES or depth > _MAX_JSON_DEPTH:
            return False
        if item is None or isinstance(item, (bool, int, float, str)):
            continue
        if isinstance(item, dict):
            if len(item) > _MAX_JSON_CONTAINER_ITEMS or not all(isinstance(key, str) for key in item):
                return False
            stack.extend((nested, depth + 1) for nested in item.values())
            continue
        if isinstance(item, list):
            if len(item) > _MAX_JSON_CONTAINER_ITEMS:
                return False
            stack.extend((nested, depth + 1) for nested in item)
            continue
        return False
    return True


def _canonical_uuid4(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parsed = UUID(value)
    except (AttributeError, ValueError):
        return False
    return parsed.version == 4 and str(parsed) == value


def is_asset_governed_kind(value: object) -> bool:
    return isinstance(value, str) and value in {
        ASSET_CREATE_KIND,
        ASSET_EDIT_KIND,
        ASSET_ARCHIVE_KIND,
        *ASSET_RELATIONSHIP_KINDS,
    }


def _valid_impact_block(value: object) -> bool:
    return bool(
        isinstance(value, dict)
        and set(value) == {"cif", "resulting_criticality"}
        and value.get("cif") in {"yes", "no"}
        and value.get("resulting_criticality") in {None, "low", "medium", "high", "critical"}
    )


def _valid_single_asset_impact(
    impacts: Sequence[object],
    *,
    resource_id: object,
    resource_name: object,
    base_version: object,
) -> bool:
    return bool(
        len(impacts) == 1
        and isinstance(item := impacts[0], dict)
        and set(item)
        == {
            "resource_type",
            "resource_id",
            "resource_name",
            "base_governance_version",
        }
        and item.get("resource_type") == "asset"
        and item.get("resource_id") == resource_id
        and item.get("resource_name") == resource_name
        and item.get("base_governance_version") == base_version
    )


def _valid_vendor_composite_impacts(
    *,
    proposal: GovernedMutationProposal,
) -> bool:
    impacts = proposal.impacted_resources_snapshot
    derived = proposal.derived_impact_snapshot
    if not isinstance(impacts, list) or not isinstance(derived, dict):
        return False
    asset_impacts = [item for item in impacts if isinstance(item, dict) and item.get("resource_type") == "asset"]
    vendor_impacts = [item for item in impacts if isinstance(item, dict) and item.get("resource_type") == "vendor"]
    vendor_rows = derived.get("vendors")
    asset_rows = derived.get("assets")
    # JSON-sourced ids; int-ness is enforced by the strict checks below.
    vendor_ids: list[Any] = [item.get("resource_id") for item in vendor_impacts]
    return bool(
        len(asset_impacts) == 1
        and asset_impacts[0].get("resource_id") == proposal.primary_resource_id
        and asset_impacts[0].get("resource_name") == proposal.primary_resource_name
        and asset_impacts[0].get("base_governance_version") == proposal.base_versions.get("asset")
        and impacts == [*asset_impacts, *vendor_impacts]
        and vendor_impacts
        and vendor_ids == sorted(set(vendor_ids))
        and all(
            set(item)
            == {"resource_type", "resource_id", "resource_name", "base_governance_version"}
            and type(item.get("resource_id")) is int
            and item["resource_id"] > 0
            and isinstance(item.get("resource_name"), str)
            and bool(item["resource_name"].strip())
            and type(item.get("base_governance_version")) is int
            and item["base_governance_version"] > 0
            and proposal.base_versions.get(f"vendor:{item['resource_id']}")
            == item["base_governance_version"]
            for item in vendor_impacts
        )
        and proposal.base_versions
        == {
            "asset": asset_impacts[0]["base_governance_version"],
            **{
                f"vendor:{item['resource_id']}": item["base_governance_version"]
                for item in vendor_impacts
            },
        }
        and set(derived) == {"assets", "vendors"}
        and isinstance(asset_rows, list)
        and len(asset_rows) == 1
        and isinstance(asset_rows[0], dict)
        and set(asset_rows[0]) == {"resource_id", "before", "after"}
        and asset_rows[0].get("resource_id") == proposal.primary_resource_id
        and _valid_impact_block(asset_rows[0].get("before"))
        and _valid_impact_block(asset_rows[0].get("after"))
        and isinstance(vendor_rows, list)
        and len(vendor_rows) == len(vendor_impacts)
        and all(
            isinstance(row, dict)
            and set(row) == {"resource_id", "before", "after"}
            and row.get("resource_id") == impact.get("resource_id")
            and all(
                isinstance(block, dict)
                and set(block) == {"tier"}
                and block.get("tier") in {"critical", "significant", "standard"}
                for block in (row.get("before"), row.get("after"))
            )
            for row, impact in zip(vendor_rows, vendor_impacts, strict=True)
        )
    )


def valid_asset_governed_envelope(
    proposal: GovernedMutationProposal | None,
) -> bool:
    """Fail closed unless the immutable Asset proposal and approval agree."""
    if proposal is None or not is_asset_governed_kind(proposal.mutation_kind):
        return False
    approval = proposal.approval_request
    scenario = proposal.scenario_snapshot
    json_values = (
        proposal.before_snapshot,
        proposal.after_snapshot,
        proposal.base_versions,
        proposal.proposed_changes,
        proposal.derived_impact_snapshot,
        proposal.impacted_resources_snapshot,
        scenario,
        approval.pending_changes if approval is not None else None,
        approval.scenario_approver_roles if approval is not None else None,
    )
    if approval is None or not all(_bounded_json_shape(value) for value in json_values):
        return False
    if not (
        isinstance(proposal.before_snapshot, dict)
        and isinstance(proposal.after_snapshot, dict)
        and isinstance(proposal.base_versions, dict)
        and isinstance(proposal.proposed_changes, dict)
        and isinstance(proposal.derived_impact_snapshot, dict)
        and isinstance(proposal.impacted_resources_snapshot, list)
    ):
        return False
    roles = scenario.get("approver_roles") if isinstance(scenario, dict) else None
    raw_triggered_scenarios = (
        proposal.proposed_changes.get("triggered_scenarios")
        if isinstance(proposal.proposed_changes, dict)
        else None
    )
    has_trigger_metadata = raw_triggered_scenarios is not None
    if raw_triggered_scenarios is None:
        triggered_scenarios = [ASSET_SCENARIO_KEY]
    elif isinstance(raw_triggered_scenarios, list):
        triggered_scenarios = raw_triggered_scenarios
    else:
        return False
    allowed_scenarios = {
        ASSET_SCENARIO_KEY,
        VENDOR_SCENARIO_KEY,
        ACCOUNTABILITY_SCENARIO_KEY,
    }
    if not (
        triggered_scenarios
        and all(isinstance(key, str) for key in triggered_scenarios)
        and len(triggered_scenarios) == len(set(triggered_scenarios))
        and set(triggered_scenarios).issubset(allowed_scenarios)
    ):
        return False
    vendor_triggered = VENDOR_SCENARIO_KEY in triggered_scenarios
    accountability_triggered = (
        ACCOUNTABILITY_SCENARIO_KEY in triggered_scenarios
    )
    if not (
        isinstance(roles, list)
        and bool(roles)
        and all(isinstance(role, str) for role in roles)
        and len(roles) == len(set(roles))
        and set(roles).issubset({"risk_manager", "cro"})
    ):
        return False
    if has_trigger_metadata:
        try:
            strict_triggered_policy_snapshots(
                scenario.get("triggered_policies")
                if isinstance(scenario, dict)
                else None,
                scenario_keys=triggered_scenarios,
                effective_roles=roles,
            )
        except ValueError:
            return False
    expected_action = {
        ASSET_CREATE_KIND: ApprovalActionType.CREATE,
        ASSET_EDIT_KIND: ApprovalActionType.EDIT,
        ASSET_ARCHIVE_KIND: ApprovalActionType.DELETE,
    }.get(proposal.mutation_kind, ApprovalActionType.EDIT)
    create = proposal.mutation_kind == ASSET_CREATE_KIND
    expected_pending = (
        {field: {"old": None, "new": proposal.after_snapshot[field]} for field in sorted(proposal.after_snapshot)}
        if create
        else {
            field: {
                "old": proposal.before_snapshot.get(field),
                "new": proposal.after_snapshot.get(field),
            }
            for field in sorted(set(proposal.before_snapshot) | set(proposal.after_snapshot))
            if proposal.before_snapshot.get(field) != proposal.after_snapshot.get(field)
        }
    )
    relationship = proposal.mutation_kind in ASSET_RELATIONSHIP_KINDS
    relationship_valid = True
    if relationship:
        operation = proposal.proposed_changes.get("operation") if isinstance(proposal.proposed_changes, dict) else None
        relationship_type, action = proposal.mutation_kind.removeprefix(ASSET_RELATIONSHIP_PREFIX).split(".")
        expected_operation_keys = {"relationship_type", "action", "before", "after"}
        if relationship_type == "risk":
            expected_operation_keys.add("related_resource_id")
        if isinstance(operation, dict):
            values = operation.get("after") if action == "add" else operation.get("before")
            empty_side = operation.get("before") if action == "add" else operation.get("after")
        else:
            values = None
            empty_side = object()
        impacts = proposal.impacted_resources_snapshot
        asset_impacts = [
            item
            for item in impacts
            if isinstance(item, dict) and item.get("resource_type") == "asset"
        ]
        vendor_impacts = [
            item
            for item in impacts
            if isinstance(item, dict) and item.get("resource_type") == "vendor"
        ]
        # JSON-sourced ids; int-ness is enforced by the strict checks below.
        impact_ids: list[Any] = [item.get("resource_id") for item in asset_impacts]
        derived_assets = proposal.derived_impact_snapshot.get("assets")
        derived_vendors = proposal.derived_impact_snapshot.get("vendors", [])
        relationship_valid = bool(
            isinstance(operation, dict)
            and set(proposal.proposed_changes)
            == (
                {"operation", "triggered_scenarios"}
                if vendor_triggered
                else {"operation"}
            )
            and (
                not vendor_triggered
                or triggered_scenarios
                in (
                    [ASSET_SCENARIO_KEY, VENDOR_SCENARIO_KEY],
                    [VENDOR_SCENARIO_KEY],
                )
            )
            and set(operation) == expected_operation_keys
            and (
                "related_resource_id" not in operation
                or (
                    type(operation["related_resource_id"]) is int
                    and operation["related_resource_id"] > 0
                )
            )
            and operation.get("relationship_type") == relationship_type
            and operation.get("action") == action
            and isinstance(values, dict)
            and empty_side is None
            and proposal.before_snapshot == {"relationship": operation.get("before")}
            and proposal.after_snapshot == {"relationship": operation.get("after")}
            and isinstance(impacts, list)
            and impacts
            and all(
                isinstance(item, dict)
                and set(item) == {"resource_type", "resource_id", "resource_name", "base_governance_version"}
                and item.get("resource_type") in {"asset", "vendor"}
                and type(item.get("resource_id")) is int
                and item["resource_id"] > 0
                and type(item.get("base_governance_version")) is int
                and item["base_governance_version"] > 0
                and isinstance(item.get("resource_name"), str)
                and bool(item["resource_name"].strip())
                for item in impacts
            )
            and impact_ids == sorted(set(impact_ids))
            and proposal.primary_resource_id in impact_ids
            and proposal.base_versions
            == {
                f"{item['resource_type']}:{item['resource_id']}": item["base_governance_version"]
                for item in impacts
            }
            and set(proposal.derived_impact_snapshot)
            == ({"assets", "vendors"} if vendor_triggered else {"assets"})
            and isinstance(derived_assets, list)
            and [item.get("resource_id") for item in derived_assets if isinstance(item, dict)] == impact_ids
            and all(
                isinstance(item, dict)
                and set(item) == {"resource_id", "before", "after"}
                and all(_valid_impact_block(block) for block in (item.get("before"), item.get("after")))
                for item in derived_assets
            )
            and (
                not vendor_triggered
                or (
                    vendor_impacts
                    and isinstance(derived_vendors, list)
                    and len(derived_vendors) == len(vendor_impacts)
                    and all(
                        isinstance(row, dict)
                        and set(row) == {"resource_id", "before", "after"}
                        and row.get("resource_id") == impact.get("resource_id")
                        and all(
                            isinstance(block, dict)
                            and set(block) == {"tier"}
                            and block.get("tier") in {"critical", "significant", "standard"}
                            for block in (row.get("before"), row.get("after"))
                        )
                        for row, impact in zip(
                            derived_vendors,
                            vendor_impacts,
                            strict=True,
                        )
                    )
                )
            )
        )
    action_valid = relationship_valid
    if create:
        action_valid = bool(
            set(proposal.proposed_changes) == {"after"}
            and isinstance(proposal.proposed_changes.get("after"), dict)
            and proposal.before_snapshot == {}
            and proposal.impacted_resources_snapshot == []
            and set(proposal.derived_impact_snapshot) == {"before", "after"}
            and proposal.derived_impact_snapshot.get("before") is None
            and _valid_impact_block(proposal.derived_impact_snapshot.get("after"))
        )
    elif proposal.mutation_kind == ASSET_EDIT_KIND:
        raw_before = proposal.proposed_changes.get("before")
        raw_after = proposal.proposed_changes.get("after")
        version = proposal.base_versions.get("asset")
        action_valid = bool(
            set(proposal.proposed_changes)
            == (
                {"before", "after", "triggered_scenarios"}
                if has_trigger_metadata
                else {"before", "after"}
            )
            and isinstance(raw_before, dict)
            and isinstance(raw_after, dict)
            and bool(raw_after)
            and set(raw_before) == set(raw_after)
            and (
                _valid_vendor_composite_impacts(
                    proposal=proposal,
                )
                if vendor_triggered
                else (
                    _valid_single_asset_impact(
                        proposal.impacted_resources_snapshot,
                        resource_id=proposal.primary_resource_id,
                        resource_name=proposal.primary_resource_name,
                        base_version=version,
                    )
                    and set(proposal.derived_impact_snapshot) == {"before", "after"}
                    and _valid_impact_block(proposal.derived_impact_snapshot.get("before"))
                    and _valid_impact_block(proposal.derived_impact_snapshot.get("after"))
                )
            )
        )
    elif proposal.mutation_kind == ASSET_ARCHIVE_KIND:
        version = proposal.base_versions.get("asset")
        action_valid = bool(
            proposal.before_snapshot == {"is_archived": False}
            and proposal.after_snapshot == {"is_archived": True}
            and proposal.proposed_changes
            == {
                "before": {"is_archived": False},
                "after": {"is_archived": True},
                **(
                    {"triggered_scenarios": triggered_scenarios}
                    if has_trigger_metadata
                    else {}
                ),
            }
            and (
                _valid_vendor_composite_impacts(proposal=proposal)
                if vendor_triggered
                else (
                    _valid_single_asset_impact(
                        proposal.impacted_resources_snapshot,
                        resource_id=proposal.primary_resource_id,
                        resource_name=proposal.primary_resource_name,
                        base_version=version,
                    )
                    and set(proposal.derived_impact_snapshot) == {"before", "after"}
                    and _valid_impact_block(proposal.derived_impact_snapshot.get("before"))
                    and proposal.derived_impact_snapshot.get("after")
                    == proposal.derived_impact_snapshot.get("before")
                )
            )
        )
    return bool(
        _canonical_uuid4(proposal.proposal_id)
        and proposal.primary_resource_type == "asset"
        and proposal.proposal_version == 1
        and proposal.schema_version == 1
        and isinstance(scenario, dict)
        and set(scenario)
        == (
            {"key", "requires_approval", "approver_roles", "triggered_policies"}
            if has_trigger_metadata
            else {"key", "requires_approval", "approver_roles"}
        )
        and scenario.get("key")
        == (
            triggered_scenarios[0]
            if has_trigger_metadata
            else ASSET_SCENARIO_KEY
        )
        and scenario.get("requires_approval") is True
        and scenario.get("approver_roles") == roles
        and (
            not has_trigger_metadata
            or (
                isinstance(scenario.get("triggered_policies"), list)
                and [item.get("key") for item in scenario["triggered_policies"]]
                == triggered_scenarios
            )
        )
        and approval.resource_type == ApprovalResourceType.ASSET
        and approval.action_type == expected_action
        and approval.resource_id == proposal.primary_resource_id
        and approval.resource_name == proposal.primary_resource_name
        and approval.requested_by_id == proposal.requested_by_id
        and approval.scenario_key == scenario["key"]
        and approval.scenario_approver_roles == scenario["approver_roles"]
        and approval.pending_changes == expected_pending
        and action_valid
        and (
            (create and proposal.primary_resource_id is None and proposal.base_versions == {})
            or (
                relationship
                and type(proposal.primary_resource_id) is int
                and proposal.primary_resource_id > 0
                and bool(proposal.base_versions)
                and all(type(value) is int and value > 0 for value in proposal.base_versions.values())
            )
            or (
                not create
                and type(proposal.primary_resource_id) is int
                and proposal.primary_resource_id > 0
                and (
                    vendor_triggered
                    or proposal.base_versions == {"asset": proposal.base_versions.get("asset")}
                )
                and type(proposal.base_versions.get("asset")) is int
                and proposal.base_versions["asset"] > 0
            )
        )
        and relationship_valid
        and (
            not accountability_triggered
            or (
                proposal.mutation_kind == ASSET_EDIT_KIND
                and bool(
                    set(proposal.proposed_changes.get("after", {}))
                    & {
                        "business_owner_user_id",
                        "ict_owner_user_id",
                        "owning_department_id",
                    }
                )
                and bool(proposal.proposed_changes.get("after"))
                and (
                    ASSET_SCENARIO_KEY in triggered_scenarios
                    or set(proposal.proposed_changes.get("after", {})).issubset(
                        {
                            "business_owner_user_id",
                            "ict_owner_user_id",
                            "owning_department_id",
                        }
                    )
                )
            )
        )
    )


async def valid_asset_approval_ids(
    db: AsyncSession,
    *,
    approval_statuses: Collection[ApprovalStatus] | None = None,
    approval_ids: Collection[int] | None = None,
) -> frozenset[int]:
    statement = (
        select(GovernedMutationProposal)
        .join(ApprovalRequest, ApprovalRequest.id == GovernedMutationProposal.approval_request_id)
        .options(selectinload(GovernedMutationProposal.approval_request))
        .where(
            GovernedMutationProposal.primary_resource_type == "asset",
            or_(
                GovernedMutationProposal.mutation_kind.in_((ASSET_CREATE_KIND, ASSET_EDIT_KIND, ASSET_ARCHIVE_KIND)),
                GovernedMutationProposal.mutation_kind.like(f"{ASSET_RELATIONSHIP_PREFIX}%"),
            ),
        )
    )
    if approval_statuses is not None:
        statement = statement.where(ApprovalRequest.status.in_(tuple(approval_statuses)))
    if approval_ids is not None:
        if not approval_ids:
            return frozenset()
        statement = statement.where(ApprovalRequest.id.in_(tuple(approval_ids)))
    proposals = (await db.execute(statement)).scalars().all()
    return frozenset(proposal.approval_request_id for proposal in proposals if valid_asset_governed_envelope(proposal))


async def live_asset_resolver_approval_ids(
    db: AsyncSession,
    *,
    current_user,
    approval_statuses: Collection[ApprovalStatus] | None = None,
    approval_ids: Collection[int] | None = None,
) -> frozenset[int]:
    """Return strict Asset approvals authorized by the shared live predicate."""
    from .fixed_asset_policy import (
        is_live_eligible_asset_resolver,
        load_fixed_asset_scenario,
    )

    if approval_ids is not None and not approval_ids:
        return frozenset()
    scenario = await load_fixed_asset_scenario(db)
    statement = (
        select(GovernedMutationProposal)
        .join(ApprovalRequest, ApprovalRequest.id == GovernedMutationProposal.approval_request_id)
        .options(selectinload(GovernedMutationProposal.approval_request))
        .where(GovernedMutationProposal.primary_resource_type == "asset")
    )
    if approval_statuses is not None:
        statement = statement.where(ApprovalRequest.status.in_(tuple(approval_statuses)))
    if approval_ids is not None:
        statement = statement.where(ApprovalRequest.id.in_(tuple(approval_ids)))
    proposals = (await db.execute(statement)).scalars().all()
    return frozenset(
        proposal.approval_request_id
        for proposal in proposals
        if valid_asset_governed_envelope(proposal) and is_live_eligible_asset_resolver(current_user, proposal, scenario)
    )


__all__ = [
    "ASSET_ARCHIVE_KIND",
    "ASSET_CREATE_KIND",
    "ASSET_EDIT_KIND",
    "ASSET_RELATIONSHIP_PREFIX",
    "is_asset_governed_kind",
    "live_asset_resolver_approval_ids",
    "valid_asset_approval_ids",
    "valid_asset_governed_envelope",
]
