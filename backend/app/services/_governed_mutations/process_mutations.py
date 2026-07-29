"""Governed Process creation, relationship, and archive intake (#85)."""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.approval_helpers import build_approval_queued_response
from app.core.audit import governed_mutation as audit_governed
from app.core.datetime_utils import coerce_utc
from app.core.exceptions import AuthorizationError, ConflictError, ValidationError
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Department,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Process,
    User,
)
from app.schemas.process import ProcessCreate
from app.services.outbox import OutboxService
from app.services.transaction_boundary import commit_service_boundary

from .composite_policy import (
    effective_triggered_policy_roles,
    strict_triggered_policy_snapshots,
    triggered_policy_snapshot,
)
from .fixed_asset_policy import (
    ASSET_SCENARIO_KEY,
    load_fixed_asset_scenario_for_update,
    validated_fixed_asset_roles,
)
from .fixed_policy import (
    SCENARIO_KEY,
    load_fixed_process_scenario_for_update,
    validated_fixed_process_roles,
)
from .process_identity import (
    PROCESS_DISPLAY_NAME_MAX_LENGTH,
    PROCESS_MUTATION_KIND,
    InvalidGovernedProcessIdentity,
    strict_governed_process_identity,
)
from .process_mutation_policy import (
    has_independent_process_approver,
    safe_process_department_label,
    safe_process_user_label,
)
from .process_relationships import validate_process_relationship_operation

PROCESS_CREATE_KIND = "process.create"
PROCESS_ARCHIVE_KIND = "process.archive"
PROCESS_RELATIONSHIP_PREFIX = "process.link."
SUPPORTED_PROCESS_RELATIONSHIP_KINDS = frozenset(
    {
        "process.link.risk.add",
        "process.link.risk.remove",
        "process.link.asset.add",
        "process.link.asset.update",
        "process.link.asset.remove",
        "process.link.vendor.add",
        "process.link.vendor.remove",
    }
)
SUPPORTED_EXTENDED_PROCESS_KINDS = frozenset(
    {
        PROCESS_CREATE_KIND,
        PROCESS_ARCHIVE_KIND,
        *SUPPORTED_PROCESS_RELATIONSHIP_KINDS,
    }
)
PROPOSAL_VERSION = 1
PROPOSAL_SCHEMA_VERSION = 1
_MAX_PROCESS_JSON_DEPTH = 12
_MAX_PROCESS_JSON_NODES = 512
_MAX_PROCESS_JSON_CONTAINER_ITEMS = 128
_MAX_PROCESS_JSON_STRING_LENGTH = 65_536


def _bounded_process_json_topology(*values: object) -> bool:
    """Iteratively bound persisted JSON before any semantic descent."""
    stack = [(value, 0) for value in values]
    visited = 0
    while stack:
        value, depth = stack.pop()
        visited += 1
        if visited > _MAX_PROCESS_JSON_NODES or depth > _MAX_PROCESS_JSON_DEPTH:
            return False
        if value is None or isinstance(value, (bool, int, float)):
            continue
        if isinstance(value, str):
            if len(value) > _MAX_PROCESS_JSON_STRING_LENGTH:
                return False
            continue
        if isinstance(value, dict):
            if len(value) > _MAX_PROCESS_JSON_CONTAINER_ITEMS or not all(
                isinstance(key, str) and len(key) <= _MAX_PROCESS_JSON_STRING_LENGTH for key in value
            ):
                return False
            stack.extend((nested, depth + 1) for nested in value.values())
            continue
        if isinstance(value, list):
            if len(value) > _MAX_PROCESS_JSON_CONTAINER_ITEMS:
                return False
            stack.extend((nested, depth + 1) for nested in value)
            continue
        return False
    return True


async def _derived_blocks(db: AsyncSession, process: Process):
    # Lazy boundary avoids projection -> proposal-identity import cycles.
    from app.services._ict_register_lifecycle.projection import (
        load_governed_process_derived_blocks,
    )

    return await load_governed_process_derived_blocks(db, process, updates={})


@dataclass(frozen=True, slots=True)
class ExtendedProcessMutationIdentity:
    approval_request_id: int
    requested_by_id: int
    approver_roles: tuple[str, ...]
    mutation_kind: str
    primary_resource_type: str
    primary_resource_id: int | None
    primary_resource_name: str
    action_type: ApprovalActionType
    base_versions: dict[str, int]
    pending_changes: dict[str, dict[str, Any]]
    scenario_key: str
    triggered_scenarios: tuple[str, ...]
    triggered_policy_snapshots: tuple[dict[str, Any], ...]


def _positive_int(value: object) -> int | None:
    return value if type(value) is int and value > 0 else None


def _canonical_process_impact_rows(
    rows: object,
    *,
    allowed_types: frozenset[str],
) -> bool:
    if not isinstance(rows, list) or not rows:
        return False
    identities: list[tuple[str, int]] = []
    for row in rows:
        if not (
            isinstance(row, dict)
            and set(row)
            == {
                "resource_type",
                "resource_id",
                "resource_name",
                "base_governance_version",
            }
            and row.get("resource_type") in allowed_types
            and (resource_id := _positive_int(row.get("resource_id"))) is not None
            and _positive_int(row.get("base_governance_version")) is not None
            and _canonical_display_label(row.get("resource_name"))
        ):
            return False
        identities.append((str(row["resource_type"]), resource_id))
    return identities == sorted(set(identities))


def _canonical_asset_derived_rows(
    rows: object,
    *,
    impact_rows: object,
    base_versions: object,
) -> bool:
    """Validate exact Asset derivation rows against canonical descriptors."""
    if not isinstance(rows, list) or not isinstance(impact_rows, list) or not isinstance(base_versions, dict):
        return False
    asset_impacts = [item for item in impact_rows if isinstance(item, dict) and item.get("resource_type") == "asset"]
    if len(rows) != len(asset_impacts):
        return False
    identities: list[int] = []
    for row, impact in zip(rows, asset_impacts, strict=True):
        resource_id = _positive_int(row.get("resource_id")) if isinstance(row, dict) else None
        if not (
            isinstance(row, dict)
            and set(row) == {"resource_id", "before", "after"}
            and resource_id is not None
            and _canonical_asset_derived_block(row.get("before"))
            and _canonical_asset_derived_block(row.get("after"))
            and impact.get("resource_type") == "asset"
            and impact.get("resource_id") == resource_id
            and _canonical_display_label(impact.get("resource_name"))
            and _positive_int(impact.get("base_governance_version")) is not None
            and base_versions.get(f"asset:{resource_id}") == impact.get("base_governance_version")
        ):
            return False
        identities.append(resource_id)
    return identities == sorted(set(identities))


def _canonical_uuid4(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parsed = UUID(value)
    except (AttributeError, ValueError):
        return False
    return parsed.version == 4 and str(parsed) == value


def is_extended_process_kind(kind: object) -> bool:
    return isinstance(kind, str) and kind in SUPPORTED_EXTENDED_PROCESS_KINDS


def _canonical_display_label(value: object) -> bool:
    return bool(
        isinstance(value, str)
        and value == value.strip()
        and value
        and "\x00" not in value
        and not value.isdigit()
        and len(value) <= PROCESS_DISPLAY_NAME_MAX_LENGTH
    )


def _canonical_derived_block(value: object) -> bool:
    return bool(
        isinstance(value, dict)
        and set(value) == {"cif", "criticality_class"}
        and value.get("cif") in {"yes", "no"}
        and value.get("criticality_class") in {None, "low", "medium", "high", "critical"}
    )


def _canonical_asset_derived_block(value: object) -> bool:
    return bool(
        isinstance(value, dict)
        and set(value) == {"cif", "resulting_criticality"}
        and value.get("cif") in {"yes", "no"}
        and value.get("resulting_criticality")
        in {
            None,
            "low",
            "medium",
            "high",
            "critical",
        }
    )


def _canonical_creation_snapshot(
    proposed_after: object,
    after_snapshot: object,
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    if not isinstance(proposed_after, dict) or not isinstance(after_snapshot, dict):
        return None
    try:
        payload = ProcessCreate.model_validate(proposed_after)
    except PydanticValidationError:
        return None
    canonical_after = jsonable_encoder(payload.model_dump(exclude={"request_reason"}))
    if proposed_after != canonical_after:
        return None
    expected_safe_fields = set(canonical_after) - {
        "process_owner_user_id",
        "owning_department_id",
    }
    if set(after_snapshot) != expected_safe_fields | {"process_owner", "owning_department"}:
        return None
    if any(after_snapshot[field] != canonical_after[field] for field in expected_safe_fields):
        return None
    if not _canonical_display_label(after_snapshot.get("process_owner")):
        return None
    if not _canonical_display_label(after_snapshot.get("owning_department")):
        return None
    return canonical_after, dict(after_snapshot)


def _canonical_extended_pending_changes(
    *,
    kind: str,
    before_snapshot: dict[str, Any],
    after_snapshot: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    if kind == PROCESS_CREATE_KIND:
        return {field: {"old": None, "new": after_snapshot[field]} for field in sorted(after_snapshot)}
    if kind == PROCESS_ARCHIVE_KIND:
        return {"is_archived": {"old": False, "new": True}}
    return {
        "relationship": {
            "old": before_snapshot["relationship"],
            "new": after_snapshot["relationship"],
        }
    }


def _normalized_utc_datetime(value: object) -> datetime | None:
    """Normalize persisted datetimes without accepting malformed timestamp types.

    SQLite drops timezone metadata when it reloads ``DateTime(timezone=True)``
    columns. Treat those naive values as UTC through the repository's canonical
    policy while keeping the strict envelope closed to strings and other
    non-datetime values.
    """
    return coerce_utc(value) if isinstance(value, datetime) else None


def _valid_lifecycle_evidence(approval: ApprovalRequest) -> bool:
    """Validate mutable lifecycle state while rejecting tiered-flow evidence.

    Extended Process proposals are one-stage independent approvals. They may
    move through terminal lifecycle states, but must never carry evidence from
    the legacy primary/privileged tier workflow.
    """
    created_at = _normalized_utc_datetime(approval.created_at)
    resolved_at = _normalized_utc_datetime(approval.resolved_at)
    if not (
        approval.delete_context_snapshot is None
        and approval.primary_approver_id is None
        and approval.primary_approved_at is None
        and approval.requires_privileged_approval is False
        and approval.privileged_approver_id is None
        and approval.privileged_approved_at is None
        and isinstance(approval.reason, str)
        and bool(approval.reason.strip())
        and created_at is not None
    ):
        return False
    if approval.status == ApprovalStatus.PENDING:
        return bool(
            approval.resolved_by_id is None and approval.resolved_at is None and approval.resolution_notes is None
        )
    if approval.status == ApprovalStatus.PENDING_PRIVILEGED:
        return False
    if approval.status in {
        ApprovalStatus.APPROVED,
        ApprovalStatus.REJECTED,
        ApprovalStatus.CANCELLED,
        ApprovalStatus.EXPIRED,
    }:
        return bool(
            _positive_int(approval.resolved_by_id)
            and resolved_at is not None
            and resolved_at >= created_at
            and (
                approval.status == ApprovalStatus.CANCELLED
                or (isinstance(approval.resolution_notes, str) and bool(approval.resolution_notes.strip()))
            )
        )
    return False


def extended_process_approval_envelope_is_valid(
    proposal: GovernedMutationProposal,
    identity: ExtendedProcessMutationIdentity,
) -> bool:
    """Validate every mutable approval field against immutable proposal identity."""
    approval = proposal.approval_request
    if approval is None:
        return False
    approval_created_at = _normalized_utc_datetime(approval.created_at)
    proposal_created_at = _normalized_utc_datetime(proposal.created_at)
    return bool(
        approval.id == identity.approval_request_id
        and approval.resource_type == ApprovalResourceType.PROCESS
        and approval.resource_id == identity.primary_resource_id
        and approval.resource_name == identity.primary_resource_name
        and approval.action_type == identity.action_type
        and approval.pending_changes == identity.pending_changes
        and approval.scenario_key == identity.scenario_key
        and approval.scenario_approver_roles == list(identity.approver_roles)
        and approval.requested_by_id == identity.requested_by_id
        and _valid_lifecycle_evidence(approval)
        and approval_created_at is not None
        and proposal_created_at is not None
        and proposal_created_at >= approval_created_at
    )


def _strict_extended_process_identity(
    proposal: GovernedMutationProposal | None,
    *,
    validate_approval_envelope: bool = True,
) -> ExtendedProcessMutationIdentity | None:
    """Return an exact #85 identity, None for other workflows, raise if corrupt."""
    if proposal is None or not is_extended_process_kind(proposal.mutation_kind):
        return None
    approval = proposal.approval_request
    if not _bounded_process_json_topology(
        proposal.scenario_snapshot,
        proposal.base_versions,
        proposal.before_snapshot,
        proposal.after_snapshot,
        proposal.derived_impact_snapshot,
        proposal.proposed_changes,
        proposal.impacted_resources_snapshot,
        approval.pending_changes if approval is not None else None,
        approval.scenario_approver_roles if approval is not None else None,
    ):
        raise InvalidGovernedProcessIdentity("Malformed extended governed Process identity")
    scenario = proposal.scenario_snapshot
    roles = scenario.get("approver_roles") if isinstance(scenario, dict) else None
    common_valid = bool(
        proposal.primary_resource_type == "process"
        and _canonical_uuid4(proposal.proposal_id)
        and proposal.proposal_version == PROPOSAL_VERSION
        and proposal.schema_version == PROPOSAL_SCHEMA_VERSION
        and _normalized_utc_datetime(proposal.created_at) is not None
        and _positive_int(proposal.approval_request_id)
        and _positive_int(proposal.requested_by_id)
        and isinstance(proposal.primary_resource_name, str)
        and proposal.primary_resource_name == proposal.primary_resource_name.strip()
        and 0 < len(proposal.primary_resource_name) <= PROCESS_DISPLAY_NAME_MAX_LENGTH
        and isinstance(scenario, dict)
        and set(scenario) == {"key", "requires_approval", "approver_roles", "triggered_policies"}
        and scenario.get("key") in {SCENARIO_KEY, ASSET_SCENARIO_KEY}
        and scenario.get("requires_approval") is True
        and isinstance(roles, list)
        and roles
        and all(isinstance(role, str) for role in roles)
        and len(roles) == len(set(roles))
        and set(roles).issubset({"risk_manager", "cro"})
        and isinstance(proposal.before_snapshot, dict)
        and isinstance(proposal.after_snapshot, dict)
        and isinstance(proposal.derived_impact_snapshot, dict)
        and isinstance(proposal.proposed_changes, dict)
        and isinstance(proposal.impacted_resources_snapshot, list)
    )
    if not common_valid:
        raise ValueError("Malformed extended governed Process identity")

    kind = proposal.mutation_kind
    triggered_scenarios = proposal.proposed_changes.get("triggered_scenarios", [scenario.get("key")])
    if not (
        isinstance(triggered_scenarios, list)
        and triggered_scenarios
        and all(isinstance(key, str) for key in triggered_scenarios)
        and len(triggered_scenarios) == len(set(triggered_scenarios))
        and set(triggered_scenarios).issubset({SCENARIO_KEY, ASSET_SCENARIO_KEY})
        and triggered_scenarios[0] == scenario.get("key")
    ):
        raise ValueError("Malformed governed Process policy triggers")
    triggered_policy_snapshots = strict_triggered_policy_snapshots(
        scenario.get("triggered_policies"),
        scenario_keys=triggered_scenarios,
        effective_roles=roles,
    )
    if approval is None:
        raise ValueError("Missing extended governed Process approval envelope")

    if kind == PROCESS_CREATE_KIND:
        creation = _canonical_creation_snapshot(
            proposal.proposed_changes.get("after"),
            proposal.after_snapshot,
        )
        if creation is None:
            raise ValueError("Malformed governed Process creation")
        canonical_after, _ = creation
        derived = proposal.derived_impact_snapshot
        valid = bool(
            proposal.primary_resource_id is None
            and proposal.base_versions == {}
            and proposal.before_snapshot == {}
            and proposal.impacted_resources_snapshot == []
            and set(proposal.proposed_changes) == {"after"}
            and proposal.proposed_changes["after"] == canonical_after
            and isinstance(derived, dict)
            and set(derived) == {"before", "after"}
            and derived.get("before") is None
            and _canonical_derived_block(derived.get("after"))
            and derived["after"]["cif"] == "yes"
        )
        action = ApprovalActionType.CREATE
    elif kind == PROCESS_ARCHIVE_KIND:
        process_id = _positive_int(proposal.primary_resource_id)
        base_version = proposal.base_versions.get("process") if isinstance(proposal.base_versions, dict) else None
        process_impact = {
            "resource_type": "process",
            "resource_id": process_id,
            "resource_name": proposal.primary_resource_name,
            "base_governance_version": base_version,
        }
        extra_impacts = proposal.impacted_resources_snapshot[:-1]
        expected_impact = [
            *extra_impacts,
            {
                **process_impact,
            },
        ]
        simple_derived = bool(
            set(proposal.derived_impact_snapshot) == {"before", "after"}
            and _canonical_derived_block(proposal.derived_impact_snapshot.get("before"))
            and _canonical_derived_block(proposal.derived_impact_snapshot.get("after"))
            and proposal.derived_impact_snapshot["before"] == proposal.derived_impact_snapshot["after"]
            and proposal.derived_impact_snapshot["before"]["cif"] == "yes"
        )
        composite_derived = bool(
            extra_impacts
            and set(proposal.derived_impact_snapshot) == {"processes", "assets"}
            and isinstance(proposal.derived_impact_snapshot.get("processes"), list)
            and len(proposal.derived_impact_snapshot["processes"]) == 1
            and set(proposal.derived_impact_snapshot["processes"][0])
            == {"resource_id", "before", "after"}
            and proposal.derived_impact_snapshot["processes"][0].get("resource_id") == process_id
            and _canonical_derived_block(proposal.derived_impact_snapshot["processes"][0].get("before"))
            and _canonical_derived_block(proposal.derived_impact_snapshot["processes"][0].get("after"))
            and _canonical_asset_derived_rows(
                proposal.derived_impact_snapshot.get("assets"),
                impact_rows=proposal.impacted_resources_snapshot,
                base_versions=proposal.base_versions,
            )
        )
        valid = bool(
            process_id
            and _positive_int(base_version)
            and proposal.before_snapshot == {"is_archived": False}
            and proposal.after_snapshot == {"is_archived": True}
            and proposal.proposed_changes
            == {
                "before": {"is_archived": False},
                "after": {"is_archived": True},
                "triggered_scenarios": triggered_scenarios,
            }
            and proposal.impacted_resources_snapshot == expected_impact
            and _canonical_process_impact_rows(
                proposal.impacted_resources_snapshot,
                allowed_types=frozenset({"asset", "process"}),
            )
            and extra_impacts == sorted(extra_impacts, key=lambda item: item["resource_id"])
            and proposal.base_versions
            == {
                "process": base_version,
                **{f"asset:{item['resource_id']}": item["base_governance_version"] for item in extra_impacts},
            }
            and isinstance(proposal.derived_impact_snapshot, dict)
            and (simple_derived or composite_derived)
            and all(
                item.get("resource_type") == "asset"
                and _positive_int(item.get("resource_id"))
                and _positive_int(item.get("base_governance_version"))
                and proposal.base_versions.get(f"asset:{item['resource_id']}") == item["base_governance_version"]
                for item in extra_impacts
            )
        )
        action = ApprovalActionType.DELETE
    else:
        process_id = _positive_int(proposal.primary_resource_id)
        operation = proposal.proposed_changes.get("operation")
        try:
            validated_operation = validate_process_relationship_operation(
                operation,
                process_id=process_id,
            )
        except ValidationError as exc:
            raise ValueError("Malformed governed Process relationship") from exc
        impact_rows = proposal.impacted_resources_snapshot
        impact_process_ids = [
            item.get("resource_id")
            for item in impact_rows
            if isinstance(item, dict) and item.get("resource_type") == "process"
        ]
        expected_base_versions = (
            {f"{item['resource_type']}:{item['resource_id']}": item["base_governance_version"] for item in impact_rows}
            if len(impact_rows) > 1
            else ({"process": impact_rows[0]["base_governance_version"]} if impact_rows else {})
        )
        derived_rows = proposal.derived_impact_snapshot.get("processes")
        derived_asset_rows = proposal.derived_impact_snapshot.get("assets", [])
        valid = bool(
            process_id
            and isinstance(operation, dict)
            and validated_operation == operation
            and operation.get("kind") == kind
            and operation.get("process_id") == process_id
            and set(proposal.proposed_changes) == {"operation", "triggered_scenarios"}
            and set(proposal.before_snapshot) == {"relationship"}
            and set(proposal.after_snapshot) == {"relationship"}
            and proposal.before_snapshot["relationship"] == operation.get("before")
            and proposal.after_snapshot["relationship"] == operation.get("after")
            and process_id in impact_process_ids
            and len(impact_process_ids) == len(set(impact_process_ids))
            and impact_process_ids == sorted(impact_process_ids)
            and proposal.base_versions == expected_base_versions
            and _canonical_process_impact_rows(
                impact_rows,
                allowed_types=frozenset({"asset", "process"}),
            )
            and next(
                (
                    item["resource_name"]
                    for item in impact_rows
                    if item["resource_type"] == "process" and item["resource_id"] == process_id
                ),
                None,
            )
            == proposal.primary_resource_name
            and isinstance(derived_rows, list)
            and set(proposal.derived_impact_snapshot) in ({"processes"}, {"processes", "assets"})
            and len(derived_rows) == len(impact_process_ids)
            and [item.get("resource_id") for item in derived_rows if isinstance(item, dict)] == impact_process_ids
            and all(
                isinstance(item, dict)
                and set(item) == {"resource_id", "before", "after"}
                and _canonical_derived_block(item.get("before"))
                and _canonical_derived_block(item.get("after"))
                and item["before"] == item["after"]
                for item in derived_rows
            )
            and (
                any(item["before"]["cif"] == "yes" for item in derived_rows)
                or any(
                    item["before"]["cif"] == "yes"
                    or item["after"]["cif"] == "yes"
                    or item["before"]["resulting_criticality"] == "critical"
                    or item["after"]["resulting_criticality"] == "critical"
                    for item in derived_asset_rows
                )
            )
            and _canonical_asset_derived_rows(
                derived_asset_rows,
                impact_rows=impact_rows,
                base_versions=proposal.base_versions,
            )
        )
        action = ApprovalActionType.EDIT
    if not valid:
        raise ValueError("Malformed extended governed Process proposal")

    pending_changes = _canonical_extended_pending_changes(
        kind=kind,
        before_snapshot=proposal.before_snapshot,
        after_snapshot=proposal.after_snapshot,
    )
    identity = ExtendedProcessMutationIdentity(
        approval_request_id=proposal.approval_request_id,
        requested_by_id=proposal.requested_by_id,
        approver_roles=tuple(roles),
        mutation_kind=kind,
        primary_resource_type="process",
        primary_resource_id=proposal.primary_resource_id,
        primary_resource_name=proposal.primary_resource_name,
        action_type=action,
        base_versions={str(key): int(value) for key, value in proposal.base_versions.items()},
        pending_changes=pending_changes,
        scenario_key=scenario["key"],
        triggered_scenarios=tuple(triggered_scenarios),
        triggered_policy_snapshots=triggered_policy_snapshots,
    )
    if validate_approval_envelope and not extended_process_approval_envelope_is_valid(
        proposal,
        identity,
    ):
        raise ValueError("Malformed extended governed Process approval envelope")
    return identity


def strict_extended_process_identity(
    proposal: GovernedMutationProposal | None,
    *,
    validate_approval_envelope: bool = True,
) -> ExtendedProcessMutationIdentity | None:
    """Fail closed with one stable exception for every malformed JSON shape."""
    try:
        return _strict_extended_process_identity(
            proposal,
            validate_approval_envelope=validate_approval_envelope,
        )
    except ValueError:
        raise
    except (AttributeError, IndexError, KeyError, RecursionError, TypeError) as exc:
        raise InvalidGovernedProcessIdentity("Malformed extended governed Process identity") from exc


async def valid_extended_process_approval_ids(
    db: AsyncSession,
    *,
    approval_ids: Collection[int] | None = None,
    approval_statuses: Collection[ApprovalStatus] | None = None,
) -> frozenset[int]:
    """Return the exact SQL membership set produced by the strict parser.

    Queue/count/notification queries use this set as an ``IN`` predicate. This
    deliberately keeps one iff classifier for SQLite and PostgreSQL instead of
    maintaining a second, inevitably weaker JSON-expression parser.
    """
    statement = (
        select(GovernedMutationProposal)
        .join(
            ApprovalRequest,
            ApprovalRequest.id == GovernedMutationProposal.approval_request_id,
        )
        .options(selectinload(GovernedMutationProposal.approval_request))
        .where(
            GovernedMutationProposal.mutation_kind.in_(
                sorted({PROCESS_MUTATION_KIND, *SUPPORTED_EXTENDED_PROCESS_KINDS})
            ),
            GovernedMutationProposal.primary_resource_type == "process",
            GovernedMutationProposal.proposal_version == PROPOSAL_VERSION,
            GovernedMutationProposal.schema_version == PROPOSAL_SCHEMA_VERSION,
            GovernedMutationProposal.requested_by_id == ApprovalRequest.requested_by_id,
            GovernedMutationProposal.primary_resource_name == ApprovalRequest.resource_name,
            ApprovalRequest.resource_type == ApprovalResourceType.PROCESS,
            or_(
                and_(
                    GovernedMutationProposal.mutation_kind == PROCESS_MUTATION_KIND,
                    GovernedMutationProposal.primary_resource_id == ApprovalRequest.resource_id,
                    ApprovalRequest.action_type == ApprovalActionType.EDIT,
                ),
                and_(
                    GovernedMutationProposal.mutation_kind == PROCESS_CREATE_KIND,
                    GovernedMutationProposal.primary_resource_id.is_(None),
                    ApprovalRequest.resource_id.is_(None),
                    ApprovalRequest.action_type == ApprovalActionType.CREATE,
                ),
                and_(
                    GovernedMutationProposal.mutation_kind == PROCESS_ARCHIVE_KIND,
                    GovernedMutationProposal.primary_resource_id == ApprovalRequest.resource_id,
                    ApprovalRequest.action_type == ApprovalActionType.DELETE,
                ),
                and_(
                    GovernedMutationProposal.mutation_kind.in_(sorted(SUPPORTED_PROCESS_RELATIONSHIP_KINDS)),
                    GovernedMutationProposal.primary_resource_id == ApprovalRequest.resource_id,
                    ApprovalRequest.action_type == ApprovalActionType.EDIT,
                ),
            ),
        )
    )
    if approval_ids is not None:
        ids = sorted({_positive_int(value) for value in approval_ids} - {None})
        if not ids:
            return frozenset()
        statement = statement.where(GovernedMutationProposal.approval_request_id.in_(ids))
    if approval_statuses is not None:
        statuses = tuple(sorted(set(approval_statuses), key=lambda status: status.value))
        if not statuses:
            return frozenset()
        statement = statement.where(ApprovalRequest.status.in_(statuses))
    proposals = list((await db.execute(statement)).scalars().all())
    valid: set[int] = set()
    for proposal in proposals:
        try:
            identity = (
                strict_governed_process_identity(proposal)
                if proposal.mutation_kind == PROCESS_MUTATION_KIND
                else strict_extended_process_identity(proposal)
            )
        except (InvalidGovernedProcessIdentity, ValueError):
            continue
        if identity is not None:
            valid.add(identity.approval_request_id)
    return frozenset(valid)


def _derived_snapshot(block) -> dict[str, str | None]:
    return {"cif": block.cif, "criticality_class": block.criticality_class}


def _display_name_for_creation(payload: ProcessCreate) -> str:
    name = payload.l1_process.strip()
    return name[:PROCESS_DISPLAY_NAME_MAX_LENGTH]


async def _assert_no_duplicate_creation(
    db: AsyncSession,
    *,
    resource_name: str,
    raw_after: dict[str, Any],
) -> None:
    proposals = list(
        (
            await db.execute(
                select(GovernedMutationProposal)
                .join(ApprovalRequest, ApprovalRequest.id == GovernedMutationProposal.approval_request_id)
                .where(
                    GovernedMutationProposal.mutation_kind == PROCESS_CREATE_KIND,
                    GovernedMutationProposal.primary_resource_id.is_(None),
                    GovernedMutationProposal.primary_resource_name == resource_name,
                    ApprovalRequest.status.in_((ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED)),
                )
            )
        )
        .scalars()
        .all()
    )
    if any(proposal.proposed_changes == {"after": raw_after} for proposal in proposals):
        raise ConflictError(
            "An identical governed Process creation is already pending",
            code="process_pending_mutation",
        )


async def _queue(
    *,
    db: AsyncSession,
    action_type: ApprovalActionType,
    mutation_kind: str,
    resource_id: int | None,
    resource_name: str,
    reason: str,
    current_user: User,
    roles: list[str],
    pending_changes: dict[str, dict[str, Any]],
    before_snapshot: dict[str, Any],
    after_snapshot: dict[str, Any],
    proposed_changes: dict[str, Any],
    derived_impact: dict[str, Any],
    impacted_resources: list[dict[str, Any]],
    department_id: int | None,
    scenario_key: str = SCENARIO_KEY,
    triggered_scenarios: list[str] | None = None,
    triggered_policies: list[dict[str, Any]] | None = None,
) -> JSONResponse:
    policy_triggers = list(triggered_scenarios) if triggered_scenarios is not None else None
    policy_snapshots = list(triggered_policies or [triggered_policy_snapshot(scenario_key, roles)])
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.PROCESS,
        resource_id=resource_id,
        resource_name=resource_name,
        action_type=action_type,
        pending_changes=pending_changes,
        scenario_key=scenario_key,
        scenario_approver_roles=roles,
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db.add(approval)
    try:
        await db.flush()
        proposal = GovernedMutationProposal(
            proposal_id=str(uuid4()),
            proposal_version=PROPOSAL_VERSION,
            schema_version=PROPOSAL_SCHEMA_VERSION,
            approval_request_id=approval.id,
            mutation_kind=mutation_kind,
            primary_resource_type="process",
            primary_resource_id=resource_id,
            primary_resource_name=resource_name,
            scenario_snapshot={
                "key": scenario_key,
                "requires_approval": True,
                "approver_roles": roles,
                "triggered_policies": policy_snapshots,
            },
            base_versions=(
                {
                    **{
                        "process": next(
                            item["base_governance_version"]
                            for item in impacted_resources
                            if item["resource_type"] == "process"
                        )
                    },
                    **{
                        f"asset:{item['resource_id']}": item["base_governance_version"]
                        for item in impacted_resources
                        if item["resource_type"] == "asset"
                    },
                }
                if mutation_kind == PROCESS_ARCHIVE_KIND and impacted_resources
                else {
                    f"{item['resource_type']}:{item['resource_id']}": item["base_governance_version"]
                    for item in impacted_resources
                }
            )
            if len(impacted_resources) > 1
            else ({"process": impacted_resources[0]["base_governance_version"]} if impacted_resources else {}),
            before_snapshot=before_snapshot,
            after_snapshot=after_snapshot,
            derived_impact_snapshot=derived_impact,
            proposed_changes={
                **proposed_changes,
                **({"triggered_scenarios": policy_triggers} if policy_triggers is not None else {}),
            },
            impacted_resources_snapshot=impacted_resources,
            requested_by_id=current_user.id,
        )
        proposal.approval_request = approval
        db.add(proposal)
        await db.flush()
        for item in impacted_resources:
            db.add(
                GovernedMutationImpactLock(
                    proposal_id=proposal.id,
                    resource_type=item["resource_type"],
                    resource_id=item["resource_id"],
                    base_governance_version=item["base_governance_version"],
                )
            )
        await db.flush()
        strict_extended_process_identity(proposal)
        await audit_governed.proposal_submitted(
            db,
            actor=current_user,
            approval=approval,
            proposal=proposal,
            department_id=department_id,
            changes=pending_changes,
        )
        await OutboxService.enqueue(
            db,
            event_type="approval.request_created",
            aggregate_type="approval_request",
            aggregate_id=approval.id,
            idempotency_key=f"approval.request_created:{approval.id}:pending",
            payload={"approval_id": approval.id},
        )
        await commit_service_boundary(db, boundary=f"governed_mutation.{mutation_kind}.submit")
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(
            "A governed Process change is already pending",
            code="process_pending_mutation",
        ) from exc
    return build_approval_queued_response(
        message="Protected Process mutation submitted for independent approval",
        approval_id=approval.id,
        action_type=action_type.value,
        pending_fields=list(pending_changes),
        pending_changes=pending_changes,
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )


def _required_reason(value: str | None) -> str:
    reason = (value or "").strip()
    if not reason:
        raise ValidationError(
            "A request reason is mandatory for a protected Process mutation",
            code="governed_mutation_reason_required",
            status_code=422,
        )
    return reason


async def submit_process_creation_if_required(
    *, db: AsyncSession, payload: ProcessCreate, current_user: User, owner: User, department: Department
) -> JSONResponse | None:
    values = payload.model_dump(exclude={"request_reason"})
    proposed = Process(id=0, f_code="pending", **values)
    _, block = await _derived_blocks(db, proposed)
    if block.cif != "yes":
        return None
    scenario = await load_fixed_process_scenario_for_update(db)
    roles = validated_fixed_process_roles(scenario)
    if not scenario.requires_approval:
        return None
    if not await has_independent_process_approver(
        db,
        requester_id=current_user.id,
        roles=roles,
        process=proposed,
    ):
        raise ConflictError(
            "No independent Risk Manager or CRO is available", code="governed_mutation_approver_missing"
        )
    raw_after = jsonable_encoder(values)
    resource_name = _display_name_for_creation(payload)
    await _assert_no_duplicate_creation(db, resource_name=resource_name, raw_after=raw_after)
    safe_after = {
        field: value
        for field, value in raw_after.items()
        if field not in {"process_owner_user_id", "owning_department_id"}
    }
    safe_after["process_owner"] = safe_process_user_label(owner)
    safe_after["owning_department"] = safe_process_department_label(department)
    pending = {field: {"old": None, "new": safe_after[field]} for field in sorted(safe_after)}
    return await _queue(
        db=db,
        action_type=ApprovalActionType.CREATE,
        mutation_kind=PROCESS_CREATE_KIND,
        resource_id=None,
        resource_name=resource_name,
        reason=_required_reason(payload.request_reason),
        current_user=current_user,
        roles=roles,
        pending_changes=pending,
        before_snapshot={},
        after_snapshot=safe_after,
        proposed_changes={"after": raw_after},
        derived_impact={"before": None, "after": _derived_snapshot(block)},
        impacted_resources=[],
        department_id=department.id,
    )


async def submit_process_archive_if_required(
    *, db: AsyncSession, process: Process, request_reason: str | None, current_user: User
) -> JSONResponse | None:
    from .asset_mutations import process_point_asset_impacts

    impacted_assets, asset_derived_rows = await process_point_asset_impacts(
        db,
        process=process,
        updates={},
        archive=True,
    )
    current, _ = await _derived_blocks(db, process)
    process_protected = current.cif == "yes"
    asset_protected = any(
        block["cif"] == "yes" or block["resulting_criticality"] == "critical"
        for row in asset_derived_rows
        for block in (row["before"], row["after"])
    )
    triggered_scenarios: list[str] = []
    triggered_policies: list[dict[str, Any]] = []
    if process_protected:
        process_scenario = await load_fixed_process_scenario_for_update(db)
        if process_scenario.requires_approval:
            triggered_scenarios.append(SCENARIO_KEY)
            process_roles = validated_fixed_process_roles(process_scenario)
            triggered_policies.append(triggered_policy_snapshot(SCENARIO_KEY, process_roles))
    if asset_protected:
        asset_scenario = await load_fixed_asset_scenario_for_update(db)
        if asset_scenario.requires_approval:
            triggered_scenarios.append(ASSET_SCENARIO_KEY)
            asset_roles = validated_fixed_asset_roles(asset_scenario)
            triggered_policies.append(triggered_policy_snapshot(ASSET_SCENARIO_KEY, asset_roles))
    if not triggered_scenarios:
        return None
    roles = effective_triggered_policy_roles(triggered_policies)
    if not await has_independent_process_approver(
        db,
        requester_id=current_user.id,
        roles=roles,
        process=process,
    ):
        raise ConflictError(
            "No independent Risk Manager or CRO is available", code="governed_mutation_approver_missing"
        )
    name = f"{process.f_code} — {process.l1_process}"[:PROCESS_DISPLAY_NAME_MAX_LENGTH]
    pending = {"is_archived": {"old": False, "new": True}}
    return await _queue(
        db=db,
        action_type=ApprovalActionType.DELETE,
        mutation_kind=PROCESS_ARCHIVE_KIND,
        resource_id=process.id,
        resource_name=name,
        reason=_required_reason(request_reason),
        current_user=current_user,
        roles=roles,
        pending_changes=pending,
        before_snapshot={"is_archived": False},
        after_snapshot={"is_archived": True},
        proposed_changes={"before": {"is_archived": False}, "after": {"is_archived": True}},
        derived_impact=(
            {
                "processes": [
                    {
                        "resource_id": process.id,
                        "before": _derived_snapshot(current),
                        "after": _derived_snapshot(current),
                    }
                ],
                "assets": asset_derived_rows,
            }
            if impacted_assets
            else {"before": _derived_snapshot(current), "after": _derived_snapshot(current)}
        ),
        impacted_resources=[
            *[
                {
                    "resource_type": "asset",
                    "resource_id": asset.id,
                    "resource_name": asset.name,
                    "base_governance_version": asset.governance_version,
                }
                for asset in impacted_assets
            ],
            {
                "resource_type": "process",
                "resource_id": process.id,
                "resource_name": name,
                "base_governance_version": process.governance_version,
            },
        ],
        department_id=process.owning_department_id,
        scenario_key=triggered_scenarios[0],
        triggered_scenarios=triggered_scenarios,
        triggered_policies=triggered_policies,
    )


async def submit_process_relationship_mutation(
    *,
    db: AsyncSession,
    process: Process,
    mutation_kind: str,
    operation: dict[str, Any],
    request_reason: str | None,
    current_user: User,
    impacted_resources: list[dict[str, Any]],
) -> JSONResponse | None:
    """Queue a protected Process-link operation against its Process impacts.

    ``impacted_resources`` is deliberately an extensible immutable descriptor
    seam. Ticket #85 owns Process-resource locking only; ticket #86 extends the
    operation plan with downstream Asset impacts and Composite approval without
    changing the strict relationship envelope introduced here.
    """
    if mutation_kind not in SUPPORTED_PROCESS_RELATIONSHIP_KINDS or operation.get("kind") != mutation_kind:
        raise ValidationError("Unsupported Process relationship mutation", code="governed_mutation_unsupported")
    operation = validate_process_relationship_operation(
        operation,
        process_id=process.id,
    )
    impact_ids = sorted(
        {int(item["resource_id"]) for item in impacted_resources if item.get("resource_type") == "process"}
    )
    if process.id not in impact_ids:
        raise ValidationError("Primary Process is missing from the impacted resources")
    impacted_processes = {
        row.id: row
        for row in (
            await db.execute(
                select(Process)
                .where(Process.id.in_(impact_ids))
                .order_by(Process.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    }
    if set(impacted_processes) != set(impact_ids):
        raise ValidationError("An impacted Process no longer exists")
    process = impacted_processes[process.id]
    if operation["relationship_type"] == "vendor":
        # Process-Vendor mutations are managed from the Process end. Recheck
        # canonical write authority against the row refreshed by the final
        # impact lock; an earlier endpoint preflight may still have left a
        # stale ORM identity after an ownership/scope reassignment.
        from app.services._ict_register_lifecycle.policy import can_update_process_record

        if not can_update_process_record(current_user, process):
            raise AuthorizationError("Permission denied: processes:write")
    provided_impacts = {
        int(item["resource_id"]): item
        for item in impacted_resources
        if item.get("resource_type") == "process" and _positive_int(item.get("resource_id"))
    }
    if set(provided_impacts) != set(impact_ids) or any(
        not isinstance(item.get("resource_name"), str) for item in provided_impacts.values()
    ):
        raise ValidationError("Invalid impacted Process display identity")
    canonical_impacts = [
        {
            "resource_type": "process",
            "resource_id": impacted.id,
            # Preserve the caller's already authorization-filtered label. A
            # secondary impacted Process may be lockable but not readable.
            "resource_name": str(provided_impacts[impacted.id]["resource_name"]).strip()[
                :PROCESS_DISPLAY_NAME_MAX_LENGTH
            ],
            "base_governance_version": impacted.governance_version,
        }
        for impacted in (impacted_processes[process_id] for process_id in impact_ids)
    ]
    if any(not item["resource_name"] or item["resource_name"].isdigit() for item in canonical_impacts):
        raise ValidationError("Invalid impacted Process display identity")
    asset_derived_rows: list[dict[str, Any]] = []
    asset_protected = False
    asset_roles: list[str] = []
    if operation["relationship_type"] == "asset":
        from .asset_mutations import process_asset_composite_impact

        asset, asset_impact, asset_protected = await process_asset_composite_impact(
            db,
            operation=operation,
        )
        if asset_protected:
            from .fixed_asset_policy import load_fixed_asset_scenario_for_update

            asset_scenario = await load_fixed_asset_scenario_for_update(db)
            asset_protected = bool(asset_scenario is not None and asset_scenario.requires_approval)
            if asset_protected:
                asset_roles = validated_fixed_asset_roles(asset_scenario)
        if asset_protected:
            canonical_impacts.append(
                {
                    "resource_type": "asset",
                    "resource_id": asset.id,
                    "resource_name": asset.name,
                    "base_governance_version": asset.governance_version,
                }
            )
            canonical_impacts.sort(key=lambda item: (item["resource_type"], item["resource_id"]))
            asset_derived_rows.append(asset_impact)

    derived_rows = []
    process_protected = False
    for impacted_id in impact_ids:
        current, _ = await _derived_blocks(db, impacted_processes[impacted_id])
        block = _derived_snapshot(current)
        process_protected = process_protected or current.cif == "yes"
        derived_rows.append(
            {
                "resource_id": impacted_id,
                "before": block,
                "after": block,
            }
        )
    process_roles: list[str] = []
    if process_protected:
        process_scenario = await load_fixed_process_scenario_for_update(db)
        process_protected = bool(process_scenario.requires_approval)
        if process_protected:
            process_roles = validated_fixed_process_roles(process_scenario)
    triggered_scenarios = [
        key
        for key, enabled in (
            (SCENARIO_KEY, process_protected),
            (ASSET_SCENARIO_KEY, asset_protected),
        )
        if enabled
    ]
    if not triggered_scenarios:
        return None
    triggered_policies = [
        triggered_policy_snapshot(key, configured_roles)
        for key, configured_roles in (
            (SCENARIO_KEY, process_roles),
            (ASSET_SCENARIO_KEY, asset_roles),
        )
        if configured_roles
    ]
    roles = effective_triggered_policy_roles(triggered_policies)
    if not await has_independent_process_approver(
        db,
        requester_id=current_user.id,
        roles=roles,
        process=process,
    ):
        raise ConflictError(
            "No independent Risk Manager or CRO is available", code="governed_mutation_approver_missing"
        )
    name = f"{process.f_code} — {process.l1_process}"[:PROCESS_DISPLAY_NAME_MAX_LENGTH]
    before = operation.get("before")
    after = operation.get("after")
    pending = {"relationship": {"old": before, "new": after}}
    return await _queue(
        db=db,
        action_type=ApprovalActionType.EDIT,
        mutation_kind=mutation_kind,
        resource_id=process.id,
        resource_name=name,
        reason=_required_reason(request_reason),
        current_user=current_user,
        roles=roles,
        pending_changes=pending,
        before_snapshot={"relationship": before},
        after_snapshot={"relationship": after},
        proposed_changes={"operation": jsonable_encoder(operation)},
        derived_impact={
            "processes": derived_rows,
            **({"assets": asset_derived_rows} if asset_derived_rows else {}),
        },
        impacted_resources=canonical_impacts,
        department_id=process.owning_department_id,
        scenario_key=triggered_scenarios[0],
        triggered_scenarios=triggered_scenarios,
        triggered_policies=triggered_policies,
    )


__all__ = [
    "ExtendedProcessMutationIdentity",
    "PROCESS_ARCHIVE_KIND",
    "PROCESS_CREATE_KIND",
    "PROCESS_RELATIONSHIP_PREFIX",
    "SUPPORTED_EXTENDED_PROCESS_KINDS",
    "SUPPORTED_PROCESS_RELATIONSHIP_KINDS",
    "extended_process_approval_envelope_is_valid",
    "is_extended_process_kind",
    "strict_extended_process_identity",
    "submit_process_archive_if_required",
    "submit_process_creation_if_required",
    "submit_process_relationship_mutation",
]
