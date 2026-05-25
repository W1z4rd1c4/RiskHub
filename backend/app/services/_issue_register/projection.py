from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Issue, User
from app.schemas.issue import IssueCapabilities, IssueRead, IssueSummary
from app.services._issue_register.linked_context import build_issue_linked_visibility
from app.services._issue_register.serialization import (
    _serialize_issue_read,
    _serialize_issue_summary,
)
from app.services.authorization_capabilities import issue_capabilities, preload_issue_capabilities

IssueCapabilityLoader = Callable[..., Awaitable[IssueCapabilities]]
IssueCapabilityPreloader = Callable[..., Awaitable[Mapping[int, IssueCapabilities]]]


async def serialize_issue_summaries_for_actor(
    db: AsyncSession,
    *,
    current_user: User,
    issues: Sequence[Issue],
    capability_loader: IssueCapabilityLoader | None = None,
    capability_preloader: IssueCapabilityPreloader | None = None,
) -> list[IssueSummary]:
    linked_visibility = await build_issue_linked_visibility(db, current_user, issues)
    if capability_loader is not None and capability_preloader is None:
        load_capabilities = capability_loader
        capabilities_by_issue_id = {
            issue.id: await load_capabilities(db, current_user=current_user, issue=issue) for issue in issues
        }
    else:
        load_capability_batch = capability_preloader or preload_issue_capabilities
        capabilities_by_issue_id = dict(
            await load_capability_batch(db, current_user=current_user, issues=issues)
        )

    items: list[IssueSummary] = []
    for issue in issues:
        items.append(
            _serialize_issue_summary(
                issue,
                current_user=current_user,
                capabilities=capabilities_by_issue_id[issue.id],
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
