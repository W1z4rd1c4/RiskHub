from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set
from app.core.audit.issue import issue_assigned, issue_remediation_updated
from app.core.datetime_utils import coerce_utc
from app.core.permissions import is_issue_owner_assignable_to_department
from app.models import Issue, User
from app.models.issue import IssueStatus

from .transitions import _ensure_issue_not_closed, _get_or_init_remediation


@dataclass(frozen=True)
class _IssueAssignmentState:
    owner_user_id: int | None
    remediation_owner_user_id: int | None
    due_at: datetime | None
    target_date: datetime | None
    status: str


@dataclass(frozen=True)
class IssueAssignmentResult:
    issue: Issue
    assignment_event_id: str | None


def _assignment_status_after(issue: Issue) -> str:
    if issue.status == IssueStatus.open.value:
        return IssueStatus.triaged.value
    return issue.status


def _assignment_state(
    *,
    owner_user_id: int | None,
    remediation_owner_user_id: int | None,
    due_at: datetime | None,
    target_date: datetime | None,
    status: str,
) -> _IssueAssignmentState:
    return _IssueAssignmentState(
        owner_user_id=owner_user_id,
        remediation_owner_user_id=remediation_owner_user_id,
        due_at=coerce_utc(due_at),
        target_date=coerce_utc(target_date),
        status=status,
    )


async def validate_user_exists(db: AsyncSession, user_id: int | None) -> None:
    if user_id is None:
        return
    exists = (await db.execute(select(User.id).where(User.id == user_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"User {user_id} not found")


async def ensure_owner_assignable(
    db: AsyncSession,
    *,
    owner_user_id: int | None,
    department_id: int,
    denied_status: int = status.HTTP_403_FORBIDDEN,
) -> None:
    if owner_user_id is None:
        return
    allowed = await is_issue_owner_assignable_to_department(
        db,
        owner_user_id=owner_user_id,
        issue_department_id=department_id,
    )
    if not allowed:
        raise HTTPException(
            status_code=denied_status,
            detail="Owner user must have global scope or belong to the issue department",
        )


async def assign_issue(
    db: AsyncSession,
    *,
    issue: Issue,
    owner_user_id: int,
    due_at: datetime,
    target_date: datetime | None,
    actor: User,
) -> IssueAssignmentResult:
    _ensure_issue_not_closed(issue, "assign")

    due_at = coerce_utc(due_at) or due_at
    target_date = coerce_utc(target_date) or due_at
    remediation = _get_or_init_remediation(issue)
    next_status = _assignment_status_after(issue)

    before_state = _assignment_state(
        owner_user_id=issue.owner_user_id,
        remediation_owner_user_id=remediation.owner_user_id,
        due_at=issue.due_at,
        target_date=remediation.target_date,
        status=issue.status,
    )
    after_state = _assignment_state(
        owner_user_id=owner_user_id,
        remediation_owner_user_id=owner_user_id,
        due_at=due_at,
        target_date=target_date,
        status=next_status,
    )
    if before_state == after_state:
        return IssueAssignmentResult(issue=issue, assignment_event_id=None)

    issue_updates: dict[str, object] = {
        "owner_user_id": owner_user_id,
        "due_at": due_at,
    }
    if issue.status != next_status:
        issue_updates["status"] = next_status

    issue_changes = build_change_set(issue, issue_updates)
    for key, value in issue_updates.items():
        setattr(issue, key, value)

    remediation_updates: dict[str, object] = {
        "owner_user_id": owner_user_id,
        "target_date": target_date,
    }
    remediation_changes = build_change_set(remediation, remediation_updates)
    for key, value in remediation_updates.items():
        setattr(remediation, key, value)

    db.add(issue)
    db.add(remediation)

    assignment_activity = await issue_assigned(db, actor=actor, issue=issue, changes=issue_changes)
    await db.flush()
    await issue_remediation_updated(
        db,
        actor=actor,
        issue=issue,
        plan=remediation,
        changes=remediation_changes,
    )
    return IssueAssignmentResult(issue=issue, assignment_event_id=f"activity:{assignment_activity.id}")
