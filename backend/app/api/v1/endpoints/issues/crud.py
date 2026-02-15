from datetime import UTC, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import coerce_utc
from app.core.permissions import (
    can_access_department_id,
    can_read_control_id,
    can_read_kri_id,
    can_read_risk_id,
    get_issue_scope_clause,
)
from app.core.security import require_permission
from app.db.session import get_db
from app.models import (
    Control,
    ControlExecution,
    Issue,
    IssueLink,
    IssueRemediationPlan,
    KeyRiskIndicator,
    Risk,
    User,
)
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.issue import IssueRemediationStatus, IssueSeverity, IssueSourceType, IssueStatus
from app.schemas.issue import (
    IssueContextEntityTypeEnum,
    IssueContextualCreate,
    IssueCreate,
    IssueListResponse,
    IssueRead,
    IssueUpdate,
)
from app.services.issue_visibility_service import unsuppressed_issue_clause

from ._shared import (
    _ensure_owner_assignable,
    _get_issue_with_relations,
    _get_readable_issue_or_404,
    _get_writable_issue_or_404,
    _issue_link_department_ids,
    _resolve_vendor_department_and_access,
    _serialize_issue_read,
    _serialize_issue_summary,
    _validate_user_exists,
)

router = APIRouter()


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
        query = query.where(
            and_(Issue.due_at.is_not(None), Issue.due_at < now, Issue.status != IssueStatus.closed.value)
        )
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
        due_at=coerce_utc(payload.due_at),
    )
    db.add(issue)
    await db.flush()

    remediation = IssueRemediationPlan(
        issue_id=issue.id,
        status="draft",
        progress_percent=0,
        owner_user_id=payload.owner_user_id,
        target_date=coerce_utc(payload.due_at),
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

    due_at = coerce_utc(payload.due_at)
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
                    detail=(
                        "Cannot change department while links point to entities in another department; "
                        "relink/unlink first"
                    ),
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
        updates["due_at"] = coerce_utc(updates["due_at"])
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
