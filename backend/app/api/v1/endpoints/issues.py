from __future__ import annotations

from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.activity_logger import build_change_set, log_activity
from app.core.permissions import (
    can_access_department_id,
    can_read_control_id,
    can_read_issue_id,
    can_read_kri_id,
    can_read_risk_id,
    can_write_issue_id,
    get_issue_scope_clause,
)
from app.core.security import require_permission
from app.db.session import get_db
from app.models import (
    Control,
    ControlExecution,
    Issue,
    IssueException,
    IssueLink,
    IssueRemediationPlan,
    KeyRiskIndicator,
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
)
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.issue import IssueExceptionStatus, IssueSeverity, IssueSourceType, IssueStatus
from app.models.notification import NotificationType
from app.models.user import AccessScope
from app.schemas.issue import (
    IssueAssignRequest,
    IssueCloseRequest,
    IssueCreate,
    IssueExceptionApproveRequest,
    IssueExceptionRead,
    IssueExceptionRequestCreate,
    IssueLinkCreate,
    IssueLinkRead,
    IssueListResponse,
    IssueProgressUpdateRequest,
    IssueRead,
    IssueRemediationPlanRead,
    IssueStartRemediationRequest,
    IssueSummary,
    IssueUpdate,
)
from app.services.issue_workflow_service import IssueWorkflowService
from app.services.notification_service import NotificationService

router = APIRouter()


def _coerce_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


async def _validate_user_exists(db: AsyncSession, user_id: int | None) -> None:
    if user_id is None:
        return
    exists = (await db.execute(select(User.id).where(User.id == user_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"User {user_id} not found")


async def _get_issue_with_relations(db: AsyncSession, issue_id: int) -> Issue | None:
    issue_result = await db.execute(
        select(Issue)
        .options(
            selectinload(Issue.links),
            selectinload(Issue.remediation_plan),
            selectinload(Issue.exceptions),
        )
        .where(Issue.id == issue_id)
    )
    return issue_result.scalar_one_or_none()


async def _get_readable_issue_or_404(db: AsyncSession, issue_id: int, current_user: User) -> Issue:
    issue = await _get_issue_with_relations(db, issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    if not await can_read_issue_id(db, current_user, issue_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    return issue


async def _get_writable_issue_or_404(db: AsyncSession, issue_id: int, current_user: User) -> Issue:
    issue = await _get_issue_with_relations(db, issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    if not await can_write_issue_id(db, current_user, issue_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    return issue


def _active_exception(issue: Issue) -> IssueException | None:
    now = datetime.now(UTC)
    approved = [
        ex
        for ex in issue.exceptions
        if ex.status == IssueExceptionStatus.approved.value
        and ex.expires_at is not None
        and _coerce_utc(ex.expires_at) is not None
        and _coerce_utc(ex.expires_at) > now
    ]
    if not approved:
        return None
    approved.sort(
        key=lambda ex: _coerce_utc(ex.approved_at) or _coerce_utc(ex.created_at) or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    return approved[0]


async def _notify_issue_assigned(db: AsyncSession, *, issue: Issue, owner_user_id: int, actor: User) -> None:
    if owner_user_id == actor.id:
        return
    await NotificationService.create_notification(
        db=db,
        user_id=owner_user_id,
        notification_type=NotificationType.ISSUE_ASSIGNED,
        title=f"Issue assigned: {issue.title}",
        message=f"You have been assigned issue '{issue.title}'.",
        resource_type="issue",
        resource_id=issue.id,
    )


async def _notify_exception_requested(db: AsyncSession, *, issue: Issue, actor: User) -> None:
    permission_load = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .join(RolePermission, RolePermission.role_id == Role.id)
        .join(Permission, RolePermission.permission_id == Permission.id)
        .where(
            User.is_active == True,
            User.access_scope == AccessScope.GLOBAL,
            Permission.resource.in_(("issues", "*")),
            Permission.action.in_(("approve", "*")),
        )
        .distinct()
    )
    recipients = (await db.execute(permission_load)).scalars().all()
    recipient_ids = {recipient.id for recipient in recipients}
    if issue.owner_user_id is not None:
        recipient_ids.add(issue.owner_user_id)

    for recipient_id in recipient_ids:
        if recipient_id == actor.id:
            continue
        recipient = (await db.execute(select(User).where(User.id == recipient_id, User.is_active == True))).scalar_one_or_none()
        if recipient is None:
            continue
        if not await can_read_issue_id(db, recipient, issue.id):
            continue
        await NotificationService.create_notification(
            db=db,
            user_id=recipient.id,
            notification_type=NotificationType.ISSUE_EXCEPTION_REQUESTED,
            title=f"Exception requested: {issue.title}",
            message=f"{actor.name} requested an exception for issue '{issue.title}'.",
            resource_type="issue",
            resource_id=issue.id,
        )


async def _notify_exception_approved(
    db: AsyncSession,
    *,
    issue: Issue,
    requested_by_id: int | None,
    owner_user_id: int | None,
    actor: User,
) -> None:
    recipient_ids = {uid for uid in (requested_by_id, owner_user_id) if uid and uid != actor.id}
    for user_id in recipient_ids:
        await NotificationService.create_notification(
            db=db,
            user_id=user_id,
            notification_type=NotificationType.ISSUE_EXCEPTION_APPROVED,
            title=f"Exception approved: {issue.title}",
            message=f"An exception for issue '{issue.title}' was approved by {actor.name}.",
            resource_type="issue",
            resource_id=issue.id,
        )


@router.get("/issues", response_model=IssueListResponse)
async def list_issues(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[IssueStatus] = None,
    severity: Optional[IssueSeverity] = None,
    owner_user_id: Optional[int] = None,
    department_id: Optional[int] = None,
    overdue: Optional[bool] = None,
    linked_risk_id: Optional[int] = None,
    linked_control_id: Optional[int] = None,
) -> IssueListResponse:
    query = select(Issue)
    scope_clause = await get_issue_scope_clause(db, current_user)
    if scope_clause is not None:
        query = query.where(scope_clause)

    if department_id is not None:
        query = query.where(Issue.department_id == department_id)
    if status is not None:
        query = query.where(Issue.status == status.value)
    if severity is not None:
        query = query.where(Issue.severity == severity.value)
    if owner_user_id is not None:
        query = query.where(Issue.owner_user_id == owner_user_id)
    if overdue is True:
        query = query.where(and_(Issue.due_at.is_not(None), Issue.due_at < datetime.now(UTC), Issue.status != IssueStatus.closed.value))
    if overdue is False:
        query = query.where(or_(Issue.due_at.is_(None), Issue.due_at >= datetime.now(UTC), Issue.status == IssueStatus.closed.value))
    if linked_risk_id is not None:
        query = query.where(Issue.id.in_(select(IssueLink.issue_id).where(IssueLink.risk_id == linked_risk_id)))
    if linked_control_id is not None:
        query = query.where(Issue.id.in_(select(IssueLink.issue_id).where(IssueLink.control_id == linked_control_id)))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    result = await db.execute(
        query.options(selectinload(Issue.links))
        .order_by(Issue.opened_at.desc(), Issue.id.desc())
        .offset(skip)
        .limit(limit)
    )
    issues = result.scalars().all()

    return IssueListResponse(
        items=[IssueSummary.model_validate(issue) for issue in issues],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("/issues", response_model=IssueRead, status_code=status.HTTP_201_CREATED)
async def create_issue(
    payload: IssueCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    if payload.department_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="department_id is required")
    if not can_access_department_id(current_user, payload.department_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this department")

    await _validate_user_exists(db, payload.owner_user_id)

    now = datetime.now(UTC)
    issue = Issue(
        title=payload.title,
        description=payload.description,
        severity=payload.severity.value,
        status=IssueStatus.open.value,
        source_type=payload.source_type.value,
        source_id=payload.source_id,
        department_id=payload.department_id,
        owner_user_id=payload.owner_user_id,
        created_by_id=current_user.id,
        opened_at=now,
        due_at=_coerce_utc(payload.due_at),
    )
    db.add(issue)
    await db.flush()

    remediation = IssueRemediationPlan(
        issue_id=issue.id,
        status="draft",
        progress_percent=0,
        owner_user_id=payload.owner_user_id,
        target_date=_coerce_utc(payload.due_at),
    )
    db.add(remediation)
    await db.flush()

    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue.title,
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=issue.department_id,
        description=f"Created issue: {issue.title}",
    )

    await db.commit()
    issue = await _get_issue_with_relations(db, issue.id)
    return IssueRead.model_validate(issue)


@router.get("/issues/{issue_id}", response_model=IssueRead)
async def get_issue(
    issue_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
) -> IssueRead:
    issue = await _get_readable_issue_or_404(db, issue_id, current_user)
    return IssueRead.model_validate(issue)


@router.patch("/issues/{issue_id}", response_model=IssueRead)
async def update_issue(
    issue_id: int,
    payload: IssueUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    updates = payload.model_dump(exclude_unset=True)

    if "owner_user_id" in updates:
        await _validate_user_exists(db, updates.get("owner_user_id"))
    if "department_id" in updates:
        new_dept_id = updates.get("department_id")
        if new_dept_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="department_id cannot be null")
        if not can_access_department_id(current_user, new_dept_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this department")

    if "due_at" in updates:
        updates["due_at"] = _coerce_utc(updates["due_at"])
    if "status" in updates and updates["status"] is not None:
        updates["status"] = updates["status"].value
    if "severity" in updates and updates["severity"] is not None:
        updates["severity"] = updates["severity"].value
    if "source_type" in updates and updates["source_type"] is not None:
        updates["source_type"] = updates["source_type"].value

    changes = build_change_set(issue, updates)
    for key, value in updates.items():
        setattr(issue, key, value)
    db.add(issue)

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

    await db.commit()
    issue = await _get_issue_with_relations(db, issue.id)
    return IssueRead.model_validate(issue)


async def _resolve_link_department_and_access(
    db: AsyncSession,
    current_user: User,
    payload: IssueLinkCreate,
) -> int:
    if payload.risk_id is not None:
        row = (await db.execute(select(Risk.id, Risk.department_id).where(Risk.id == payload.risk_id))).one_or_none()
        if row is None or not await can_read_risk_id(db, current_user, payload.risk_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked risk not found")
        return row[1]

    if payload.control_id is not None:
        row = (
            await db.execute(select(Control.id, Control.department_id).where(Control.id == payload.control_id))
        ).one_or_none()
        if row is None or not await can_read_control_id(db, current_user, payload.control_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked control not found")
        return row[1]

    if payload.execution_id is not None:
        row = (
            await db.execute(
                select(ControlExecution.id, ControlExecution.control_id, Control.department_id)
                .join(Control, ControlExecution.control_id == Control.id)
                .where(ControlExecution.id == payload.execution_id)
            )
        ).one_or_none()
        if row is None or not await can_read_control_id(db, current_user, row[1]):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked execution not found")
        return row[2]

    if payload.kri_id is not None:
        row = (
            await db.execute(
                select(KeyRiskIndicator.id, Risk.department_id)
                .join(Risk, KeyRiskIndicator.risk_id == Risk.id)
                .where(KeyRiskIndicator.id == payload.kri_id)
            )
        ).one_or_none()
        if row is None or not await can_read_kri_id(db, current_user, payload.kri_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked KRI not found")
        return row[1]

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid link payload")


@router.post("/issues/{issue_id}/links", response_model=IssueLinkRead, status_code=status.HTTP_201_CREATED)
async def add_issue_link(
    issue_id: int,
    payload: IssueLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueLinkRead:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    linked_department_id = await _resolve_link_department_and_access(db, current_user, payload)
    if linked_department_id != issue.department_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Linked entity department must match issue department",
        )

    existing = (
        await db.execute(
            select(IssueLink).where(
                IssueLink.issue_id == issue.id,
                IssueLink.risk_id == payload.risk_id,
                IssueLink.control_id == payload.control_id,
                IssueLink.execution_id == payload.execution_id,
                IssueLink.kri_id == payload.kri_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return IssueLinkRead.model_validate(existing)

    link = IssueLink(
        issue_id=issue.id,
        risk_id=payload.risk_id,
        control_id=payload.control_id,
        execution_id=payload.execution_id,
        kri_id=payload.kri_id,
    )
    db.add(link)
    await db.flush()

    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue.title,
        action=ActivityAction.LINK,
        actor=current_user,
        department_id=issue.department_id,
        changes={"link_id": {"old": None, "new": link.id}},
    )

    await db.commit()
    await db.refresh(link)
    return IssueLinkRead.model_validate(link)


@router.delete("/issues/{issue_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_issue_link(
    issue_id: int,
    link_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
):
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    link = (
        await db.execute(
            select(IssueLink).where(IssueLink.id == link_id, IssueLink.issue_id == issue_id)
        )
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue link not found")

    await db.delete(link)
    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue.title,
        action=ActivityAction.UNLINK,
        actor=current_user,
        department_id=issue.department_id,
        changes={"link_id": {"old": link.id, "new": None}},
    )
    await db.commit()
    return None


@router.post("/issues/{issue_id}/assign", response_model=IssueRead)
async def assign_issue(
    issue_id: int,
    payload: IssueAssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    await _validate_user_exists(db, payload.owner_user_id)
    await IssueWorkflowService.assign_issue(
        db,
        issue=issue,
        owner_user_id=payload.owner_user_id,
        due_at=payload.due_at,
        target_date=payload.target_date,
        actor=current_user,
    )
    await _notify_issue_assigned(db, issue=issue, owner_user_id=payload.owner_user_id, actor=current_user)
    await db.commit()
    refreshed = await _get_issue_with_relations(db, issue.id)
    return IssueRead.model_validate(refreshed)


@router.post("/issues/{issue_id}/start-remediation", response_model=IssueRead)
async def start_remediation(
    issue_id: int,
    payload: IssueStartRemediationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    await IssueWorkflowService.start_remediation(
        db,
        issue=issue,
        target_date=payload.target_date,
        actor=current_user,
    )
    await db.commit()
    refreshed = await _get_issue_with_relations(db, issue.id)
    return IssueRead.model_validate(refreshed)


@router.post("/issues/{issue_id}/update-progress", response_model=IssueRead)
async def update_remediation_progress(
    issue_id: int,
    payload: IssueProgressUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    remediation_status = payload.remediation_status.value if payload.remediation_status else None
    await IssueWorkflowService.update_progress(
        db,
        issue=issue,
        progress_percent=payload.progress_percent,
        remediation_status=remediation_status,
        blocker_reason=payload.blocker_reason,
        completion_notes=payload.completion_notes,
        actor=current_user,
    )
    await db.commit()
    refreshed = await _get_issue_with_relations(db, issue.id)
    return IssueRead.model_validate(refreshed)


@router.post("/issues/{issue_id}/request-exception", response_model=IssueExceptionRead, status_code=status.HTTP_201_CREATED)
async def request_exception(
    issue_id: int,
    payload: IssueExceptionRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueExceptionRead:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    exception = await IssueWorkflowService.request_exception(
        db,
        issue=issue,
        reason=payload.reason,
        actor=current_user,
    )
    await _notify_exception_requested(db, issue=issue, actor=current_user)
    await db.commit()
    await db.refresh(exception)
    return IssueExceptionRead.model_validate(exception)


@router.post("/issues/{issue_id}/approve-exception", response_model=IssueExceptionRead)
async def approve_exception(
    issue_id: int,
    payload: IssueExceptionApproveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "approve")),
) -> IssueExceptionRead:
    issue = await _get_readable_issue_or_404(db, issue_id, current_user)
    active = _active_exception(issue)
    if active is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Issue already has an active approved exception")

    target_exception: IssueException | None = None
    if payload.exception_id is not None:
        target_exception = (
            await db.execute(
                select(IssueException).where(IssueException.id == payload.exception_id, IssueException.issue_id == issue.id)
            )
        ).scalar_one_or_none()
    else:
        target_exception = (
            await db.execute(
                select(IssueException)
                .where(
                    IssueException.issue_id == issue.id,
                    IssueException.status == IssueExceptionStatus.requested.value,
                )
                .order_by(IssueException.created_at.desc())
            )
        ).scalars().first()

    if target_exception is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested exception not found")

    approved = await IssueWorkflowService.approve_exception(
        db,
        issue=issue,
        exception=target_exception,
        expires_at=payload.expires_at,
        actor=current_user,
    )
    await _notify_exception_approved(
        db,
        issue=issue,
        requested_by_id=approved.requested_by_id,
        owner_user_id=issue.owner_user_id,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(approved)
    return IssueExceptionRead.model_validate(approved)


@router.post("/issues/{issue_id}/close", response_model=IssueRead)
async def close_issue(
    issue_id: int,
    payload: IssueCloseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    await IssueWorkflowService.close_issue(
        db,
        issue=issue,
        validation_note=payload.validation_note,
        completion_notes=payload.completion_notes,
        actor=current_user,
    )
    await db.commit()
    refreshed = await _get_issue_with_relations(db, issue.id)
    return IssueRead.model_validate(refreshed)
