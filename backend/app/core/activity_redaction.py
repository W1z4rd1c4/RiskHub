"""Audit log redaction policy for activity-log changes."""

from __future__ import annotations

from dataclasses import dataclass
import re

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
    "locked_by",
    "lower_limit",
    "metric_name",
    "name",
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
    },
    "kri": {"metric_name"},
    "risk": {"risk_id_code"},
    "role": {"display_name"},
    "user": {"password_changed", "entra_business_role"},
    "vendor": {"legal_name"},
}

SENSITIVE_FIELD_FALSE_POSITIVES_BY_ENTITY = {
    "user": {"password_changed"},
}

_SENSITIVE_PATTERNS_RE = tuple(re.compile(pattern, re.IGNORECASE) for pattern in SENSITIVE_FIELD_PATTERNS)


@dataclass(frozen=True)
class SanitizedChanges:
    changes: dict | None
    visible_fields: tuple[str, ...]


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
    if normalized.endswith("_id") or normalized.startswith("is_"):
        return True
    return normalized in SAFE_CHANGESET_ALLOWLIST_BY_ENTITY.get(entity_type, set())


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


def sanitize_change_field(entity_type: str, field: str, value: object) -> tuple[object, bool]:
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
