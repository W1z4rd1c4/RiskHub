from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.issue import issue_linked, issue_unlinked
from app.core.permissions import can_read_control_id, can_read_kri_id, can_read_risk_id
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, ControlExecution, IssueLink, KeyRiskIndicator, Risk, User
from app.schemas.issue import IssueLinkCreate, IssueLinkRead
from app.services._issue_register.linked_context import issue_source_link, link_matches_issue_source
from app.services._issue_register.serialization import serialize_issue_link
from app.services._issue_register.source_mutation import resolve_vendor_department_and_access
from app.services._issue_workflow.loading import get_writable_issue_or_404
from app.services.transaction_boundary import commit_service_transaction

router = APIRouter()


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
        execution_row = (
            await db.execute(
                select(ControlExecution.id, ControlExecution.control_id, Control.department_id)
                .join(Control, ControlExecution.control_id == Control.id)
                .where(ControlExecution.id == payload.execution_id)
            )
        ).one_or_none()
        if execution_row is None or not await can_read_control_id(db, current_user, execution_row[1]):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked execution not found")
        return execution_row[2]

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
        return await resolve_vendor_department_and_access(db, current_user, payload.vendor_id)

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid link payload")


@router.post("/issues/{issue_id}/links", response_model=IssueLinkRead, status_code=status.HTTP_201_CREATED)
async def add_issue_link(
    issue_id: int,
    payload: IssueLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> IssueLinkRead:
    issue = await get_writable_issue_or_404(db, issue_id, current_user)
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
        return serialize_issue_link(existing, current_user=current_user)

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

    await issue_linked(db, actor=current_user, issue=issue, link=link)

    await commit_service_transaction(db)
    await db.refresh(link)
    return serialize_issue_link(link, current_user=current_user)


@router.delete("/issues/{issue_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_issue_link(
    issue_id: int,
    link_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
):
    issue = await get_writable_issue_or_404(db, issue_id, current_user)
    link = (
        await db.execute(select(IssueLink).where(IssueLink.id == link_id, IssueLink.issue_id == issue_id))
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue link not found")
    source_link = issue_source_link(issue)
    if link_matches_issue_source(issue, link) or (source_link is not None and source_link.id == link.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot remove the current source link; change or clear issue source metadata first",
        )

    await db.delete(link)
    await issue_unlinked(db, actor=current_user, issue=issue, link=link)
    await commit_service_transaction(db)
    return None
