"""Fixed mutation-kind identity for governed Vendor proposals."""

from __future__ import annotations

from uuid import UUID

from app.models import (
    ApprovalActionType,
    ApprovalResourceType,
    ApprovalStatus,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
)

from .composite_policy import strict_triggered_policy_snapshots
from .fixed_accountability_policy import ACCOUNTABILITY_SCENARIO_KEY
from .fixed_vendor_policy import VENDOR_SCENARIO_KEY

VENDOR_CREATE_KIND = "vendor.create"
VENDOR_EDIT_KIND = "vendor.edit"
VENDOR_ARCHIVE_KIND = "vendor.archive"
VENDOR_RELATIONSHIP_PREFIX = "vendor.link."
VENDOR_RELATIONSHIP_KINDS = frozenset(
    f"{VENDOR_RELATIONSHIP_PREFIX}{resource}.{action}"
    for resource in ("risk", "control", "kri")
    for action in ("add", "remove")
)
VENDOR_CHILD_KINDS = frozenset(
    f"vendor.{resource}.{action}"
    for resource in ("contract", "sub_outsourcing")
    for action in ("create", "edit", "archive")
)
_ALLOWED_TIERS = frozenset({"critical", "significant", "standard"})
_REFERENCE_SNAPSHOT_FIELDS = {
    "outsourcing_owner_user_id": "outsourcing_owner",
    "department_id": "owning_department",
}


def _canonical_uuid4(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parsed = UUID(value)
    except (AttributeError, ValueError):
        return False
    return parsed.version == 4 and str(parsed) == value


def _positive_int(value: object) -> bool:
    return type(value) is int and value > 0


def _valid_impact_block(value: object) -> bool:
    return bool(
        isinstance(value, dict)
        and set(value) == {"tier"}
        and value.get("tier") in _ALLOWED_TIERS
    )


def _expected_action(mutation_kind: str) -> ApprovalActionType:
    return {
        VENDOR_CREATE_KIND: ApprovalActionType.CREATE,
        VENDOR_ARCHIVE_KIND: ApprovalActionType.DELETE,
    }.get(mutation_kind, ApprovalActionType.EDIT)


def _expected_pending(proposal: GovernedMutationProposal) -> dict[str, object]:
    if proposal.mutation_kind == VENDOR_CREATE_KIND:
        return {
            field: {"old": None, "new": proposal.after_snapshot[field]}
            for field in sorted(proposal.after_snapshot)
        }
    return {
        field: {
            "old": proposal.before_snapshot.get(field),
            "new": proposal.after_snapshot.get(field),
        }
        for field in sorted(set(proposal.before_snapshot) | set(proposal.after_snapshot))
        if proposal.before_snapshot.get(field) != proposal.after_snapshot.get(field)
    }


def _raw_values_match_safe_snapshot(
    raw: object,
    safe: object,
) -> bool:
    if not isinstance(raw, dict) or not isinstance(safe, dict):
        return False
    expected_safe_fields = {
        _REFERENCE_SNAPSHOT_FIELDS.get(field, field) for field in raw
    }
    if set(safe) != expected_safe_fields:
        return False
    return all(
        field in _REFERENCE_SNAPSHOT_FIELDS
        or safe.get(field) == value
        for field, value in raw.items()
    )


def _valid_existing_vendor_impact(proposal: GovernedMutationProposal) -> bool:
    impacts = proposal.impacted_resources_snapshot
    return bool(
        len(impacts) == 1
        and isinstance(impact := impacts[0], dict)
        and set(impact)
        == {
            "resource_type",
            "resource_id",
            "resource_name",
            "base_governance_version",
        }
        and impact.get("resource_type") == "vendor"
        and impact.get("resource_id") == proposal.primary_resource_id
        and impact.get("resource_name") == proposal.primary_resource_name
        and impact.get("base_governance_version")
        == proposal.base_versions.get("vendor")
    )


def _valid_action_payload(proposal: GovernedMutationProposal) -> bool:
    kind = proposal.mutation_kind
    create = kind == VENDOR_CREATE_KIND
    existing = not create
    if not (
        (create and proposal.primary_resource_id is None and proposal.base_versions == {})
        or (
            existing
            and _positive_int(proposal.primary_resource_id)
            and proposal.base_versions
            == {"vendor": proposal.base_versions.get("vendor")}
            and _positive_int(proposal.base_versions.get("vendor"))
            and _valid_existing_vendor_impact(proposal)
        )
    ):
        return False
    if not (
        set(proposal.derived_impact_snapshot) == {"before", "after"}
        and (
            proposal.derived_impact_snapshot.get("before") is None
            if create
            else _valid_impact_block(proposal.derived_impact_snapshot.get("before"))
        )
        and _valid_impact_block(proposal.derived_impact_snapshot.get("after"))
    ):
        return False
    if create:
        raw_after = proposal.proposed_changes.get("after")
        return bool(
            proposal.before_snapshot == {}
            and proposal.impacted_resources_snapshot == []
            and set(proposal.proposed_changes) == {"after"}
            and isinstance(raw_after, dict)
            and bool(proposal.after_snapshot)
            and _raw_values_match_safe_snapshot(raw_after, proposal.after_snapshot)
        )
    if kind == VENDOR_EDIT_KIND:
        raw_before = proposal.proposed_changes.get("before")
        raw_after = proposal.proposed_changes.get("after")
        return bool(
            set(proposal.proposed_changes) == {"before", "after"}
            and isinstance(raw_before, dict)
            and isinstance(raw_after, dict)
            and bool(raw_after)
            and set(raw_before) == set(raw_after)
            and bool(proposal.before_snapshot)
            and set(proposal.before_snapshot) == set(proposal.after_snapshot)
            and _raw_values_match_safe_snapshot(
                raw_before,
                proposal.before_snapshot,
            )
            and _raw_values_match_safe_snapshot(
                raw_after,
                proposal.after_snapshot,
            )
        )
    if kind == VENDOR_ARCHIVE_KIND:
        return bool(
            proposal.before_snapshot == {"is_archived": False}
            and proposal.after_snapshot == {"is_archived": True}
            and proposal.proposed_changes
            == {
                "before": {"is_archived": False},
                "after": {"is_archived": True},
            }
            and proposal.derived_impact_snapshot.get("after")
            == proposal.derived_impact_snapshot.get("before")
        )
    if kind in VENDOR_RELATIONSHIP_KINDS:
        operation = proposal.proposed_changes.get("operation")
        _, _, resource, action = kind.split(".")
        key = f"linked_{resource}"
        adding = action == "add"
        return bool(
            set(proposal.proposed_changes) == {"operation"}
            and isinstance(operation, dict)
            and set(operation) == {"entity_id", "entity_name"}
            and _positive_int(operation.get("entity_id"))
            and isinstance(operation.get("entity_name"), str)
            and bool(operation["entity_name"].strip())
            and proposal.before_snapshot
            == {
                key: not adding,
                "relationship_target": (
                    None if adding else operation["entity_name"]
                ),
            }
            and proposal.after_snapshot
            == {
                key: adding,
                "relationship_target": (
                    operation["entity_name"] if adding else None
                ),
            }
            and proposal.derived_impact_snapshot.get("after")
            == proposal.derived_impact_snapshot.get("before")
        )
    if kind in VENDOR_CHILD_KINDS:
        operation = proposal.proposed_changes.get("operation")
        if not (
            set(proposal.proposed_changes) == {"operation"}
            and isinstance(operation, dict)
            and set(operation) == {"child_id", "before", "after"}
            and proposal.before_snapshot
            == {"child_mutation": operation.get("before")}
            and proposal.after_snapshot
            == {"child_mutation": operation.get("after")}
            and proposal.derived_impact_snapshot.get("after")
            == proposal.derived_impact_snapshot.get("before")
        ):
            return False
        action = kind.rsplit(".", 1)[1]
        child_id = operation.get("child_id")
        before = operation.get("before")
        after = operation.get("after")
        return bool(
            (
                action == "create"
                and child_id is None
                and before is None
                and isinstance(after, dict)
                and bool(after)
            )
            or (
                action == "edit"
                and _positive_int(child_id)
                and isinstance(before, dict)
                and isinstance(after, dict)
                and bool(after)
            )
            or (
                action == "archive"
                and _positive_int(child_id)
                and before == {"is_archived": False}
                and after == {"is_archived": True}
            )
        )
    return False


def vendor_triggered_scenarios(
    proposal: GovernedMutationProposal,
) -> tuple[str, ...]:
    """Return the validated policy-key order, or an empty tuple when malformed."""
    scenario = proposal.scenario_snapshot
    if not isinstance(scenario, dict):
        return ()
    roles = scenario.get("approver_roles")
    if not (
        isinstance(roles, list)
        and roles
        and all(isinstance(role, str) for role in roles)
        and len(roles) == len(set(roles))
        and set(roles).issubset({"risk_manager", "cro"})
    ):
        return ()
    if set(scenario) == {"key", "requires_approval", "approver_roles"}:
        return (
            (VENDOR_SCENARIO_KEY,)
            if scenario.get("key") == VENDOR_SCENARIO_KEY
            and scenario.get("requires_approval") is True
            else ()
        )
    if set(scenario) != {
        "key",
        "requires_approval",
        "approver_roles",
        "triggered_policies",
    }:
        return ()
    policies = scenario.get("triggered_policies")
    if not isinstance(policies, list):
        return ()
    keys = tuple(
        policy.get("key")
        for policy in policies
        if isinstance(policy, dict) and isinstance(policy.get("key"), str)
    )
    if (
        not keys
        or len(keys) != len(policies)
        or len(keys) != len(set(keys))
        or not set(keys).issubset(
            {VENDOR_SCENARIO_KEY, ACCOUNTABILITY_SCENARIO_KEY}
        )
        or keys[0] != scenario.get("key")
        or scenario.get("requires_approval") is not True
    ):
        return ()
    try:
        strict_triggered_policy_snapshots(
            policies,
            scenario_keys=keys,
            effective_roles=roles,
        )
    except ValueError:
        return ()
    return keys


def _valid_accountability_payload(
    proposal: GovernedMutationProposal,
    scenario_keys: tuple[str, ...],
) -> bool:
    if ACCOUNTABILITY_SCENARIO_KEY not in scenario_keys:
        return True
    raw_before = proposal.proposed_changes.get("before")
    raw_after = proposal.proposed_changes.get("after")
    if not (
        proposal.mutation_kind == VENDOR_EDIT_KIND
        and isinstance(raw_before, dict)
        and isinstance(raw_after, dict)
        and "outsourcing_owner_user_id" in raw_before
        and set(raw_before) == set(raw_after)
        and _positive_int(raw_before["outsourcing_owner_user_id"])
        and _positive_int(raw_after["outsourcing_owner_user_id"])
        and raw_before["outsourcing_owner_user_id"]
        != raw_after["outsourcing_owner_user_id"]
    ):
        return False
    return bool(
        VENDOR_SCENARIO_KEY in scenario_keys
        or set(raw_after) == {"outsourcing_owner_user_id"}
    )


def strict_vendor_mutation_kind(
    proposal: GovernedMutationProposal | None,
) -> str | None:
    """Classify only immutable Vendor proposal/approval identities that agree."""
    if proposal is None or not is_vendor_governed_kind(proposal.mutation_kind):
        return None
    approval = proposal.approval_request
    scenario = proposal.scenario_snapshot
    scenario_keys = vendor_triggered_scenarios(proposal)
    if not (
        approval is not None
        and _canonical_uuid4(proposal.proposal_id)
        and proposal.proposal_version == 1
        and proposal.schema_version == 1
        and proposal.primary_resource_type == "vendor"
        and isinstance(proposal.primary_resource_name, str)
        and bool(proposal.primary_resource_name.strip())
        and isinstance(proposal.before_snapshot, dict)
        and isinstance(proposal.after_snapshot, dict)
        and isinstance(proposal.base_versions, dict)
        and isinstance(proposal.proposed_changes, dict)
        and isinstance(proposal.derived_impact_snapshot, dict)
        and isinstance(proposal.impacted_resources_snapshot, list)
        and isinstance(scenario, dict)
        and scenario_keys
        and approval.resource_type == ApprovalResourceType.VENDOR
        and approval.resource_id == proposal.primary_resource_id
        and approval.resource_name == proposal.primary_resource_name
        and approval.action_type == _expected_action(proposal.mutation_kind)
        and approval.requested_by_id == proposal.requested_by_id
        and approval.scenario_key == scenario["key"]
        and approval.scenario_approver_roles == scenario["approver_roles"]
        and approval.pending_changes == _expected_pending(proposal)
        and _valid_action_payload(proposal)
        and _valid_accountability_payload(proposal, scenario_keys)
    ):
        return None
    return proposal.mutation_kind


def valid_vendor_governed_envelope(
    proposal: GovernedMutationProposal | None,
    impact_locks: list[GovernedMutationImpactLock],
) -> bool:
    """Fail closed unless a pending Vendor identity has exact active locks."""
    if strict_vendor_mutation_kind(proposal) is None:
        return False
    assert proposal is not None
    approval = proposal.approval_request
    if approval is None or approval.status != ApprovalStatus.PENDING:
        return False
    expected_locks = {
        (
            impact["resource_type"],
            impact["resource_id"],
            impact["base_governance_version"],
        )
        for impact in proposal.impacted_resources_snapshot
    }
    orphan_locks = [
        lock for lock in impact_locks if lock.resource_type == "orphaned_item"
    ]
    resource_locks = [
        lock for lock in impact_locks if lock.resource_type != "orphaned_item"
    ]
    actual_locks = {
        (lock.resource_type, lock.resource_id, lock.base_governance_version)
        for lock in resource_locks
    }
    raw_before = proposal.proposed_changes.get("before")
    orphan_lock_valid = not orphan_locks or bool(
        len(orphan_locks) == 1
        and orphan_locks[0].resource_id > 0
        and isinstance(raw_before, dict)
        and orphan_locks[0].base_governance_version
        == raw_before.get("outsourcing_owner_user_id")
    )
    return bool(
        actual_locks == expected_locks
        and len(resource_locks) == len(expected_locks)
        and orphan_lock_valid
        and all(
            lock.proposal_id == proposal.id
            and lock.released_at is None
            and lock.release_reason is None
            for lock in impact_locks
        )
    )


def is_vendor_governed_kind(value: object) -> bool:
    return isinstance(value, str) and value in {
        VENDOR_CREATE_KIND,
        VENDOR_EDIT_KIND,
        VENDOR_ARCHIVE_KIND,
        *VENDOR_CHILD_KINDS,
        *VENDOR_RELATIONSHIP_KINDS,
    }


__all__ = [
    "VENDOR_ARCHIVE_KIND",
    "VENDOR_CREATE_KIND",
    "VENDOR_EDIT_KIND",
    "VENDOR_CHILD_KINDS",
    "VENDOR_RELATIONSHIP_KINDS",
    "VENDOR_RELATIONSHIP_PREFIX",
    "is_vendor_governed_kind",
    "strict_vendor_mutation_kind",
    "valid_vendor_governed_envelope",
    "vendor_triggered_scenarios",
]
