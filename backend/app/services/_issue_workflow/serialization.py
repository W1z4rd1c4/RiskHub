from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import IssueException, User
from app.schemas.issue import IssueExceptionRead, IssueRead
from app.services._issue_register import serialize_issue_read_for_actor
from app.services._issue_register.serialization import (
    _active_exception,
)
from app.services._issue_register.serialization import (
    _serialize_exception_with_user_names as _register_serialize_exception_with_user_names,
)
from app.services._issue_workflow.contracts import IssueWorkflowOutcome
from app.services._issue_workflow.loading import get_issue_with_relations

active_exception = _active_exception


async def serialize_exception_with_user_names(
    db: AsyncSession,
    exception: IssueException,
) -> IssueExceptionRead:
    return await _register_serialize_exception_with_user_names(db, exception)


async def serialize_refreshed_issue(
    db: AsyncSession,
    *,
    issue_id: int,
    current_user: User,
) -> IssueWorkflowOutcome[IssueRead]:
    refreshed = await get_issue_with_relations(db, issue_id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    response = await serialize_issue_read_for_actor(db, current_user=current_user, issue=refreshed)
    return IssueWorkflowOutcome(response=response)


_serialize_exception_with_user_names = serialize_exception_with_user_names
