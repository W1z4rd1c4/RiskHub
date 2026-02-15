from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import coerce_utc
from app.core.permissions import (
    can_read_issue_id,
    can_read_vendor_id,
    can_write_issue_id,
    is_issue_owner_assignable_to_department,
)
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
    Vendor,
)
from app.models.issue import IssueExceptionStatus
from app.models.notification import NotificationType
from app.models.user import AccessScope
from app.schemas.issue import (
    IssueExceptionRead,
    IssueLinkRead,
    IssueRead,
    IssueRemediationPlanRead,
    IssueSummary,
)
from app.services.notification_service import NotificationService

UNKNOWN_USER_LABEL = "Unknown user"
UNKNOWN_DEPARTMENT_LABEL = "Unknown department"
UNKNOWN_RISK_LABEL = "Unknown risk"
UNKNOWN_CONTROL_LABEL = "Unknown control"
UNKNOWN_EXECUTION_LABEL = "Unknown execution"
UNKNOWN_KRI_LABEL = "Unknown KRI"
UNKNOWN_VENDOR_LABEL = "Unknown vendor"


async def _validate_user_exists(db: AsyncSession, user_id: int | None) -> None:
    if user_id is None:
        return
    exists = (await db.execute(select(User.id).where(User.id == user_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"User {user_id} not found")


async def _get_active_user_with_permissions(db: AsyncSession, user_id: int) -> User | None:
    return (
        await db.execute(
            select(User)
            .options(
                selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            )
            .where(User.id == user_id, User.is_active.is_(True))
        )
    ).scalar_one_or_none()


async def _ensure_owner_assignable(
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


async def _get_issue_with_relations(db: AsyncSession, issue_id: int) -> Issue | None:
    issue_result = await db.execute(
        select(Issue)
        .options(
            selectinload(Issue.department),
            selectinload(Issue.owner),
            selectinload(Issue.created_by),
            selectinload(Issue.links).selectinload(IssueLink.risk),
            selectinload(Issue.links).selectinload(IssueLink.control),
            selectinload(Issue.links).selectinload(IssueLink.execution).selectinload(ControlExecution.control),
            selectinload(Issue.links).selectinload(IssueLink.kri),
            selectinload(Issue.links).selectinload(IssueLink.vendor),
            selectinload(Issue.remediation_plan).selectinload(IssueRemediationPlan.owner),
            selectinload(Issue.exceptions).selectinload(IssueException.requested_by),
            selectinload(Issue.exceptions).selectinload(IssueException.approved_by),
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
        and coerce_utc(ex.expires_at) is not None
        and coerce_utc(ex.expires_at) > now
    ]
    if not approved:
        return None
    approved.sort(
        key=lambda ex: coerce_utc(ex.approved_at) or coerce_utc(ex.created_at) or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    return approved[0]


async def _notify_issue_assigned(db: AsyncSession, *, issue: Issue, owner_user_id: int, actor: User) -> None:
    if owner_user_id == actor.id:
        return
    recipient = await _get_active_user_with_permissions(db, owner_user_id)
    if recipient is None:
        return
    if not await can_read_issue_id(db, recipient, issue.id):
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
        select(User.id)
        .join(Role, User.role_id == Role.id)
        .join(RolePermission, RolePermission.role_id == Role.id)
        .join(Permission, RolePermission.permission_id == Permission.id)
        .where(
            User.is_active.is_(True),
            User.access_scope == AccessScope.GLOBAL,
            Permission.resource.in_(("issues", "*")),
            Permission.action.in_(("approve", "*")),
        )
        .distinct()
    )
    recipient_ids = set((await db.execute(permission_load)).scalars().all())
    if issue.owner_user_id is not None:
        recipient_ids.add(issue.owner_user_id)

    for recipient_id in recipient_ids:
        if recipient_id == actor.id:
            continue
        recipient = await _get_active_user_with_permissions(db, recipient_id)
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
        recipient = await _get_active_user_with_permissions(db, user_id)
        if recipient is None:
            continue
        if not await can_read_issue_id(db, recipient, issue.id):
            continue
        await NotificationService.create_notification(
            db=db,
            user_id=user_id,
            notification_type=NotificationType.ISSUE_EXCEPTION_APPROVED,
            title=f"Exception approved: {issue.title}",
            message=f"An exception for issue '{issue.title}' was approved by {actor.name}.",
            resource_type="issue",
            resource_id=issue.id,
        )


async def _resolve_vendor_department_and_access(
    db: AsyncSession,
    current_user: User,
    vendor_id: int,
) -> int:
    row = (
        await db.execute(
            select(Vendor.id, Vendor.department_id, User.department_id)
            .outerjoin(User, Vendor.outsourcing_owner_user_id == User.id)
            .where(Vendor.id == vendor_id)
        )
    ).one_or_none()
    if row is None or not await can_read_vendor_id(db, current_user, vendor_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked vendor not found")

    _, vendor_department_id, owner_department_id = row
    resolved_department_id = vendor_department_id or owner_department_id
    if resolved_department_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Linked vendor has no department and owner department is unresolved",
        )
    return resolved_department_id


async def _issue_link_department_ids(db: AsyncSession, issue_id: int) -> set[int]:
    department_ids: set[int] = set()

    risk_rows = await db.execute(
        select(Risk.department_id)
        .join(IssueLink, IssueLink.risk_id == Risk.id)
        .where(IssueLink.issue_id == issue_id, IssueLink.risk_id.is_not(None))
    )
    department_ids.update(dept_id for dept_id in risk_rows.scalars().all() if dept_id is not None)

    control_rows = await db.execute(
        select(Control.department_id)
        .join(IssueLink, IssueLink.control_id == Control.id)
        .where(IssueLink.issue_id == issue_id, IssueLink.control_id.is_not(None))
    )
    department_ids.update(dept_id for dept_id in control_rows.scalars().all() if dept_id is not None)

    execution_rows = await db.execute(
        select(Control.department_id)
        .join(ControlExecution, ControlExecution.control_id == Control.id)
        .join(IssueLink, IssueLink.execution_id == ControlExecution.id)
        .where(IssueLink.issue_id == issue_id, IssueLink.execution_id.is_not(None))
    )
    department_ids.update(dept_id for dept_id in execution_rows.scalars().all() if dept_id is not None)

    kri_rows = await db.execute(
        select(Risk.department_id)
        .join(KeyRiskIndicator, KeyRiskIndicator.risk_id == Risk.id)
        .join(IssueLink, IssueLink.kri_id == KeyRiskIndicator.id)
        .where(IssueLink.issue_id == issue_id, IssueLink.kri_id.is_not(None))
    )
    department_ids.update(dept_id for dept_id in kri_rows.scalars().all() if dept_id is not None)

    vendor_rows = await db.execute(
        select(func.coalesce(Vendor.department_id, User.department_id))
        .join(IssueLink, IssueLink.vendor_id == Vendor.id)
        .outerjoin(User, Vendor.outsourcing_owner_user_id == User.id)
        .where(IssueLink.issue_id == issue_id, IssueLink.vendor_id.is_not(None))
    )
    department_ids.update(dept_id for dept_id in vendor_rows.scalars().all() if dept_id is not None)

    return department_ids


def _label_or_fallback(value: str | None, fallback: str) -> str:
    if value and value.strip():
        return value.strip()
    return fallback


def _link_display(link: IssueLink) -> tuple[str | None, str | None]:
    if link.risk_id is not None:
        return "risk", _label_or_fallback(getattr(link.risk, "name", None), UNKNOWN_RISK_LABEL)
    if link.control_id is not None:
        return "control", _label_or_fallback(getattr(link.control, "name", None), UNKNOWN_CONTROL_LABEL)
    if link.execution_id is not None:
        control_name = getattr(getattr(link.execution, "control", None), "name", None)
        if control_name and control_name.strip():
            return "execution", f"Execution for {control_name.strip()}"
        return "execution", UNKNOWN_EXECUTION_LABEL
    if link.kri_id is not None:
        return "kri", _label_or_fallback(getattr(link.kri, "metric_name", None), UNKNOWN_KRI_LABEL)
    if link.vendor_id is not None:
        return "vendor", _label_or_fallback(getattr(link.vendor, "name", None), UNKNOWN_VENDOR_LABEL)
    return None, None


def _serialize_issue_link(link: IssueLink) -> IssueLinkRead:
    linked_entity_type, linked_entity_name = _link_display(link)
    return IssueLinkRead.model_validate(
        {
            "id": link.id,
            "issue_id": link.issue_id,
            "risk_id": link.risk_id,
            "control_id": link.control_id,
            "execution_id": link.execution_id,
            "kri_id": link.kri_id,
            "vendor_id": link.vendor_id,
            "linked_entity_type": linked_entity_type,
            "linked_entity_name": linked_entity_name,
            "created_at": link.created_at,
        }
    )


def _serialize_remediation(remediation: IssueRemediationPlan | None) -> IssueRemediationPlanRead | None:
    if remediation is None:
        return None
    owner_user_name: str | None = None
    if remediation.owner_user_id is not None:
        owner_user_name = _label_or_fallback(getattr(remediation.owner, "name", None), UNKNOWN_USER_LABEL)
    return IssueRemediationPlanRead.model_validate(
        {
            "id": remediation.id,
            "issue_id": remediation.issue_id,
            "status": remediation.status,
            "progress_percent": remediation.progress_percent,
            "owner_user_id": remediation.owner_user_id,
            "owner_user_name": owner_user_name,
            "target_date": remediation.target_date,
            "blocker_reason": remediation.blocker_reason,
            "completion_notes": remediation.completion_notes,
            "completed_at": remediation.completed_at,
            "created_at": remediation.created_at,
            "updated_at": remediation.updated_at,
        }
    )


def _serialize_exception(exception: IssueException) -> IssueExceptionRead:
    requested_by_name: str | None = None
    if exception.requested_by_id is not None:
        requested_by_name = _label_or_fallback(getattr(exception.requested_by, "name", None), UNKNOWN_USER_LABEL)
    approved_by_name: str | None = None
    if exception.approved_by_id is not None:
        approved_by_name = _label_or_fallback(getattr(exception.approved_by, "name", None), UNKNOWN_USER_LABEL)
    return IssueExceptionRead.model_validate(
        {
            "id": exception.id,
            "issue_id": exception.issue_id,
            "status": exception.status,
            "reason": exception.reason,
            "requested_by_id": exception.requested_by_id,
            "requested_by_name": requested_by_name,
            "approved_by_id": exception.approved_by_id,
            "approved_by_name": approved_by_name,
            "requested_at": exception.requested_at,
            "approved_at": exception.approved_at,
            "expires_at": exception.expires_at,
            "created_at": exception.created_at,
            "updated_at": exception.updated_at,
        }
    )


async def _resolve_user_name(db: AsyncSession, user_id: int | None) -> str | None:
    if user_id is None:
        return None
    return (await db.execute(select(User.name).where(User.id == user_id))).scalar_one_or_none()


async def _serialize_exception_with_user_names(db: AsyncSession, exception: IssueException) -> IssueExceptionRead:
    requested_by_name: str | None = None
    if exception.requested_by_id is not None:
        requested_by_name = _label_or_fallback(
            await _resolve_user_name(db, exception.requested_by_id), UNKNOWN_USER_LABEL
        )
    approved_by_name: str | None = None
    if exception.approved_by_id is not None:
        approved_by_name = _label_or_fallback(
            await _resolve_user_name(db, exception.approved_by_id), UNKNOWN_USER_LABEL
        )
    return IssueExceptionRead.model_validate(
        {
            "id": exception.id,
            "issue_id": exception.issue_id,
            "status": exception.status,
            "reason": exception.reason,
            "requested_by_id": exception.requested_by_id,
            "requested_by_name": requested_by_name,
            "approved_by_id": exception.approved_by_id,
            "approved_by_name": approved_by_name,
            "requested_at": exception.requested_at,
            "approved_at": exception.approved_at,
            "expires_at": exception.expires_at,
            "created_at": exception.created_at,
            "updated_at": exception.updated_at,
        }
    )


def _serialize_issue_summary(issue: Issue) -> IssueSummary:
    owner_user_name: str | None = None
    if issue.owner_user_id is not None:
        owner_user_name = _label_or_fallback(getattr(issue.owner, "name", None), UNKNOWN_USER_LABEL)
    return IssueSummary.model_validate(
        {
            "id": issue.id,
            "title": issue.title,
            "severity": issue.severity,
            "status": issue.status,
            "source_type": issue.source_type,
            "source_id": issue.source_id,
            "department_id": issue.department_id,
            "department_name": _label_or_fallback(getattr(issue.department, "name", None), UNKNOWN_DEPARTMENT_LABEL),
            "owner_user_id": issue.owner_user_id,
            "owner_user_name": owner_user_name,
            "opened_at": issue.opened_at,
            "due_at": issue.due_at,
            "closed_at": issue.closed_at,
            "created_at": issue.created_at,
            "updated_at": issue.updated_at,
        }
    )


def _serialize_issue_read(issue: Issue) -> IssueRead:
    summary = _serialize_issue_summary(issue)
    created_by_name: str | None = None
    if issue.created_by_id is not None:
        created_by_name = _label_or_fallback(getattr(issue.created_by, "name", None), UNKNOWN_USER_LABEL)
    return IssueRead.model_validate(
        {
            **summary.model_dump(),
            "description": issue.description,
            "created_by_id": issue.created_by_id,
            "created_by_name": created_by_name,
            "validation_note": issue.validation_note,
            "links": [_serialize_issue_link(link).model_dump() for link in issue.links],
            "remediation_plan": (
                _serialize_remediation(issue.remediation_plan).model_dump()
                if issue.remediation_plan is not None
                else None
            ),
            "exceptions": [_serialize_exception(exception).model_dump() for exception in issue.exceptions],
        }
    )
