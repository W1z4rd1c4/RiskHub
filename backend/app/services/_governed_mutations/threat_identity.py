"""Strict immutable identity for Threat Steward accountability proposals."""

from __future__ import annotations

from uuid import UUID

from app.models import (
    ApprovalActionType,
    ApprovalResourceType,
    ApprovalStatus,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
)

from .fixed_accountability_policy import ACCOUNTABILITY_SCENARIO_KEY

THREAT_EDIT_KIND = "threat.edit"
_SAFE_FIELD = "threat_steward"
_RAW_FIELD = "threat_steward_user_id"


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


def strict_threat_mutation_kind(
    proposal: GovernedMutationProposal | None,
) -> str | None:
    if proposal is None or proposal.mutation_kind != THREAT_EDIT_KIND:
        return None
    approval = proposal.approval_request
    scenario = proposal.scenario_snapshot
    raw_before = proposal.proposed_changes.get("before")
    raw_after = proposal.proposed_changes.get("after")
    impact = (
        proposal.impacted_resources_snapshot[0]
        if len(proposal.impacted_resources_snapshot) == 1
        else None
    )
    expected_pending = {
        _SAFE_FIELD: {
            "old": proposal.before_snapshot.get(_SAFE_FIELD),
            "new": proposal.after_snapshot.get(_SAFE_FIELD),
        }
    }
    if not (
        approval is not None
        and _canonical_uuid4(proposal.proposal_id)
        and proposal.proposal_version == 1
        and proposal.schema_version == 1
        and proposal.primary_resource_type == "threat"
        and _positive_int(proposal.primary_resource_id)
        and isinstance(proposal.primary_resource_name, str)
        and bool(proposal.primary_resource_name.strip())
        and proposal.base_versions
        == {"threat": proposal.base_versions.get("threat")}
        and _positive_int(proposal.base_versions.get("threat"))
        and isinstance(scenario, dict)
        and set(scenario) == {"key", "requires_approval", "approver_roles"}
        and scenario.get("key") == ACCOUNTABILITY_SCENARIO_KEY
        and scenario.get("requires_approval") is True
        and isinstance(scenario.get("approver_roles"), list)
        and bool(scenario["approver_roles"])
        and set(proposal.before_snapshot) == {_SAFE_FIELD}
        and set(proposal.after_snapshot) == {_SAFE_FIELD}
        and proposal.before_snapshot[_SAFE_FIELD]
        != proposal.after_snapshot[_SAFE_FIELD]
        and set(proposal.proposed_changes) == {"before", "after"}
        and isinstance(raw_before, dict)
        and isinstance(raw_after, dict)
        and set(raw_before) == {_RAW_FIELD}
        and set(raw_after) == {_RAW_FIELD}
        and (
            raw_before[_RAW_FIELD] is None
            or _positive_int(raw_before[_RAW_FIELD])
        )
        and _positive_int(raw_after[_RAW_FIELD])
        and raw_before[_RAW_FIELD] != raw_after[_RAW_FIELD]
        and proposal.derived_impact_snapshot == {"before": {}, "after": {}}
        and isinstance(impact, dict)
        and set(impact)
        == {
            "resource_type",
            "resource_id",
            "resource_name",
            "base_governance_version",
        }
        and impact.get("resource_type") == "threat"
        and impact.get("resource_id") == proposal.primary_resource_id
        and impact.get("resource_name") == proposal.primary_resource_name
        and impact.get("base_governance_version")
        == proposal.base_versions["threat"]
        and approval.resource_type == ApprovalResourceType.THREAT
        and approval.resource_id == proposal.primary_resource_id
        and approval.resource_name == proposal.primary_resource_name
        and approval.action_type == ApprovalActionType.EDIT
        and approval.requested_by_id == proposal.requested_by_id
        and approval.scenario_key == scenario["key"]
        and approval.scenario_approver_roles == scenario["approver_roles"]
        and approval.pending_changes == expected_pending
    ):
        return None
    return THREAT_EDIT_KIND


def valid_threat_governed_envelope(
    proposal: GovernedMutationProposal | None,
    locks: list[GovernedMutationImpactLock],
) -> bool:
    if strict_threat_mutation_kind(proposal) is None:
        return False
    assert proposal is not None
    approval = proposal.approval_request
    impact = proposal.impacted_resources_snapshot[0]
    threat_locks = [lock for lock in locks if lock.resource_type == "threat"]
    orphan_locks = [
        lock for lock in locks if lock.resource_type == "orphaned_item"
    ]
    raw_before = proposal.proposed_changes.get("before")
    orphan_lock_valid = not orphan_locks or bool(
        len(orphan_locks) == 1
        and orphan_locks[0].resource_id > 0
        and isinstance(raw_before, dict)
        and orphan_locks[0].base_governance_version
        == raw_before.get(_RAW_FIELD)
    )
    return bool(
        approval is not None
        and approval.status == ApprovalStatus.PENDING
        and len(threat_locks) == 1
        and len(locks) == len(threat_locks) + len(orphan_locks)
        and orphan_lock_valid
        and threat_locks[0].proposal_id == proposal.id
        and threat_locks[0].resource_type == impact["resource_type"]
        and threat_locks[0].resource_id == impact["resource_id"]
        and threat_locks[0].base_governance_version
        == impact["base_governance_version"]
        and all(
            lock.proposal_id == proposal.id
            and lock.released_at is None
            and lock.release_reason is None
            for lock in locks
        )
    )


__all__ = [
    "THREAT_EDIT_KIND",
    "strict_threat_mutation_kind",
    "valid_threat_governed_envelope",
]
