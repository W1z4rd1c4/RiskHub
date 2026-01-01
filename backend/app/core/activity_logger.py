"""Service for logging activities across the system."""
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import ActivityLog, User
from app.models.activity_log import ActivityAction, ActivityEntityType


async def log_activity(
    db: AsyncSession,
    *,
    entity_type: ActivityEntityType,
    entity_id: int,
    entity_name: str,
    action: ActivityAction,
    actor: User,
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
        action: Action performed (create, update, delete, etc.)
        actor: User who performed the action
        department_id: Associated department (for scoping)
        changes: Dict of field changes {field: {old: v1, new: v2}}
        description: Human-readable description (auto-generated if not provided)
    
    Returns:
        Created ActivityLog entry
    """
    if description is None:
        description = _generate_description(entity_type, entity_name, action, changes)
    
    entry = ActivityLog(
        entity_type=entity_type.value,
        entity_id=entity_id,
        entity_name=entity_name,
        action=action.value,
        actor_id=actor.id,
        actor_name=actor.name,
        department_id=department_id,
        changes=changes,
        description=description,
    )
    db.add(entry)
    # Note: commit handled by caller's transaction
    return entry


def _generate_description(
    entity_type: ActivityEntityType,
    entity_name: str,
    action: ActivityAction,
    changes: dict | None,
) -> str:
    """Generate human-readable description for an activity."""
    action_verbs = {
        ActivityAction.CREATE: "created",
        ActivityAction.UPDATE: "updated",
        ActivityAction.DELETE: "deleted",
        ActivityAction.ARCHIVE: "archived",
        ActivityAction.APPROVE: "approved",
        ActivityAction.REJECT: "rejected",
        ActivityAction.STATUS_CHANGE: "changed status of",
        ActivityAction.LINK: "linked",
        ActivityAction.UNLINK: "unlinked",
    }
    verb = action_verbs.get(action, action.value)
    entity_label = entity_type.value.replace("_", " ").title()
    
    desc = f"{verb.capitalize()} {entity_label}: {entity_name}"
    
    if changes and action == ActivityAction.UPDATE:
        fields = ", ".join(changes.keys())
        desc += f" (fields: {fields})"
    
    return desc
