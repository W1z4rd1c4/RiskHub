"""Service for logging activities across the system."""

from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_redaction import (
    DB_ACTIVITY_METADATA_POLICY,
    SIEM_ACTIVITY_METADATA_POLICY,
    SanitizedChanges,
    build_activity_description,
    sanitize_activity_metadata,
    sanitize_changes,
)
from app.core.logging import get_audit_logger
from app.models import ActivityLog, User
from app.models.activity_log import ActivityAction, ActivityEntityType

# Structured logger for audit events (SIEM-compatible) - routes to audit.json.log
audit_logger = get_audit_logger()

RAW_CHANGESET_EXCLUDED_FIELDS = {"password", "hashed_password"}
MAX_DESCRIPTION_LENGTH = 2048
MAX_CHANGE_KEYS = 50
MAX_CHANGE_VALUE_LENGTH = 500


def _normalize_change_value(value: object) -> object:
    """Normalize enums for JSON-friendly change logging."""
    if isinstance(value, PyEnum):
        return value.value
    if isinstance(value, datetime | date):
        return value.isoformat()
    return value


def _truncate_text(value: str | None, max_len: int) -> str | None:
    if value is None:
        return None
    if len(value) <= max_len:
        return value
    if max_len <= 3:
        return value[:max_len]
    return value[: max_len - 3] + "..."


def _truncate_change_value(value: object) -> object:
    if isinstance(value, str):
        return _truncate_text(value, MAX_CHANGE_VALUE_LENGTH)
    return value


def _truncate_changes(changes: dict | None) -> dict | None:
    if not changes or not isinstance(changes, dict):
        return changes
    truncated: dict[str, object] = {}
    for field, value in list(changes.items())[:MAX_CHANGE_KEYS]:
        if isinstance(value, dict) and ("old" in value or "new" in value):
            truncated[field] = {
                "old": _truncate_change_value(value.get("old")),
                "new": _truncate_change_value(value.get("new")),
            }
        else:
            truncated[field] = _truncate_change_value(value)
    return truncated or None


def _normalize_changes(changes: dict | None) -> dict | None:
    if not changes or not isinstance(changes, dict):
        return changes
    normalized: dict[str, object] = {}
    for field, value in changes.items():
        if isinstance(value, dict) and ("old" in value or "new" in value):
            normalized[field] = {
                "old": _normalize_change_value(value.get("old")),
                "new": _normalize_change_value(value.get("new")),
            }
        else:
            normalized[field] = _normalize_change_value(value)
    return normalized or None


def build_change_set(
    model: object, updates: dict, *, extra_changes: dict | None = None
) -> dict | None:
    """
    Build a {field: {old, new}} change set from a model and update payload.
    Expects model to still hold OLD values (call before mutating).
    """
    changes: dict[str, dict[str, object]] = {}
    for field, new_value in updates.items():
        if field in RAW_CHANGESET_EXCLUDED_FIELDS:
            continue
        old_value = getattr(model, field, None)
        old_value = _normalize_change_value(old_value)
        new_value = _normalize_change_value(new_value)
        if old_value != new_value:
            changes[field] = {"old": old_value, "new": new_value}

    if extra_changes:
        for field, values in extra_changes.items():
            if field in RAW_CHANGESET_EXCLUDED_FIELDS:
                continue
            old_value = _normalize_change_value(values.get("old"))
            new_value = _normalize_change_value(values.get("new"))
            if old_value != new_value:
                changes[field] = {"old": old_value, "new": new_value}

    return changes or None


async def log_activity(
    db: AsyncSession,
    *,
    entity_type: ActivityEntityType,
    entity_id: int,
    entity_name: str,
    safe_entity_label: str | None = None,
    safe_description: str | None = None,
    safe_description_siem: str | None = None,
    action: ActivityAction,
    actor: User | None = None,
    department_id: int | None = None,
    changes: dict | None = None,
    description: str | None = None,
) -> ActivityLog:
    """
    Log an activity to the activity log.

    Args:
        db: Database session
        entity_type: Type of entity (risk, control, etc.)
        entity_id: ID of the entity
        entity_name: Display name (snapshot)
        safe_entity_label: Explicitly approved safe label for DB/API activity surfaces
        safe_description: Explicitly approved safe description for DB/API activity surfaces
        safe_description_siem: Explicitly approved safe description for SIEM/audit.json.log
        action: Action performed (create, update, delete, etc.)
        actor: User who performed the action
        department_id: Associated department (for scoping)
        changes: Dict of field changes {field: {old: v1, new: v2}}
        description: Human-readable description (auto-generated if not provided)

    Returns:
        Created ActivityLog entry
    """
    normalized_changes = _normalize_changes(changes)
    sanitized_changes = sanitize_changes(entity_type.value, normalized_changes)
    raw_actor_name = actor.name if actor else None
    db_metadata = sanitize_activity_metadata(
        entity_type.value,
        action.value,
        raw_entity_name=entity_name,
        raw_actor_name=raw_actor_name,
        raw_description=description,
        safe_description=safe_description,
        safe_description_siem=safe_description_siem,
        safe_entity_label=safe_entity_label,
        sanitized_changes=sanitized_changes,
        policy=DB_ACTIVITY_METADATA_POLICY,
    )
    siem_metadata = sanitize_activity_metadata(
        entity_type.value,
        action.value,
        raw_entity_name=entity_name,
        raw_actor_name=raw_actor_name,
        raw_description=description,
        safe_description=safe_description,
        safe_description_siem=safe_description_siem,
        safe_entity_label=safe_entity_label,
        sanitized_changes=sanitized_changes,
        policy=SIEM_ACTIVITY_METADATA_POLICY,
    )
    description = _truncate_text(db_metadata.description, MAX_DESCRIPTION_LENGTH) or ""
    changes = _truncate_changes(sanitized_changes.changes)

    entry = ActivityLog(
        entity_type=entity_type.value,
        entity_id=entity_id,
        entity_name=_truncate_text(db_metadata.entity_name, 255) or entity_type.value,
        action=action.value,
        actor_id=actor.id if actor else None,
        actor_name=_truncate_text(db_metadata.actor_name, 255) or "Anonymous",
        department_id=department_id,
        changes=changes,
        description=description,
    )
    db.add(entry)

    # Emit structured log for SIEM integration
    audit_payload: dict[str, object] = {
        "feature": "audit",
        "event_type": action.value,
        "entity_type": entity_type.value,
        "entity_id": entity_id,
        "entity_name": siem_metadata.entity_name,
        "actor_id": actor.id if actor else None,
        "department_id": department_id,
        "changes": changes,
        "description": siem_metadata.description,
        "metadata_redaction_count": len(siem_metadata.redacted_fields),
    }
    if siem_metadata.redacted_fields:
        audit_payload["metadata_redacted_fields"] = siem_metadata.redacted_fields
    if siem_metadata.actor_name is not None:
        audit_payload["actor_name"] = siem_metadata.actor_name

    audit_logger.info(action.value, **audit_payload)

    # Note: commit handled by caller's transaction
    return entry


def _generate_description(
    entity_type: ActivityEntityType,
    action: ActivityAction,
    sanitized_changes: SanitizedChanges,
) -> str:
    """Generate human-readable description for an activity."""
    return build_activity_description(entity_type.value, action.value, sanitized_changes)
