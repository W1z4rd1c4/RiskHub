from __future__ import annotations

from fastapi import HTTPException

from app.core.activity_logger import build_change_set, log_activity
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.issue import IssueUpdate
from app.services._issue_workflow.contracts import IssueWorkflowOutcome
from app.services._issue_workflow.loading import get_issue_with_relations, get_writable_issue_or_404
from app.services._issue_workflow.serialization import serialize_refreshed_issue
from app.services._issue_workflow.source_validation import (
    clear_issue_source_links,
    ensure_issue_source_link,
    resolve_issue_source_metadata,
)
from app.services._issue_workflow.update_plans import build_issue_update_plan


async def update_issue_detail(*, db, issue_id: int, payload: IssueUpdate, current_user) -> IssueWorkflowOutcome:
    issue = await get_writable_issue_or_404(db, issue_id, current_user)
    plan = await build_issue_update_plan(db=db, issue=issue, payload=payload, current_user=current_user)
    changes = build_change_set(issue, plan.updates)

    for key, value in plan.updates.items():
        setattr(issue, key, value)
    db.add(issue)
    await db.flush()

    source_link = None
    source_link_created = False
    if plan.source_link_requested:
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
    if await get_issue_with_relations(db, issue.id) is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return await serialize_refreshed_issue(db, issue_id=issue.id, current_user=current_user)
