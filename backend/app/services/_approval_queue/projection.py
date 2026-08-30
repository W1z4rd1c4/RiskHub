from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import cast

from sqlalchemy import false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_display import approval_resource_label
from app.core.pagination import MAX_LOOKUP_SIZE
from app.core.permissions import (
    control_visibility_clause,
    get_user_department_ids,
    has_permission,
    kri_visibility_clause,
    visible_risk_ids,
    visible_vendor_ids,
)
from app.models import (
    ApprovalRequest,
    Asset,
    Control,
    Department,
    GovernedMutationProposal,
    KeyRiskIndicator,
    Process,
    Risk,
    Role,
    Vendor,
)
from app.models.role import RoleType
from app.models.user import AccessScope, User
from app.schemas.approval_request import ApprovalRequestCapabilities, ApprovalRequestRead
from app.services._governed_mutations.process_identity import (
    GovernedProcessIdentity,
    InvalidGovernedProcessIdentity,
    strict_governed_process_identity,
)
from app.services._governed_mutations.process_mutations import (
    ExtendedProcessMutationIdentity,
    is_extended_process_kind,
    strict_extended_process_identity,
)
from app.services._governed_mutations.projection import (
    actor_safe_pending_changes,
    actor_safe_process_snapshots,
)
from app.services._ict_register_lifecycle.asset_policy import asset_visibility_clause
from app.services._ict_register_lifecycle.policy import can_read_process_record
from app.services.approval_scenario_policy import (
    can_resolve_extended_process_approval,
    can_resolve_process_approval,
    can_view_governed_process_snapshot,
)
from app.services.authorization_capabilities import approval_capabilities

from .contracts import ApprovalQueuePage, ApprovalQueueProjection
from .logging import queue_logger

try:
    from prometheus_client import Counter
except ModuleNotFoundError:  # pragma: no cover - metrics dependency is optional in tests
    Counter = None


class _NoopCounter:
    def inc(self, _amount: int = 1) -> None:
        return None

    def collect(self):
        return ()


APPROVAL_QUEUE_PROJECTION_SKIPPED_TOTAL = (
    Counter(
        "riskhub_approval_queue_projection_skipped_total",
        "Number of approval queue rows skipped because their stored payload could not be projected.",
    )
    if Counter is not None
    else _NoopCounter()
)


@dataclass(frozen=True, slots=True)
class ActorSafeExtendedLabels:
    process_labels: dict[int, str]
    asset_labels: dict[int, str]
    vendor_labels: dict[int, str]
    relationship_target_label: str | None


@dataclass(frozen=True, slots=True)
class ActorSafeLegacyLabels:
    user_labels_by_field: dict[str, dict[int, str]]
    department_labels: dict[int, str]
    vendor_labels: dict[int, str]


_LEGACY_USER_REFERENCE_FIELDS = frozenset(
    {"owner_id", "control_owner_id", "reporting_owner_id"}
)
_LEGACY_REFERENCE_FIELDS = _LEGACY_USER_REFERENCE_FIELDS | {
    "department_id",
    "linked_vendor_ids",
}
_LEGACY_KRI_HISTORY_PRESENTATION_FIELDS = frozenset(
    {"old_value", "new_value", "reason", "period_end", "recorded_at"}
)
_LEGACY_PRESENTATION_FIELDS = {
    "risk": frozenset(
        {
            "risk_id_code",
            "name",
            "process",
            "subprocess",
            "risk_type",
            "category",
            "description",
            "department_id",
            "owner_id",
            "gross_probability",
            "gross_impact",
            "net_probability",
            "net_impact",
            "status",
            "is_priority",
            "acceptance_approver",
            "acceptance_justification",
            "acceptance_date",
        }
    ),
    "control": frozenset(
        {
            "name",
            "description",
            "data_source",
            "methodology_reference",
            "control_form",
            "process_owner_position",
            "control_owner_id",
            "executor_position",
            "frequency",
            "risk_level",
            "output_description",
            "report_recipient",
            "documentation_location",
            "department_id",
            "status",
        }
    ),
    "kri": frozenset(
        {
            "metric_name",
            "description",
            "upper_limit",
            "lower_limit",
            "current_value",
            "reporting_owner_id",
            "unit",
            "frequency",
            "linked_vendor_ids",
        }
    ),
}
_LEGACY_PRESENTATION_FIELDS["kri"] |= _LEGACY_KRI_HISTORY_PRESENTATION_FIELDS
_RESTRICTED_LEGACY_CHANGE_FIELD = "__restricted_change__"
_RESTRICTED_LEGACY_CHANGE = {"old": None, "new": None}
_UNKNOWN_LEGACY_LABEL = {
    "owner_id": "Unknown user",
    "control_owner_id": "Unknown user",
    "reporting_owner_id": "Unknown user",
    "department_id": "Unknown department",
    "linked_vendor_ids": "Unknown vendor",
}
_MALFORMED_LEGACY_REFERENCE = object()


def _legacy_change_values(value: object) -> tuple[object, object]:
    if not isinstance(value, dict):
        return _MALFORMED_LEGACY_REFERENCE, _MALFORMED_LEGACY_REFERENCE
    return (
        value.get("old", _MALFORMED_LEGACY_REFERENCE),
        value.get("new", _MALFORMED_LEGACY_REFERENCE),
    )


def _legacy_scalar_label(
    value: object,
    *,
    labels: dict[int, str],
    unknown_label: str,
) -> object:
    if value is None:
        return None
    if type(value) is int:
        return labels.get(value, unknown_label)
    return unknown_label


def _legacy_vendor_labels(value: object, labels: dict[int, str]) -> object:
    if value is None:
        return None
    if not isinstance(value, list):
        return [_UNKNOWN_LEGACY_LABEL["linked_vendor_ids"]]
    return [
        labels.get(item, _UNKNOWN_LEGACY_LABEL["linked_vendor_ids"])
        if type(item) is int
        else _UNKNOWN_LEGACY_LABEL["linked_vendor_ids"]
        for item in value
    ]


def _actor_safe_legacy_pending_changes(
    approval: ApprovalRequest,
    labels: ActorSafeLegacyLabels | None,
) -> dict | None:
    """Build a presentation-only copy of legacy pending changes."""
    value = approval.pending_changes
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("Malformed legacy pending_changes")

    resource_type = approval.resource_type.value
    allowed_fields = _LEGACY_PRESENTATION_FIELDS.get(resource_type, frozenset())
    projected: dict[str, object] = {}
    has_restricted_change = False
    for field, change in value.items():
        if not isinstance(field, str) or field not in allowed_fields:
            has_restricted_change = True
            continue
        if field not in _LEGACY_REFERENCE_FIELDS:
            if field not in _LEGACY_KRI_HISTORY_PRESENTATION_FIELDS and (
                not isinstance(change, dict)
                or "old" not in change
                or "new" not in change
            ):
                has_restricted_change = True
                continue
            projected[field] = deepcopy(change)
            continue

        old, new = _legacy_change_values(change)
        if field == "linked_vendor_ids":
            vendor_labels = labels.vendor_labels if labels is not None else {}
            projected[field] = {
                "old": _legacy_vendor_labels(old, vendor_labels),
                "new": _legacy_vendor_labels(new, vendor_labels),
            }
            continue

        if field == "department_id":
            field_labels = labels.department_labels if labels is not None else {}
        else:
            field_labels = (
                labels.user_labels_by_field.get(field, {}) if labels is not None else {}
            )
        projected[field] = {
            "old": _legacy_scalar_label(
                old,
                labels=field_labels,
                unknown_label=_UNKNOWN_LEGACY_LABEL[field],
            ),
            "new": _legacy_scalar_label(
                new,
                labels=field_labels,
                unknown_label=_UNKNOWN_LEGACY_LABEL[field],
            ),
        }
    if has_restricted_change:
        projected[_RESTRICTED_LEGACY_CHANGE_FIELD] = _RESTRICTED_LEGACY_CHANGE.copy()
    return projected or None


def _legacy_user_visibility_clause(current_user: User):
    if current_user.access_scope == AccessScope.GLOBAL:
        return None
    if current_user.access_scope == AccessScope.DEPARTMENT:
        if current_user.department_id is not None:
            return User.department_id == current_user.department_id
        return User.id == current_user.id
    return or_(User.id == current_user.id, User.manager_id == current_user.id)


def _legacy_reference_ids(value: object, *, many: bool) -> set[int]:
    old, new = _legacy_change_values(value)
    candidates = (old, new)
    if many:
        return {
            item
            for candidate in candidates
            if isinstance(candidate, list)
            for item in candidate
            if type(item) is int
        }
    return {candidate for candidate in candidates if type(candidate) is int}


def _can_view_legacy_user_field(current_user: User, field: str) -> bool:
    if has_permission(current_user, "users", "read"):
        return True
    if field == "control_owner_id":
        return has_permission(current_user, "controls", "write")
    if field == "reporting_owner_id":
        return has_permission(current_user, "risks", "write")
    return has_permission(current_user, "risks", "write") or has_permission(
        current_user,
        "controls",
        "write",
    )


async def legacy_pending_change_actor_safe_labels(
    db: AsyncSession,
    *,
    approvals: list[ApprovalRequest],
    current_user: User,
) -> ActorSafeLegacyLabels:
    """Batch-load only active, actor-visible labels referenced by legacy rows."""
    user_ids_by_field: dict[str, set[int]] = {
        field: set() for field in _LEGACY_USER_REFERENCE_FIELDS
    }
    department_ids: set[int] = set()
    vendor_ids: set[int] = set()
    for approval in approvals:
        if approval.governed_mutation_proposal is not None or not isinstance(approval.pending_changes, dict):
            continue
        allowed_fields = _LEGACY_PRESENTATION_FIELDS.get(
            approval.resource_type.value,
            frozenset(),
        )
        for field, change in approval.pending_changes.items():
            if field not in allowed_fields:
                continue
            if field in _LEGACY_USER_REFERENCE_FIELDS and _can_view_legacy_user_field(current_user, field):
                user_ids_by_field[field].update(_legacy_reference_ids(change, many=False))
            elif field == "department_id" and has_permission(current_user, "departments", "read"):
                department_ids.update(_legacy_reference_ids(change, many=False))
            elif field == "linked_vendor_ids":
                vendor_ids.update(_legacy_reference_ids(change, many=True))

    all_user_ids = sorted(set().union(*user_ids_by_field.values()))[:MAX_LOOKUP_SIZE]
    visible_user_labels: dict[int, str] = {}
    if all_user_ids:
        user_query = (
            select(User.id, User.name)
            .join(Role, User.role_id == Role.id)
            .where(
                User.id.in_(all_user_ids),
                User.is_active.is_(True),
                Role.is_active.is_(True),
                Role.name != RoleType.ADMIN,
            )
        )
        user_scope = _legacy_user_visibility_clause(current_user)
        if user_scope is not None:
            user_query = user_query.where(user_scope)
        visible_user_labels = dict((await db.execute(user_query)).tuples().all())

    bounded_department_ids = sorted(department_ids)[:MAX_LOOKUP_SIZE]
    department_labels: dict[int, str] = {}
    if bounded_department_ids:
        department_query = select(Department.id, Department.name).where(
            Department.id.in_(bounded_department_ids),
            Department.is_active.is_(True),
        )
        scoped_department_ids = get_user_department_ids(current_user)
        if scoped_department_ids is not None:
            department_query = department_query.where(
                Department.id.in_(scoped_department_ids) if scoped_department_ids else false()
            )
        department_labels = dict((await db.execute(department_query)).tuples().all())

    bounded_vendor_ids = sorted(vendor_ids)[:MAX_LOOKUP_SIZE]
    vendor_labels: dict[int, str] = {}
    if bounded_vendor_ids:
        visible_vendor_id_set = await visible_vendor_ids(
            db,
            current_user,
            bounded_vendor_ids,
        )
        if visible_vendor_id_set:
            vendor_labels = dict(
                (
                    await db.execute(
                        select(Vendor.id, Vendor.name).where(
                            Vendor.id.in_(visible_vendor_id_set),
                            Vendor.is_archived.is_(False),
                        )
                    )
                ).tuples().all()
            )

    return ActorSafeLegacyLabels(
        user_labels_by_field={
            field: {
                user_id: visible_user_labels[user_id]
                for user_id in field_ids
                if user_id in visible_user_labels
            }
            for field, field_ids in user_ids_by_field.items()
        },
        department_labels=department_labels,
        vendor_labels=vendor_labels,
    )


def _strict_process_identity(proposal):
    if proposal is not None and is_extended_process_kind(proposal.mutation_kind):
        return strict_extended_process_identity(proposal)
    return strict_governed_process_identity(proposal)


def _actor_safe_asset_value(value):
    """Remove persistence/replay identifiers from an Asset-facing snapshot."""
    if isinstance(value, dict):
        return {
            str(key): _actor_safe_asset_value(item)
            for key, item in value.items()
            if isinstance(key, str) and key != "id" and not key.endswith("_id")
        }
    if isinstance(value, list):
        return [_actor_safe_asset_value(item) for item in value]
    return value


def _safe_asset_derived_impact(
    value: object,
    labels: ActorSafeExtendedLabels | None,
) -> dict:
    """Replace replay Asset ids with live authorization-filtered labels."""
    if not isinstance(value, dict):
        return {}
    asset_rows = value.get("assets")
    if not isinstance(asset_rows, list):
        safe = _actor_safe_asset_value(value)
        return safe if isinstance(safe, dict) else {}
    safe = {
        **{
            str(key): _actor_safe_asset_value(item)
            for key, item in value.items()
            if isinstance(key, str) and key not in {"assets", "vendors"}
        },
        "assets": [
            {
                "resource_name": (
                    labels.asset_labels.get(row_resource_id, "Restricted Asset")
                    if labels is not None and type(row_resource_id := row.get("resource_id")) is int
                    else "Restricted Asset"
                ),
                "before": _actor_safe_asset_value(row.get("before")),
                "after": _actor_safe_asset_value(row.get("after")),
            }
            for row in asset_rows
            if isinstance(row, dict)
        ],
    }
    vendor_rows = value.get("vendors")
    if isinstance(vendor_rows, list):
        safe["vendors"] = [
            {
                "resource_name": (
                    labels.vendor_labels.get(row_resource_id, "Restricted Vendor")
                    if labels is not None and type(row_resource_id := row.get("resource_id")) is int
                    else "Restricted Vendor"
                ),
                "before": _actor_safe_asset_value(row.get("before")),
                "after": _actor_safe_asset_value(row.get("after")),
            }
            for row in vendor_rows
            if isinstance(row, dict)
        ]
    return safe


def _safe_process_impact_label(
    identity: GovernedProcessIdentity | ExtendedProcessMutationIdentity,
    resource_type: object,
    resource_id: object,
    labels: ActorSafeExtendedLabels | None,
) -> str:
    if resource_type == "asset":
        if type(resource_id) is int and labels is not None:
            return labels.asset_labels.get(resource_id, "Restricted Asset")
        return "Restricted Asset"
    if resource_id == identity.primary_resource_id:
        return identity.primary_resource_name
    if type(resource_id) is int and labels is not None:
        return labels.process_labels.get(resource_id, "Restricted Process")
    return "Restricted Process"


def _safe_extended_derived_impact(
    proposal,
    identity: GovernedProcessIdentity | ExtendedProcessMutationIdentity,
    labels: ActorSafeExtendedLabels | None,
) -> dict:
    """Remove replay identifiers from the actor-facing impact projection."""
    value = proposal.derived_impact_snapshot
    if not isinstance(value, dict):
        return {}
    processes = value.get("processes")
    if not isinstance(processes, list):
        return dict(value)
    safe = {
        "processes": [
            {
                "resource_name": _safe_process_impact_label(
                    identity,
                    "process",
                    item.get("resource_id"),
                    labels,
                ),
                "before": item.get("before"),
                "after": item.get("after"),
            }
            for item in processes
            if isinstance(item, dict)
        ],
        "assets": [
            {
                "resource_name": (
                    # cast: non-int snapshot ids miss the int-keyed map and keep the default label.
                    labels.asset_labels.get(cast(int, item.get("resource_id")), "Restricted Asset")
                    if labels is not None
                    else "Restricted Asset"
                ),
                "before": item.get("before"),
                "after": item.get("after"),
            }
            for item in value.get("assets", [])
            if isinstance(item, dict)
        ],
    }
    vendor_rows = value.get("vendors")
    if isinstance(vendor_rows, list):
        safe["vendors"] = [
            {
                "resource_name": (
                    # cast: non-int snapshot ids miss the int-keyed map and keep the default label.
                    labels.vendor_labels.get(cast(int, item.get("resource_id")), "Restricted Vendor")
                    if labels is not None
                    else "Restricted Vendor"
                ),
                "before": item.get("before"),
                "after": item.get("after"),
            }
            for item in vendor_rows
            if isinstance(item, dict)
        ]
    return safe


def _actor_safe_relationship_change(
    proposal,
    identity: ExtendedProcessMutationIdentity,
    labels: ActorSafeExtendedLabels | None,
) -> dict | None:
    """Project the immutable operation without replay ids or database ids."""
    if not identity.mutation_kind.startswith("process.link."):
        return None
    operation = proposal.proposed_changes.get("operation")
    if not isinstance(operation, dict):  # strict identity makes this unreachable
        return None

    def safe_values(value: object) -> dict[str, str | bool | None]:
        if not isinstance(value, dict):
            return {}
        return {
            str(key): item
            for key, item in value.items()
            if isinstance(key, str) and (item is None or isinstance(item, str) or type(item) is bool)
        }

    relationship_type = str(operation["relationship_type"])
    return {
        "target_resource_type": operation["relationship_type"],
        "target_resource_name": (
            labels.relationship_target_label
            if labels is not None and labels.relationship_target_label is not None
            else f"Restricted {relationship_type.title()}"
        ),
        "action": operation["action"],
        "before": safe_values(operation.get("before")),
        "after": safe_values(operation.get("after")),
    }


def build_approval_read(
    approval: ApprovalRequest,
    current_user: User,
    capabilities: ApprovalRequestCapabilities | None = None,
    *,
    can_view_governed_snapshot: bool = False,
    can_view_governed_references: bool = False,
    governed_resolver: bool = False,
    actor_safe_extended_labels: ActorSafeExtendedLabels | None = None,
    actor_safe_legacy_labels: ActorSafeLegacyLabels | None = None,
) -> ApprovalRequestRead:
    proposal = approval.governed_mutation_proposal
    identity = _strict_process_identity(proposal)
    from app.services._governed_mutations.asset_mutations import valid_asset_governed_envelope
    from app.services._governed_mutations.threat_identity import (
        strict_threat_mutation_kind,
    )
    from app.services._governed_mutations.vendor_identity import (
        strict_vendor_mutation_kind,
    )

    asset_identity = valid_asset_governed_envelope(proposal)
    vendor_identity = strict_vendor_mutation_kind(proposal) is not None
    threat_identity = strict_threat_mutation_kind(proposal) is not None
    extended_identity = identity if isinstance(identity, ExtendedProcessMutationIdentity) else None
    malformed_terminal = False
    if (
        proposal is not None
        and identity is None
        and not asset_identity
        and not vendor_identity
        and not threat_identity
    ):
        if approval.status.value in {"approved", "rejected", "cancelled", "expired"}:
            malformed_terminal = True
        else:
            raise InvalidGovernedProcessIdentity("Unsupported governed mutation proposal")
    capabilities = capabilities or approval_capabilities(
        approval=approval,
        current_user=current_user,
        governed_identity=identity,
        governed_resolver=governed_resolver,
    )
    can_expose_snapshot = bool(
        (identity is not None or asset_identity or vendor_identity or threat_identity)
        and can_view_governed_snapshot
        and capabilities.can_view_pending_changes
    )
    if (
        identity is not None or asset_identity or vendor_identity or threat_identity
    ) and not can_expose_snapshot:
        capabilities = capabilities.model_copy(update={"can_view_pending_changes": False})
    pending_changes = (
        None
        if malformed_terminal or asset_identity or vendor_identity or threat_identity
        else _actor_safe_legacy_pending_changes(approval, actor_safe_legacy_labels)
        if identity is None
        else None
    )
    governed_mutation = None
    if can_expose_snapshot:
        assert proposal is not None
        if asset_identity or vendor_identity or threat_identity:
            before = _actor_safe_asset_value(proposal.before_snapshot)
            after = _actor_safe_asset_value(proposal.after_snapshot)
        elif extended_identity is None:
            before, after = actor_safe_process_snapshots(
                proposal,
                can_view_proposed_references=can_view_governed_references,
            )
        else:
            before = dict(proposal.before_snapshot)
            after = dict(proposal.after_snapshot)
        pending_changes = actor_safe_pending_changes(
            identity.pending_changes if identity is not None else approval.pending_changes,
            before=before,
            after=after,
        )
        governed_mutation = {
            "proposal_id": proposal.proposal_id,
            "proposal_version": proposal.proposal_version,
            "mutation_kind": proposal.mutation_kind,
            "before": before,
            "after": after,
            "derived_impact": (
                _safe_asset_derived_impact(
                    proposal.derived_impact_snapshot,
                    actor_safe_extended_labels,
                )
                if asset_identity or vendor_identity or threat_identity
                else _safe_extended_derived_impact(
                    proposal,
                    identity,
                    actor_safe_extended_labels,
                )
            ),
            "impacted_resources": [
                {
                    "resource_type": str(resource.get("resource_type") or "resource"),
                    "resource_name": (
                        _safe_process_impact_label(
                            identity,
                            resource.get("resource_type"),
                            resource.get("resource_id"),
                            actor_safe_extended_labels,
                        )
                        if identity is not None
                        else (
                            actor_safe_extended_labels.asset_labels.get(
                                # cast: non-int snapshot ids miss the int-keyed map -> default label.
                                cast(int, resource.get("resource_id")),
                                "Restricted Asset",
                            )
                            if asset_identity
                            and resource.get("resource_type") == "asset"
                            and actor_safe_extended_labels is not None
                            else (
                                actor_safe_extended_labels.vendor_labels.get(
                                    # cast: non-int snapshot ids miss the int-keyed map -> default label.
                                    cast(int, resource.get("resource_id")),
                                    "Restricted Vendor",
                                )
                                if resource.get("resource_type") == "vendor"
                                and actor_safe_extended_labels is not None
                                else f"Restricted {str(resource.get('resource_type') or 'resource').title()}"
                            )
                        )
                    ),
                }
                for resource in proposal.impacted_resources_snapshot
                if isinstance(resource, dict)
            ],
            "relationship_change": (
                _actor_safe_relationship_change(
                    proposal,
                    extended_identity,
                    actor_safe_extended_labels,
                )
                if extended_identity is not None
                else (
                    {
                        "target_resource_type": proposal.mutation_kind.split(".")[2],
                        "target_resource_name": (
                            actor_safe_extended_labels.relationship_target_label
                            if actor_safe_extended_labels is not None
                            and actor_safe_extended_labels.relationship_target_label is not None
                            else f"Restricted {proposal.mutation_kind.split('.')[2].title()}"
                        ),
                        "action": proposal.mutation_kind.rsplit(".", 1)[-1],
                        "before": before.get("relationship", {}),
                        "after": after.get("relationship", {}),
                    }
                    if asset_identity and proposal.mutation_kind.startswith("asset.link.")
                    else (
                        {
                            "target_resource_type": proposal.mutation_kind.split(".")[2],
                            "target_resource_name": (
                                actor_safe_extended_labels.relationship_target_label
                                if actor_safe_extended_labels is not None
                                and actor_safe_extended_labels.relationship_target_label is not None
                                else f"Restricted {proposal.mutation_kind.split('.')[2].title()}"
                            ),
                            "action": proposal.mutation_kind.rsplit(".", 1)[-1],
                            "before": before,
                            "after": after,
                        }
                        if vendor_identity
                        and proposal.mutation_kind.startswith("vendor.link.")
                        else None
                    )
                )
            ),
        }

    requester = (
        # cast: every strict identity/envelope above was parsed from this proposal, so it is non-None.
        cast(GovernedMutationProposal, proposal).requested_by
        if identity is not None or asset_identity or vendor_identity or threat_identity
        else approval.requested_by
    )
    resource_type = (
        "process"
        if extended_identity is not None
        else (identity.primary_resource_type if identity is not None else approval.resource_type.value)
    )
    resource_id = identity.primary_resource_id if identity is not None else approval.resource_id
    resource_name = identity.primary_resource_name if identity is not None else approval_resource_label(approval)
    action_type = (
        identity.action_type.value
        if identity is not None
        else (approval.action_type.value if approval.action_type else "delete")
    )
    requested_by_id = identity.requested_by_id if identity is not None else approval.requested_by_id
    return ApprovalRequestRead.model_validate(
        {
            "id": approval.id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action_type": action_type,
            "pending_changes": pending_changes,
            "status": approval.status.value.lower(),
            "reason": approval.reason,
            "requested_by_id": requested_by_id,
            "requested_by_name": requester.name if requester else None,
            "requested_by_email": requester.email if requester else None,
            "resolved_by_id": approval.resolved_by_id,
            "resolved_by_name": approval.resolved_by.name if approval.resolved_by else None,
            "resolved_at": approval.resolved_at,
            "resolution_notes": approval.resolution_notes,
            "created_at": approval.created_at,
            "resource_name": resource_name,
            "can_approve": capabilities.can_approve,
            "can_reject": capabilities.can_reject,
            "capabilities": capabilities,
            "governed_mutation": governed_mutation,
        }
    )


def build_malformed_governed_terminal_read(
    approval: ApprovalRequest,
    current_user: User,
) -> ApprovalRequestRead:
    """Return the resolver's just-expired corrupt row without payload evidence."""
    capabilities = approval_capabilities(
        approval=approval,
        current_user=current_user,
    ).model_copy(
        update={
            "can_approve": False,
            "can_reject": False,
            "can_cancel": False,
            "can_cancel_as_requester": False,
            "can_cancel_as_resolver": False,
            "can_view_pending_changes": False,
            "can_inspect_side_effects": False,
            "is_pending": False,
            "requires_privileged_resolution": False,
            "would_apply_side_effects_on_approve": False,
        }
    )
    return ApprovalRequestRead.model_validate(
        {
            "id": approval.id,
            "resource_type": approval.resource_type.value,
            "resource_id": approval.resource_id,
            "resource_name": f"Governed {approval.resource_type.value.title()} mutation",
            "action_type": approval.action_type.value,
            "pending_changes": None,
            "status": approval.status.value.lower(),
            "reason": approval.reason,
            "requested_by_id": approval.requested_by_id,
            "requested_by_name": approval.requested_by.name if approval.requested_by else None,
            "requested_by_email": approval.requested_by.email if approval.requested_by else None,
            "resolved_by_id": approval.resolved_by_id,
            "resolved_by_name": approval.resolved_by.name if approval.resolved_by else None,
            "resolved_at": approval.resolved_at,
            "resolution_notes": approval.resolution_notes,
            "created_at": approval.created_at,
            "can_approve": False,
            "can_reject": False,
            "capabilities": capabilities,
            "governed_mutation": None,
        }
    )


async def governed_process_actor_safe_labels(
    db: AsyncSession,
    *,
    approvals: list[ApprovalRequest],
    current_user: User,
) -> dict[int, ActorSafeExtendedLabels]:
    """Authorize every relationship and secondary-Process label per viewer."""
    from app.services._governed_mutations.asset_identity import valid_asset_governed_envelope
    from app.services._governed_mutations.vendor_identity import (
        strict_vendor_mutation_kind,
    )

    candidates: list[tuple[ApprovalRequest, GovernedMutationProposal, dict, int | None]] = []
    relationship_ids: dict[str, set[int]] = {
        "risk": set(),
        "control": set(),
        "kri": set(),
        "asset": set(),
        "vendor": set(),
    }
    process_ids: set[int] = set()
    impacted_asset_ids: set[int] = set()
    impacted_vendor_ids: set[int] = set()
    for approval in approvals:
        proposal = approval.governed_mutation_proposal
        if proposal is None:
            continue
        try:
            identity = _strict_process_identity(proposal)
        except (InvalidGovernedProcessIdentity, ValueError):
            continue
        asset_identity = valid_asset_governed_envelope(proposal)
        vendor_identity = strict_vendor_mutation_kind(proposal) is not None
        if identity is None and not asset_identity and not vendor_identity:
            continue
        operation = proposal.proposed_changes.get("operation")
        related_id: int | None = None
        if isinstance(operation, dict):
            relationship_type = operation.get("relationship_type")
            raw_related_id = operation.get("related_resource_id")
            if (
                vendor_identity
                and proposal.mutation_kind.startswith("vendor.link.")
            ):
                relationship_type = proposal.mutation_kind.split(".")[2]
                raw_related_id = operation.get("entity_id")
            if type(raw_related_id) is int:
                related_id = raw_related_id
            elif asset_identity and relationship_type == "vendor":
                values = operation.get("after") or operation.get("before")
                vendor_id = values.get("vendor_id") if isinstance(values, dict) else None
                related_id = vendor_id if type(vendor_id) is int else None
            elif asset_identity and relationship_type == "asset":
                related_id = next(
                    (
                        item.get("resource_id")
                        for item in proposal.impacted_resources_snapshot
                        if isinstance(item, dict)
                        and item.get("resource_id") != proposal.primary_resource_id
                        and type(item.get("resource_id")) is int
                    ),
                    None,
                )
            if relationship_type in relationship_ids and type(related_id) is int:
                relationship_ids[relationship_type].add(related_id)
        process_ids.update(
            item["resource_id"]
            for item in proposal.impacted_resources_snapshot
            if isinstance(item, dict)
            and item.get("resource_type") == "process"
            and type(item.get("resource_id")) is int
        )
        impacted_asset_ids.update(
            item["resource_id"]
            for item in proposal.impacted_resources_snapshot
            if isinstance(item, dict) and item.get("resource_type") == "asset" and type(item.get("resource_id")) is int
        )
        impacted_vendor_ids.update(
            item["resource_id"]
            for item in proposal.impacted_resources_snapshot
            if isinstance(item, dict)
            and item.get("resource_type") == "vendor"
            and type(item.get("resource_id")) is int
        )
        candidates.append((approval, proposal, operation if isinstance(operation, dict) else {}, related_id))

    visible_risks = await visible_risk_ids(db, current_user, relationship_ids["risk"])
    visible_vendors = await visible_vendor_ids(
        db,
        current_user,
        relationship_ids["vendor"] | impacted_vendor_ids,
    )
    risks = {risk.id: risk for risk in (await db.execute(select(Risk).where(Risk.id.in_(visible_risks)))).scalars()}
    control_query = select(Control).where(Control.id.in_(relationship_ids["control"]))
    control_clause = control_visibility_clause(current_user)
    if control_clause is not None:
        control_query = control_query.where(control_clause)
    controls = {
        control.id: control
        for control in (await db.execute(control_query)).scalars()
    }
    kri_query = (
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id.in_(relationship_ids["kri"]))
    )
    kri_clause = await kri_visibility_clause(db, current_user)
    if kri_clause is not None:
        kri_query = kri_query.where(kri_clause)
    kris = {
        kri.id: kri
        for kri in (await db.execute(kri_query)).scalars()
    }
    vendors = {
        vendor.id: vendor
        for vendor in (await db.execute(select(Vendor).where(Vendor.id.in_(visible_vendors)))).scalars()
    }
    asset_query = select(Asset).where(Asset.id.in_(relationship_ids["asset"] | impacted_asset_ids))
    asset_clause = asset_visibility_clause(current_user)
    if asset_clause is not None:
        asset_query = asset_query.where(asset_clause)
    assets = {asset.id: asset for asset in (await db.execute(asset_query)).scalars()}
    processes = {
        process.id: process
        for process in (await db.execute(select(Process).where(Process.id.in_(process_ids)))).scalars()
    }

    result: dict[int, ActorSafeExtendedLabels] = {}
    for approval, proposal, operation, related_id in candidates:
        process_labels = {
            item["resource_id"]: f"{process.f_code} — {process.l1_process}"[:255]
            for item in proposal.impacted_resources_snapshot
            if isinstance(item, dict)
            and item.get("resource_type") == "process"
            and type(item.get("resource_id")) is int
            and (process := processes.get(item["resource_id"])) is not None
            and can_read_process_record(current_user, process)
        }
        asset_labels = {
            item["resource_id"]: assets[item["resource_id"]].name
            for item in proposal.impacted_resources_snapshot
            if isinstance(item, dict) and item.get("resource_type") == "asset" and item.get("resource_id") in assets
        }
        vendor_labels = {
            item["resource_id"]: vendors[item["resource_id"]].name
            for item in proposal.impacted_resources_snapshot
            if isinstance(item, dict)
            and item.get("resource_type") == "vendor"
            and item.get("resource_id") in vendors
        }
        relationship_label = None
        relationship_type = operation.get("relationship_type")
        if proposal.mutation_kind.startswith("vendor.link."):
            relationship_type = proposal.mutation_kind.split(".")[2]
        can_view_relationship = bool(
            (relationship_type == "risk" and related_id in visible_risks)
            or (relationship_type == "control" and related_id in controls)
            or (relationship_type == "kri" and related_id in kris)
            or (relationship_type == "asset" and related_id in assets)
            or (relationship_type == "vendor" and related_id in visible_vendors)
        )
        if can_view_relationship:
            # cast: can_view_relationship required membership in an int-keyed id collection.
            target_id = cast(int, related_id)
            if relationship_type == "risk":
                relationship_label = risks[target_id].name
            elif relationship_type == "control":
                relationship_label = controls[target_id].name
            elif relationship_type == "kri":
                relationship_label = kris[target_id].metric_name
            elif relationship_type == "vendor":
                relationship_label = vendors[target_id].name
            else:
                relationship_label = assets[target_id].name
        result[approval.id] = ActorSafeExtendedLabels(
            process_labels=process_labels,
            asset_labels=asset_labels,
            vendor_labels=vendor_labels,
            relationship_target_label=relationship_label,
        )
    return result


async def governed_process_snapshot_access_ids(
    db: AsyncSession,
    *,
    approvals: list[ApprovalRequest],
    current_user: User,
) -> set[int]:
    from app.services._governed_mutations.asset_identity import (
        valid_asset_governed_envelope,
    )
    from app.services._governed_mutations.fixed_accountability_policy import (
        is_live_eligible_accountability_resolver,
        load_fixed_accountability_scenario,
    )
    from app.services._governed_mutations.fixed_asset_policy import (
        is_live_eligible_asset_resolver,
        load_fixed_asset_scenario,
    )
    from app.services._governed_mutations.fixed_vendor_policy import (
        is_live_eligible_vendor_resolver,
        load_fixed_vendor_scenario,
    )
    from app.services._governed_mutations.threat_identity import (
        strict_threat_mutation_kind,
    )
    from app.services._governed_mutations.vendor_identity import (
        strict_vendor_mutation_kind,
    )

    asset_scenario = await load_fixed_asset_scenario(db)
    vendor_scenario = await load_fixed_vendor_scenario(db)
    accountability_scenario = await load_fixed_accountability_scenario(db)
    asset_access_ids = {
        approval.id
        for approval in approvals
        if (proposal := approval.governed_mutation_proposal) is not None
        and valid_asset_governed_envelope(proposal)
        and (
            proposal.requested_by_id == current_user.id
            or is_live_eligible_asset_resolver(current_user, proposal, asset_scenario)
        )
    }
    vendor_access_ids = {
        approval.id
        for approval in approvals
        if (proposal := approval.governed_mutation_proposal) is not None
        and strict_vendor_mutation_kind(proposal) is not None
        and (
            proposal.requested_by_id == current_user.id
            or is_live_eligible_vendor_resolver(
                current_user,
                proposal,
                vendor_scenario,
            )
        )
    }
    threat_access_ids = {
        approval.id
        for approval in approvals
        if (proposal := approval.governed_mutation_proposal) is not None
        and strict_threat_mutation_kind(proposal) is not None
        and (
            proposal.requested_by_id == current_user.id
            or is_live_eligible_accountability_resolver(
                current_user,
                proposal,
                accountability_scenario,
            )
        )
    }
    identities = []
    for approval in approvals:
        try:
            identity = _strict_process_identity(approval.governed_mutation_proposal)
        except (InvalidGovernedProcessIdentity, ValueError):
            continue
        if identity is not None:
            identities.append((approval, identity))
    process_ids = {
        identity.primary_resource_id for _, identity in identities if identity.primary_resource_id is not None
    }
    # Keyed by optional id: extended process.create identities have no primary id and must miss.
    processes: dict[int | None, Process] = {
        process.id: process
        for process in (await db.execute(select(Process).where(Process.id.in_(process_ids)))).scalars().all()
    }
    access_ids: set[int] = {
        *asset_access_ids,
        *vendor_access_ids,
        *threat_access_ids,
    }
    for approval, identity in identities:
        if isinstance(identity, ExtendedProcessMutationIdentity):
            process = processes.get(identity.primary_resource_id)
            if identity.requested_by_id == current_user.id or can_resolve_extended_process_approval(
                current_user,
                # cast: a strict identity is only ever parsed from a non-None proposal.
                cast(GovernedMutationProposal, approval.governed_mutation_proposal),
                requester_id=identity.requested_by_id,
                configured_roles=identity.approver_roles,
                process=process,
            ):
                access_ids.add(approval.id)
            continue
        process = processes.get(identity.primary_resource_id)
        if process is not None:
            if can_view_governed_process_snapshot(
                current_user,
                process,
                requester_id=identity.requested_by_id,
                configured_roles=identity.approver_roles,
            ):
                access_ids.add(approval.id)
    return access_ids


async def governed_process_resolver_ids(
    db: AsyncSession,
    *,
    approvals: list[ApprovalRequest],
    current_user: User,
) -> set[int]:
    from app.services._governed_mutations.asset_identity import (
        valid_asset_governed_envelope,
    )
    from app.services._governed_mutations.fixed_accountability_policy import (
        is_live_eligible_accountability_resolver,
        load_fixed_accountability_scenario,
    )
    from app.services._governed_mutations.fixed_asset_policy import (
        is_live_eligible_asset_resolver,
        load_fixed_asset_scenario,
    )
    from app.services._governed_mutations.fixed_vendor_policy import (
        is_live_eligible_vendor_resolver,
        load_fixed_vendor_scenario,
    )
    from app.services._governed_mutations.threat_identity import (
        strict_threat_mutation_kind,
    )
    from app.services._governed_mutations.vendor_identity import (
        strict_vendor_mutation_kind,
    )

    asset_scenario = await load_fixed_asset_scenario(db)
    vendor_scenario = await load_fixed_vendor_scenario(db)
    accountability_scenario = await load_fixed_accountability_scenario(db)
    identities = []
    for approval in approvals:
        try:
            identity = _strict_process_identity(approval.governed_mutation_proposal)
        except (InvalidGovernedProcessIdentity, ValueError):
            continue
        if identity is not None:
            identities.append((approval, identity))
    process_ids = {
        identity.primary_resource_id for _, identity in identities if identity.primary_resource_id is not None
    }
    # Keyed by optional id: extended process.create identities have no primary id and must miss.
    processes: dict[int | None, Process] = {
        process.id: process
        for process in (await db.execute(select(Process).where(Process.id.in_(process_ids)))).scalars().all()
    }
    result: set[int] = {
        approval.id
        for approval in approvals
        if (proposal := approval.governed_mutation_proposal) is not None
        and valid_asset_governed_envelope(proposal)
        and is_live_eligible_asset_resolver(current_user, proposal, asset_scenario)
    }
    result.update(
        approval.id
        for approval in approvals
        if (proposal := approval.governed_mutation_proposal) is not None
        and strict_vendor_mutation_kind(proposal) is not None
        and is_live_eligible_vendor_resolver(
            current_user,
            proposal,
            vendor_scenario,
        )
    )
    result.update(
        approval.id
        for approval in approvals
        if (proposal := approval.governed_mutation_proposal) is not None
        and strict_threat_mutation_kind(proposal) is not None
        and is_live_eligible_accountability_resolver(
            current_user,
            proposal,
            accountability_scenario,
        )
    )
    for approval, identity in identities:
        if isinstance(identity, ExtendedProcessMutationIdentity):
            if can_resolve_extended_process_approval(
                current_user,
                # cast: a strict identity is only ever parsed from a non-None proposal.
                cast(GovernedMutationProposal, approval.governed_mutation_proposal),
                requester_id=identity.requested_by_id,
                configured_roles=identity.approver_roles,
                process=processes.get(identity.primary_resource_id),
            ):
                result.add(approval.id)
            continue
        process = processes.get(identity.primary_resource_id)
        if process is not None and can_resolve_process_approval(
            current_user,
            process,
            requester_id=identity.requested_by_id,
            configured_roles=identity.approver_roles,
        ):
            result.add(approval.id)
    return result


def project_approval_read(
    approval: ApprovalRequest,
    current_user: User,
    *,
    governed_snapshot_access_ids: set[int] | None = None,
    governed_resolver_ids: set[int] | None = None,
    can_view_governed_references: bool = False,
    actor_safe_extended_labels: dict[int, ActorSafeExtendedLabels] | None = None,
    actor_safe_legacy_labels: ActorSafeLegacyLabels | None = None,
):
    # Projection callers normally pass ORM ApprovalRequest rows. Keep policy
    # failures outside the corrupt-payload quarantine for lightweight contract
    # probes too; only stored-payload failures may be skipped.
    if not hasattr(approval, "governed_mutation_proposal"):
        approval_capabilities(approval=approval, current_user=current_user)
    try:
        return (
            build_approval_read(
                approval,
                current_user,
                can_view_governed_snapshot=(
                    governed_snapshot_access_ids is not None and approval.id in governed_snapshot_access_ids
                ),
                can_view_governed_references=can_view_governed_references,
                governed_resolver=(governed_resolver_ids is not None and approval.id in governed_resolver_ids),
                actor_safe_extended_labels=(actor_safe_extended_labels or {}).get(approval.id),
                actor_safe_legacy_labels=actor_safe_legacy_labels,
            ),
            None,
        )
    except Exception as exc:
        APPROVAL_QUEUE_PROJECTION_SKIPPED_TOTAL.inc()
        queue_logger.exception(
            "approval_queue_projection_skipped",
            extra={
                "approval_request_id": approval.id,
                "operation": "approval_queue_projection",
            },
        )
        return None, str(exc)


def project_approval_queue_item(
    approval: ApprovalRequest,
    current_user: User,
    *,
    governed_snapshot_access_ids: set[int] | None = None,
    governed_resolver_ids: set[int] | None = None,
    can_view_governed_references: bool = False,
    actor_safe_extended_labels: dict[int, ActorSafeExtendedLabels] | None = None,
    actor_safe_legacy_labels: ActorSafeLegacyLabels | None = None,
) -> ApprovalQueueProjection:
    item, skipped_reason = project_approval_read(
        approval,
        current_user,
        governed_snapshot_access_ids=governed_snapshot_access_ids,
        governed_resolver_ids=governed_resolver_ids,
        can_view_governed_references=can_view_governed_references,
        actor_safe_extended_labels=actor_safe_extended_labels,
        actor_safe_legacy_labels=actor_safe_legacy_labels,
    )
    return ApprovalQueueProjection(approval=approval, item=item, skipped_reason=skipped_reason)


def approval_queue_page(
    *,
    approvals: list[ApprovalRequest],
    total: int,
    skip: int,
    limit: int,
    current_user: User,
    governed_snapshot_access_ids: set[int] | None = None,
    governed_resolver_ids: set[int] | None = None,
    can_view_governed_references: bool = False,
    actor_safe_extended_labels: dict[int, ActorSafeExtendedLabels] | None = None,
    actor_safe_legacy_labels: ActorSafeLegacyLabels | None = None,
) -> ApprovalQueuePage:
    projections = [
        project_approval_queue_item(
            approval,
            current_user,
            governed_snapshot_access_ids=governed_snapshot_access_ids,
            governed_resolver_ids=governed_resolver_ids,
            can_view_governed_references=can_view_governed_references,
            actor_safe_extended_labels=actor_safe_extended_labels,
            actor_safe_legacy_labels=actor_safe_legacy_labels,
        )
        for approval in approvals
    ]
    items = [projection.item for projection in projections if projection.item is not None]
    return ApprovalQueuePage(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        skipped_corrupt_payloads=sum(1 for projection in projections if projection.item is None),
    )
