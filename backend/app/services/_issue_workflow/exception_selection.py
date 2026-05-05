from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import IssueException
from app.models.issue import IssueExceptionStatus
from app.services._issue_workflow.contracts import IssueExceptionSelection


async def select_exception_for_approval(
    db: AsyncSession,
    *,
    issue_id: int,
    exception_id: int | None,
) -> IssueExceptionSelection:
    if exception_id is not None:
        exception = (
            await db.execute(
                select(IssueException).where(
                    IssueException.id == exception_id,
                    IssueException.issue_id == issue_id,
                )
            )
        ).scalar_one_or_none()
        return IssueExceptionSelection(exception=exception)

    exception = (
        (
            await db.execute(
                select(IssueException)
                .where(
                    IssueException.issue_id == issue_id,
                    IssueException.status == IssueExceptionStatus.requested.value,
                )
                .order_by(IssueException.created_at.desc())
            )
        )
        .scalars()
        .first()
    )
    return IssueExceptionSelection(exception=exception)


async def select_exception_for_revocation(
    db: AsyncSession,
    *,
    issue_id: int,
    exception_id: int | None,
) -> IssueExceptionSelection:
    if exception_id is not None:
        exception = (
            await db.execute(
                select(IssueException).where(
                    IssueException.id == exception_id,
                    IssueException.issue_id == issue_id,
                )
            )
        ).scalar_one_or_none()
        return IssueExceptionSelection(exception=exception)

    now = utc_now()
    exception = (
        (
            await db.execute(
                select(IssueException)
                .where(
                    IssueException.issue_id == issue_id,
                    IssueException.status == IssueExceptionStatus.approved.value,
                    IssueException.expires_at.is_not(None),
                    IssueException.expires_at > now,
                )
                .order_by(IssueException.approved_at.desc(), IssueException.created_at.desc())
            )
        )
        .scalars()
        .first()
    )
    return IssueExceptionSelection(exception=exception)
