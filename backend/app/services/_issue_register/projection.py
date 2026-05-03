from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.services._issue_register.serialization import (
    _serialize_issue_read,
    _serialize_issue_summary,
    build_issue_linked_visibility,
)
from app.models import Issue, User
from app.schemas.issue import IssueCapabilities, IssueRead, IssueSummary
from app.services.authorization_capabilities import issue_capabilities

IssueCapabilityLoader = Callable[..., Awaitable[IssueCapabilities]]


async def serialize_issue_summaries_for_actor(
    db: AsyncSession,
    *,
    current_user: User,
    issues: Sequence[Issue],
    capability_loader: IssueCapabilityLoader | None = None,
) -> list[IssueSummary]:
    linked_visibility = await build_issue_linked_visibility(db, current_user, issues)
    load_capabilities = capability_loader or issue_capabilities
    items: list[IssueSummary] = []
    for issue in issues:
        capabilities = await load_capabilities(db, current_user=current_user, issue=issue)
        items.append(
            _serialize_issue_summary(
                issue,
                current_user=current_user,
                capabilities=capabilities,
                linked_visibility=linked_visibility,
            )
        )
    return items


async def serialize_issue_read_for_actor(
    db: AsyncSession,
    *,
    current_user: User,
    issue: Issue,
) -> IssueRead:
    linked_visibility = await build_issue_linked_visibility(db, current_user, [issue])
    capabilities = await issue_capabilities(db, current_user=current_user, issue=issue)
    return _serialize_issue_read(
        issue,
        current_user=current_user,
        capabilities=capabilities,
        linked_visibility=linked_visibility,
    )
