"""Audit log redaction policy for activity-log changes."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

REDACTED_VALUE = "[REDACTED]"

SENSITIVE_FIELD_PATTERNS = (
    "password",
    "secret",
    "token",
    "key",
    "credential",
    "cookie",
    "session",
    "authorization",
    "email",
    "phone",
    "iban",
    "account",
    "ssn",
)

FREE_TEXT_FIELDS = {
    "comment",
    "comments",
    "description",
    "details",
    "justification",
    "notes",
    "reason",
    "remediation",
    "resolution_notes",
}

SAFE_CHANGESET_FIELDS = {
    "action",
    "attempt_count",
    "available_at",
    "category",
    "control_form",
    "control_id",
    "control_owner_id",
    "current_value",
    "department_code",
    "department_id",
    "due_at",
    "entity_id",
    "event_type",
    "frequency",
    "gross_impact",
    "gross_probability",
    "gross_score",
    "id",
    "is_active",
    "is_archived",
    "is_priority",
    "limit",
    "link_id",
    "lower_limit",
    "metric_name",
    "net_impact",
    "net_probability",
    "net_score",
    "owner_id",
    "period_end",
    "permission_id",
    "process",
    "process_role",
    "reporting_owner_id",
    "replaceability",
    "resource_id",
    "result",
    "risk_id",
    "risk_level",
    "risk_type",
    "role_id",
    "scheduled_for",
    "scope_label",
    "severity",
    "status",
    "subprocess",
    "trigger_type",
    "unit",
    "upper_limit",
    "user_id",
    "value",
    "vendor_id",
    "vendor_type",
}

SAFE_CHANGESET_ALLOWLIST_BY_ENTITY = {
    "approval": {"primary_approver_id", "secondary_approver_id"},
    "config": {
        "app_log_retention_count",
        "app_log_rotation_size_mb",
        "audit_log_retention_count",
        "audit_log_rotation_size_mb",
        "approver_roles",
        "code",
        "color",
        "display_name",
        "icon",
        "is_active",
        "requires_approval",
        "sort_order",
        "value",
    },
    "kri": {"metric_name"},
    "risk": {"risk_id_code"},
    "role": {"display_name"},
    "user": {"password_changed", "entra_business_role"},
}

SENSITIVE_FIELD_FALSE_POSITIVES_BY_ENTITY = {
    "user": {"password_changed"},
}

_SENSITIVE_PATTERNS_RE = tuple(
    re.compile(pattern, re.IGNORECASE) for pattern in SENSITIVE_FIELD_PATTERNS
)
_SAFE_ENTITY_LABEL_ENTITY_TYPES = {
    "config",
    "department",
    "kri",
    "kri_value",
    "risk",
    "role",
}


@dataclass(frozen=True)
class SanitizedChanges:
    changes: dict | None
    visible_fields: tuple[str, ...]


@dataclass(frozen=True)
class ActivityMetadataPolicy:
    channel: Literal["db", "siem"]
    allow_actor_name: bool
    allow_safe_entity_label: bool
    description_mode: Literal["template_only"] = "template_only"


@dataclass(frozen=True)
class SanitizedActivityMetadata:
    entity_name: str
    actor_name: str | None
    description: str
    redacted_fields: tuple[str, ...]


DB_ACTIVITY_METADATA_POLICY = ActivityMetadataPolicy(
    channel="db",
    allow_actor_name=True,
    allow_safe_entity_label=True,
)
SIEM_ACTIVITY_METADATA_POLICY = ActivityMetadataPolicy(
    channel="siem",
    allow_actor_name=False,
    allow_safe_entity_label=False,
)


def _normalize_field_name(field: str) -> str:
    return field.strip().lower()


def is_sensitive_field(field: str) -> bool:
    normalized = _normalize_field_name(field)
    return any(pattern.search(normalized) for pattern in _SENSITIVE_PATTERNS_RE)


def _is_redaction_sensitive_field(entity_type: str, field: str) -> bool:
    normalized = _normalize_field_name(field)
    false_positives = SENSITIVE_FIELD_FALSE_POSITIVES_BY_ENTITY.get(entity_type, set())
    if normalized in false_positives:
        return False
    return is_sensitive_field(field)


def _is_free_text_field(field: str) -> bool:
    return _normalize_field_name(field) in FREE_TEXT_FIELDS


def _is_safe_field(entity_type: str, field: str) -> bool:
    normalized = _normalize_field_name(field)
    if normalized in SAFE_CHANGESET_FIELDS:
        return True
    return normalized in SAFE_CHANGESET_ALLOWLIST_BY_ENTITY.get(entity_type, set())


def _entity_label(entity_type: str) -> str:
    return entity_type.replace("_", " ").title()


def build_activity_description(
    entity_type: str,
    action: str,
    sanitized_changes: SanitizedChanges,
) -> str:
    """Generate a template-only activity description from safe metadata only."""
    action_verbs = {
        "create": "created",
        "update": "updated",
        "delete": "deleted",
        "archive": "archived",
        "approve": "approved",
        "reject": "rejected",
        "status_change": "changed status of",
        "link": "linked",
        "unlink": "unlinked",
        "cancel": "cancelled",
        "escalate": "escalated",
    }
    verb = action_verbs.get(action, action.replace("_", " "))
    entity_label = _entity_label(entity_type)

    description = f"{verb.capitalize()} {entity_label}"

    if action == "update" and sanitized_changes.changes:
        if sanitized_changes.visible_fields:
            fields = ", ".join(sanitized_changes.visible_fields)
            description += f" (fields: {fields})"
        else:
            description += " (updated sensitive fields)"

    return description


def sanitize_entity_name(
    entity_type: str,
    raw_entity_name: str,
    *,
    safe_entity_label: str | None,
    policy: ActivityMetadataPolicy,
) -> tuple[str, bool]:
    """Return a safe entity label for the configured metadata policy."""
    generic_label = _entity_label(entity_type)
    normalized_raw_entity_name = (raw_entity_name or "").strip()
    normalized_safe_label = (safe_entity_label or "").strip()
    if (
        policy.allow_safe_entity_label
        and normalized_safe_label
        and entity_type in _SAFE_ENTITY_LABEL_ENTITY_TYPES
    ):
        return normalized_safe_label, bool(normalized_raw_entity_name and normalized_raw_entity_name != normalized_safe_label)

    should_mark_redacted = bool(normalized_raw_entity_name) and normalized_raw_entity_name != generic_label
    return generic_label, should_mark_redacted


def sanitize_actor_name(
    raw_actor_name: str | None,
    *,
    policy: ActivityMetadataPolicy,
) -> tuple[str | None, bool]:
    """Return the actor name only when the metadata policy allows it."""
    normalized_actor_name = (raw_actor_name or "").strip() or None
    if policy.allow_actor_name:
        return normalized_actor_name or "Anonymous", False
    return None, normalized_actor_name is not None


def sanitize_activity_metadata(
    entity_type: str,
    action: str,
    *,
    raw_entity_name: str,
    raw_actor_name: str | None,
    raw_description: str | None,
    safe_description: str | None,
    safe_description_siem: str | None,
    safe_entity_label: str | None,
    sanitized_changes: SanitizedChanges,
    policy: ActivityMetadataPolicy,
) -> SanitizedActivityMetadata:
    """Apply the configured metadata policy to entity/actor labels and descriptions."""
    redacted_fields: list[str] = []

    entity_name, entity_name_redacted = sanitize_entity_name(
        entity_type,
        raw_entity_name,
        safe_entity_label=safe_entity_label,
        policy=policy,
    )
    if entity_name_redacted:
        redacted_fields.append("entity_name")

    actor_name, actor_name_redacted = sanitize_actor_name(raw_actor_name, policy=policy)
    if actor_name_redacted:
        redacted_fields.append("actor_name")

    template_description = build_activity_description(
        entity_type,
        action,
        sanitized_changes,
    )
    if policy.channel == "db":
        description = (safe_description or "").strip() or template_description
    else:
        description = (safe_description_siem or "").strip() or template_description

    if (raw_description or "").strip() and (raw_description or "").strip() != description:
        redacted_fields.append("description")
    elif (
        policy.channel == "siem"
        and (safe_description or "").strip()
        and (safe_description or "").strip() != description
    ):
        redacted_fields.append("description")

    return SanitizedActivityMetadata(
        entity_name=entity_name,
        actor_name=actor_name,
        description=description,
        redacted_fields=tuple(redacted_fields),
    )


def _redact_scalar(value: object) -> object:
    if value is None:
        return None
    return REDACTED_VALUE


def _redact_value(value: object) -> object:
    if isinstance(value, dict) and ("old" in value or "new" in value):
        return {
            "old": _redact_scalar(value.get("old")),
            "new": _redact_scalar(value.get("new")),
        }
    return _redact_scalar(value)


def sanitize_change_field(
    entity_type: str, field: str, value: object
) -> tuple[object, bool]:
    if _is_redaction_sensitive_field(entity_type, field) or _is_free_text_field(field):
        return _redact_value(value), False
    if _is_safe_field(entity_type, field):
        return value, True
    return _redact_value(value), False


def sanitize_changes(entity_type: str, changes: dict | None) -> SanitizedChanges:
    if not changes or not isinstance(changes, dict):
        return SanitizedChanges(changes=changes, visible_fields=())

    sanitized: dict[str, object] = {}
    visible_fields: list[str] = []
    for field, value in changes.items():
        sanitized_value, is_visible = sanitize_change_field(entity_type, field, value)
        sanitized[field] = sanitized_value
        if is_visible and not is_sensitive_field(field):
            visible_fields.append(field)

    return SanitizedChanges(
        changes=sanitized or None,
        visible_fields=tuple(visible_fields),
    )
