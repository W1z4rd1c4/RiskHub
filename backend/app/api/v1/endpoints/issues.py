from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal, Optional

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
    can_read_vendor_id,
    can_write_issue_id,
    get_user_department_ids,
    get_issue_scope_clause,
    is_issue_owner_assignable_to_department,
)
from app.core.security import require_permission
from app.db.session import get_db
from app.models import (
    Control,
    ControlExecution,
    Department,
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
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.issue import IssueExceptionStatus, IssueRemediationStatus, IssueSeverity, IssueSourceType, IssueStatus
from app.models.notification import NotificationType
from app.models.role import RoleType
from app.models.user import AccessScope
from app.schemas.issue import (
    IssueAssignRequest,
    IssueCloseRequest,
    IssueCreate,
    IssueContextEntityTypeEnum,
    IssueContextualCreate,
    IssueDepartmentLookup,
    IssueExceptionApproveRequest,
    IssueExceptionRead,
    IssueExceptionRevokeRequest,
    IssueExceptionRequestCreate,
    IssueLinkCreate,
    IssueLinkRead,
    IssueListResponse,
    IssueProgressUpdateRequest,
    IssueRead,
    IssueRemediationPlanRead,
    IssueOwnerLookup,
    IssueStartRemediationRequest,
    IssueSummary,
    IssueUpdate,
)
from app.services.issue_workflow_service import IssueWorkflowService
from app.services.issue_visibility_service import unsuppressed_issue_clause
from app.services.notification_service import NotificationService

router = APIRouter()

UNKNOWN_USER_LABEL = "Unknown user"
UNKNOWN_DEPARTMENT_LABEL = "Unknown department"
UNKNOWN_RISK_LABEL = "Unknown risk"
UNKNOWN_CONTROL_LABEL = "Unknown control"
UNKNOWN_EXECUTION_LABEL = "Unknown execution"
UNKNOWN_KRI_LABEL = "Unknown KRI"
UNKNOWN_VENDOR_LABEL = "Unknown vendor"


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


async def _get_active_user_with_permissions(db: AsyncSession, user_id: int) -> User | None:
    return (
        await db.execute(
            select(User)
            .options(
                selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            )
            .where(User.id == user_id, User.is_active == True)
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
            User.is_active == True,
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
        requested_by_name = _label_or_fallback(await _resolve_user_name(db, exception.requested_by_id), UNKNOWN_USER_LABEL)
    approved_by_name: str | None = None
    if exception.approved_by_id is not None:
        approved_by_name = _label_or_fallback(await _resolve_user_name(db, exception.approved_by_id), UNKNOWN_USER_LABEL)
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
                _serialize_remediation(issue.remediation_plan).model_dump() if issue.remediation_plan is not None else None
            ),
            "exceptions": [_serialize_exception(exception).model_dump() for exception in issue.exceptions],
        }
    )


@router.get("/issues/lookups/departments", response_model=list[IssueDepartmentLookup])
async def list_issue_departments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> list[IssueDepartmentLookup]:
    query = select(Department).where(Department.is_active == True)
    allowed_department_ids = get_user_department_ids(current_user)
    if allowed_department_ids is not None:
        if not allowed_department_ids:
            return []
        query = query.where(Department.id.in_(allowed_department_ids))

    departments = (await db.execute(query.order_by(Department.name.asc()))).scalars().all()
    return [IssueDepartmentLookup.model_validate({"id": dept.id, "name": dept.name, "code": dept.code}) for dept in departments]


@router.get("/issues/lookups/owners", response_model=list[IssueOwnerLookup])
async def list_issue_assignable_owners(
    department_id: int = Query(..., ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> list[IssueOwnerLookup]:
    if not can_access_department_id(current_user, department_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this department")

    owners = (
        await db.execute(
            select(User)
            .join(Role, User.role_id == Role.id)
            .options(
                selectinload(User.role),
                selectinload(User.department),
            )
            .where(
                User.is_active == True,
                Role.name != RoleType.ADMIN,
                or_(
                    User.access_scope == AccessScope.GLOBAL,
                    User.department_id == department_id,
                ),
            )
            .order_by(User.name.asc(), User.id.asc())
        )
    ).scalars().all()
    return [
        IssueOwnerLookup.model_validate(
            {
                "id": owner.id,
                "name": owner.name,
                "role_name": getattr(owner.role, "display_name", None) or getattr(owner.role, "name", None),
                "department_name": getattr(owner.department, "name", None),
            }
        )
        for owner in owners
    ]


@router.get("/issues", response_model=IssueListResponse)
async def list_issues(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[IssueStatus] = None,
    severity: Optional[IssueSeverity] = None,
    severity_group: Optional[Literal["high_critical"]] = Query(None),
    owner_user_id: Optional[int] = None,
    department_id: Optional[int] = None,
    overdue: Optional[bool] = None,
    exclude_active_exceptions: bool = Query(False),
    linked_risk_id: Optional[int] = None,
    linked_control_id: Optional[int] = None,
    linked_vendor_id: Optional[int] = None,
    search: Optional[str] = Query(None),
    include_closed: bool = Query(True),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query(None),
) -> IssueListResponse:
    query = select(Issue)
    now = datetime.now(UTC)
    scope_clause = await get_issue_scope_clause(db, current_user)
    if scope_clause is not None:
        query = query.where(scope_clause)

    if department_id is not None:
        query = query.where(Issue.department_id == department_id)
    if status is not None:
        query = query.where(Issue.status == status.value)
    if severity_group == "high_critical":
        query = query.where(Issue.severity.in_((IssueSeverity.high.value, IssueSeverity.critical.value)))
    elif severity is not None:
        query = query.where(Issue.severity == severity.value)
    if owner_user_id is not None:
        query = query.where(Issue.owner_user_id == owner_user_id)
    if exclude_active_exceptions:
        query = query.where(unsuppressed_issue_clause(now))
    if not include_closed:
        query = query.where(Issue.status != IssueStatus.closed.value)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(or_(Issue.title.ilike(pattern), Issue.description.ilike(pattern)))

    if overdue is True:
        query = query.where(and_(Issue.due_at.is_not(None), Issue.due_at < now, Issue.status != IssueStatus.closed.value))
    if overdue is False:
        query = query.where(or_(Issue.due_at.is_(None), Issue.due_at >= now, Issue.status == IssueStatus.closed.value))
    if linked_risk_id is not None:
        query = query.where(Issue.id.in_(select(IssueLink.issue_id).where(IssueLink.risk_id == linked_risk_id)))
    if linked_control_id is not None:
        query = query.where(Issue.id.in_(select(IssueLink.issue_id).where(IssueLink.control_id == linked_control_id)))
    if linked_vendor_id is not None:
        query = query.where(Issue.id.in_(select(IssueLink.issue_id).where(IssueLink.vendor_id == linked_vendor_id)))

    sortable_fields = {
        "title": Issue.title,
        "severity": Issue.severity,
        "status": Issue.status,
        "opened_at": Issue.opened_at,
        "due_at": Issue.due_at,
        "updated_at": Issue.updated_at,
        "created_at": Issue.created_at,
    }
    if sort_by is not None and sort_by not in sortable_fields:
        raise HTTPException(status_code=400, detail="Invalid sort_by value")
    if sort_order is not None and sort_order not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="Invalid sort_order value")

    if sort_by is not None:
        direction = sort_order or "asc"
        order_expr = sortable_fields[sort_by].asc() if direction == "asc" else sortable_fields[sort_by].desc()
        if sort_by == "due_at":
            order_expr = order_expr.nullslast()
        query = query.order_by(order_expr, Issue.id.desc())
    else:
        query = query.order_by(Issue.opened_at.desc(), Issue.id.desc())

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    result = await db.execute(
        query.options(
            selectinload(Issue.department),
            selectinload(Issue.owner),
        )
        .offset(skip)
        .limit(limit)
    )
    issues = result.scalars().all()

    return IssueListResponse(
        items=[_serialize_issue_summary(issue) for issue in issues],
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
    await _ensure_owner_assignable(
        db,
        owner_user_id=payload.owner_user_id,
        department_id=payload.department_id,
    )

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
    return _serialize_issue_read(issue)


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


async def _resolve_contextual_entity(
    db: AsyncSession,
    current_user: User,
    *,
    entity_type: IssueContextEntityTypeEnum,
    entity_id: int,
) -> tuple[int, IssueSourceType, dict[str, int]]:
    if entity_type == IssueContextEntityTypeEnum.risk:
        row = (await db.execute(select(Risk.id, Risk.department_id).where(Risk.id == entity_id))).one_or_none()
        if row is None or not await can_read_risk_id(db, current_user, entity_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source risk not found")
        return row[1], IssueSourceType.manual, {"risk_id": entity_id}

    if entity_type == IssueContextEntityTypeEnum.control:
        row = (await db.execute(select(Control.id, Control.department_id).where(Control.id == entity_id))).one_or_none()
        if row is None or not await can_read_control_id(db, current_user, entity_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source control not found")
        return row[1], IssueSourceType.control_execution, {"control_id": entity_id}

    if entity_type == IssueContextEntityTypeEnum.execution:
        row = (
            await db.execute(
                select(ControlExecution.id, ControlExecution.control_id, Control.department_id)
                .join(Control, ControlExecution.control_id == Control.id)
                .where(ControlExecution.id == entity_id)
            )
        ).one_or_none()
        if row is None or not await can_read_control_id(db, current_user, row[1]):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source execution not found")
        return row[2], IssueSourceType.control_execution, {"execution_id": entity_id}

    if entity_type == IssueContextEntityTypeEnum.kri:
        row = (
            await db.execute(
                select(KeyRiskIndicator.id, Risk.department_id)
                .join(Risk, KeyRiskIndicator.risk_id == Risk.id)
                .where(KeyRiskIndicator.id == entity_id)
            )
        ).one_or_none()
        if row is None or not await can_read_kri_id(db, current_user, entity_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source KRI not found")
        return row[1], IssueSourceType.kri_breach, {"kri_id": entity_id}

    if entity_type == IssueContextEntityTypeEnum.vendor:
        department_id = await _resolve_vendor_department_and_access(db, current_user, entity_id)
        return department_id, IssueSourceType.manual, {"vendor_id": entity_id}

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported contextual entity type")


@router.post("/issues/contextual", response_model=IssueRead, status_code=status.HTTP_201_CREATED)
async def create_contextual_issue(
    payload: IssueContextualCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    department_id, source_type, link_values = await _resolve_contextual_entity(
        db,
        current_user,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
    )

    await _validate_user_exists(db, payload.owner_user_id)
    await _ensure_owner_assignable(
        db,
        owner_user_id=payload.owner_user_id,
        department_id=department_id,
    )

    due_at = _coerce_utc(payload.due_at)
    now = datetime.now(UTC)
    issue = Issue(
        title=payload.title,
        description=payload.description,
        severity=payload.severity.value,
        status=IssueStatus.open.value,
        source_type=source_type.value,
        source_id=payload.entity_id,
        department_id=department_id,
        owner_user_id=payload.owner_user_id,
        created_by_id=current_user.id,
        opened_at=now,
        due_at=due_at,
    )
    db.add(issue)
    await db.flush()

    remediation = IssueRemediationPlan(
        issue_id=issue.id,
        status=IssueRemediationStatus.draft.value,
        progress_percent=0,
        owner_user_id=payload.owner_user_id,
        target_date=due_at,
    )
    db.add(remediation)
    await db.flush()

    link = IssueLink(
        issue_id=issue.id,
        **link_values,
    )
    db.add(link)
    await db.flush()

    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue.title,
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=issue.department_id,
        description=f"Created contextual issue: {issue.title}",
    )
    await log_activity(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue.title,
        action=ActivityAction.LINK,
        actor=current_user,
        department_id=issue.department_id,
        changes={"link_id": {"old": None, "new": link.id}},
        description=f"Linked contextual source to issue {issue.title}",
    )

    await db.commit()
    issue = await _get_issue_with_relations(db, issue.id)
    return _serialize_issue_read(issue)


@router.get("/issues/{issue_id}", response_model=IssueRead)
async def get_issue(
    issue_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
) -> IssueRead:
    issue = await _get_readable_issue_or_404(db, issue_id, current_user)
    return _serialize_issue_read(issue)


@router.patch("/issues/{issue_id}", response_model=IssueRead)
async def update_issue(
    issue_id: int,
    payload: IssueUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueRead:
    issue = await _get_writable_issue_or_404(db, issue_id, current_user)
    updates = payload.model_dump(exclude_unset=True)

    if "status" in updates:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Use workflow endpoints to change issue status",
        )

    target_department_id = issue.department_id
    if "owner_user_id" in updates:
        await _validate_user_exists(db, updates.get("owner_user_id"))
    if "department_id" in updates:
        new_dept_id = updates.get("department_id")
        if new_dept_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="department_id cannot be null")
        if not can_access_department_id(current_user, new_dept_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this department")
        target_department_id = new_dept_id

        if new_dept_id != issue.department_id:
            link_department_ids = await _issue_link_department_ids(db, issue.id)
            if any(link_department_id != new_dept_id for link_department_id in link_department_ids):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot change department while links point to entities in another department; relink/unlink first",
                )

    if "owner_user_id" in updates:
        await _ensure_owner_assignable(
            db,
            owner_user_id=updates.get("owner_user_id"),
            department_id=target_department_id,
        )
    elif "department_id" in updates and issue.owner_user_id is not None:
        await _ensure_owner_assignable(
            db,
            owner_user_id=issue.owner_user_id,
            department_id=target_department_id,
            denied_status=status.HTTP_409_CONFLICT,
        )

    if "due_at" in updates:
        updates["due_at"] = _coerce_utc(updates["due_at"])
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
    return _serialize_issue_read(issue)


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

    if payload.vendor_id is not None:
        return await _resolve_vendor_department_and_access(db, current_user, payload.vendor_id)

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
                IssueLink.vendor_id == payload.vendor_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return _serialize_issue_link(existing)

    link = IssueLink(
        issue_id=issue.id,
        risk_id=payload.risk_id,
        control_id=payload.control_id,
        execution_id=payload.execution_id,
        kri_id=payload.kri_id,
        vendor_id=payload.vendor_id,
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
    return _serialize_issue_link(link)


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
    await _ensure_owner_assignable(
        db,
        owner_user_id=payload.owner_user_id,
        department_id=issue.department_id,
    )
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
    return _serialize_issue_read(refreshed)


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
    return _serialize_issue_read(refreshed)


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
    return _serialize_issue_read(refreshed)


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
    return await _serialize_exception_with_user_names(db, exception)


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
    return await _serialize_exception_with_user_names(db, approved)


@router.post("/issues/{issue_id}/revoke-exception", response_model=IssueExceptionRead)
async def revoke_exception(
    issue_id: int,
    payload: IssueExceptionRevokeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "approve")),
) -> IssueExceptionRead:
    issue = await _get_readable_issue_or_404(db, issue_id, current_user)

    target_exception: IssueException | None = None
    if payload.exception_id is not None:
        target_exception = (
            await db.execute(
                select(IssueException).where(IssueException.id == payload.exception_id, IssueException.issue_id == issue.id)
            )
        ).scalar_one_or_none()
    else:
        now = datetime.now(UTC)
        target_exception = (
            await db.execute(
                select(IssueException)
                .where(
                    IssueException.issue_id == issue.id,
                    IssueException.status == IssueExceptionStatus.approved.value,
                    IssueException.expires_at.is_not(None),
                    IssueException.expires_at > now,
                )
                .order_by(IssueException.approved_at.desc(), IssueException.created_at.desc())
            )
        ).scalars().first()

    if target_exception is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approved exception not found")

    revoked = await IssueWorkflowService.revoke_exception(
        db,
        issue=issue,
        exception=target_exception,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(revoked)
    return await _serialize_exception_with_user_names(db, revoked)


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
    return _serialize_issue_read(refreshed)
