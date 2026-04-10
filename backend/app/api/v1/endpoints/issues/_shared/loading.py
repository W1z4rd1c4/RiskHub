from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import can_read_issue_id, can_write_issue_id
from app.models import (
    Control,
    ControlExecution,
    ControlRiskLink,
    Issue,
    IssueException,
    IssueLink,
    IssueRemediationPlan,
    KeyRiskIndicator,
    User,
)


async def _get_issue_with_relations(db: AsyncSession, issue_id: int) -> Issue | None:
    issue_result = await db.execute(
        select(Issue)
        .options(
            selectinload(Issue.department),
            selectinload(Issue.owner),
            selectinload(Issue.created_by),
            selectinload(Issue.links).selectinload(IssueLink.risk),
            selectinload(Issue.links)
            .selectinload(IssueLink.control)
            .selectinload(Control.risk_links)
            .selectinload(ControlRiskLink.risk),
            selectinload(Issue.links)
            .selectinload(IssueLink.execution)
            .selectinload(ControlExecution.control)
            .selectinload(Control.risk_links)
            .selectinload(ControlRiskLink.risk),
            selectinload(Issue.links).selectinload(IssueLink.kri).selectinload(KeyRiskIndicator.risk),
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
