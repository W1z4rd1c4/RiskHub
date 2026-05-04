from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import coerce_utc
from app.core.permissions import can_access_department_id
from app.models import User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.issue import IssueUpdate
from app.services._issue_register import serialize_issue_read_for_actor
from app.services._issue_workflow.contracts import IssueWorkflowOutcome
from app.services._issue_workflow.loading import (
    get_issue_with_relations,
    get_writable_issue_or_404,
)
from app.services._issue_workflow.source_validation import (
    clear_issue_source_links,
    ensure_issue_source_link,
    ensure_owner_assignable,
    issue_link_department_ids,
    resolve_issue_source_metadata,
    validate_user_exists,
)

CONCRETE_SOURCE_TYPES = {"control_execution", "kri_breach"}


def source_type_value(source_type) -> str:
    return source_type.value if hasattr(source_type, "value") else str(source_type)


async def update_issue_detail(
    *,
    db: AsyncSession,
    issue_id: int,
    payload: IssueUpdate,
    current_user: User,
) -> IssueWorkflowOutcome:
    issue = await get_writable_issue_or_404(db, issue_id, current_user)
    updates = payload.model_dump(exclude_unset=True)

    if "status" in updates:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Use workflow endpoints to change issue status",
        )

    target_department_id = issue.department_id
    if "owner_user_id" in updates:
        await validate_user_exists(db, updates.get("owner_user_id"))
    if "department_id" in updates:
        new_dept_id = updates.get("department_id")
        if new_dept_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="department_id cannot be null")
        if not can_access_department_id(current_user, new_dept_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this department")
        target_department_id = new_dept_id

        if new_dept_id != issue.department_id:
            link_department_ids = await issue_link_department_ids(db, issue.id)
            if any(link_department_id != new_dept_id for link_department_id in link_department_ids):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Cannot change department while links point to entities in another department; "
                        "relink/unlink first"
                    ),
                )

    if "owner_user_id" in updates:
        await ensure_owner_assignable(
            db,
            owner_user_id=updates.get("owner_user_id"),
            department_id=target_department_id,
        )
    elif "department_id" in updates and issue.owner_user_id is not None:
        await ensure_owner_assignable(
            db,
            owner_user_id=issue.owner_user_id,
            department_id=target_department_id,
            denied_status=status.HTTP_409_CONFLICT,
        )

    if "source_type" in updates or "source_id" in updates:
        if updates.get("source_type") is None and "source_type" in updates:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source_type cannot be null")
        new_source_type = updates.get("source_type", issue.source_type)
        current_source_type_value = source_type_value(issue.source_type)
        new_source_type_value = source_type_value(new_source_type)
        missing_source_id_for_concrete_switch = (
            "source_type" in updates
            and "source_id" not in updates
            and new_source_type_value in CONCRETE_SOURCE_TYPES
            and current_source_type_value != new_source_type_value
        )
        if missing_source_id_for_concrete_switch:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source_id is required")
        if "source_id" in updates:
            new_source_id = updates["source_id"]
        elif "source_type" in updates and new_source_type_value in {"manual", "audit"}:
            new_source_id = None
        else:
            new_source_id = issue.source_id
        resolved_source = await resolve_issue_source_metadata(
            db,
            current_user,
            source_type=new_source_type,
            source_id=new_source_id,
        )
        if resolved_source is not None:
            if resolved_source.department_id != target_department_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Source entity department must match issue department",
                )
            updates["source_type"] = resolved_source.source_type
            updates["source_id"] = resolved_source.source_id
        else:
            updates["source_id"] = None

    if "due_at" in updates:
        updates["due_at"] = coerce_utc(updates["due_at"])
    if "severity" in updates and updates["severity"] is not None:
        updates["severity"] = updates["severity"].value
    if "source_type" in updates and updates["source_type"] is not None:
        updates["source_type"] = updates["source_type"].value

    changes = build_change_set(issue, updates)
    for key, value in updates.items():
        setattr(issue, key, value)
    db.add(issue)
    await db.flush()

    source_link = None
    source_link_created = False
    if "source_type" in updates or "source_id" in updates:
        await clear_issue_source_links(db, issue_id=issue.id)
        resolved_source = await resolve_issue_source_metadata(
            db,
            current_user,
            source_type=issue.source_type,
            source_id=issue.source_id,
        )
        if resolved_source is not None:
            source_link_result = await ensure_issue_source_link(
                db,
                issue_id=issue.id,
                link_values=resolved_source.link_values,
                is_source_link=True,
            )
            if source_link_result is not None:
                source_link, source_link_created = source_link_result
        db.expire(issue, ["links"])

    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue.title,
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=issue.department_id,
        changes=changes,
    )
    if source_link is not None and source_link_created:
        await log_activity(
            db,
            entity_type=ActivityEntityType.ISSUE,
            entity_id=issue.id,
            entity_name=issue.title,
            action=ActivityAction.LINK,
            actor=current_user,
            department_id=issue.department_id,
            changes={"link_id": {"old": None, "new": source_link.id}},
            description=f"Linked issue source to issue {issue.title}",
        )

    await db.commit()
    reloaded_issue = await get_issue_with_relations(db, issue.id)
    if reloaded_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    response = await serialize_issue_read_for_actor(db, current_user=current_user, issue=reloaded_issue)
    return IssueWorkflowOutcome(response=response)
