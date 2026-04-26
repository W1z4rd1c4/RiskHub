from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.datetime_utils import coerce_utc
from app.core.permissions import can_read_control_id, can_read_kri_id, can_read_risk_id
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
from app.models.issue import IssueRemediationStatus, IssueSourceType, IssueStatus
from app.schemas.issue import IssueContextEntityTypeEnum, IssueContextualCreate, IssueRead
from app.services.authorization_capabilities import issue_capabilities

from .._shared import (
    _ensure_owner_assignable,
    _get_issue_with_relations,
    _resolve_vendor_department_and_access,
    _serialize_issue_read,
    _validate_user_exists,
)

router = APIRouter()


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
        execution_row = (
            await db.execute(
                select(ControlExecution.id, ControlExecution.control_id, Control.department_id)
                .join(Control, ControlExecution.control_id == Control.id)
                .where(ControlExecution.id == entity_id)
            )
        ).one_or_none()
        if execution_row is None or not await can_read_control_id(db, current_user, execution_row[1]):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source execution not found")
        return execution_row[2], IssueSourceType.control_execution, {"execution_id": entity_id}

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
    reloaded_issue = await _get_issue_with_relations(db, issue.id)
    if reloaded_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    capabilities = await issue_capabilities(db, current_user=current_user, issue=reloaded_issue)
    return _serialize_issue_read(reloaded_issue, current_user=current_user, capabilities=capabilities)
