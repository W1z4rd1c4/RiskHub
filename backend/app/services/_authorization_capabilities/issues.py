from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import coerce_utc, utc_now
from app.core.permissions import (
    can_access_department_id,
    can_read_issue_id,
    can_write_issue_id,
    get_issue_scope_clause,
    has_permission,
    is_platform_admin,
)
from app.models import Issue, IssueExceptionStatus, IssueRemediationStatus, IssueStatus, User
from app.schemas.issue import IssueCapabilities


def _is_active_issue_exception(exception: Any, now) -> bool:
    expires_at = coerce_utc(exception.expires_at)
    return bool(
        exception.status == IssueExceptionStatus.approved.value
        and expires_at is not None
        and expires_at > now
    )


def _build_issue_capabilities(
    *,
    current_user: User,
    issue: Issue,
    can_read: bool,
    can_write: bool,
    now: datetime,
) -> IssueCapabilities:
    active_exception = next(
        (
            exception
            for exception in (issue.exceptions or [])
            if _is_active_issue_exception(exception, now)
        ),
        None,
    )
    pending_exception = next(
        (
            exception
            for exception in (issue.exceptions or [])
            if exception.status == IssueExceptionStatus.requested.value
        ),
        None,
    )
    issue_status = getattr(issue.status, "value", issue.status)
    remediation = issue.remediation_plan
    remediation_status = getattr(remediation.status, "value", remediation.status) if remediation is not None else None
    remediation_complete = bool(
        remediation_status == IssueRemediationStatus.completed.value
        and remediation is not None
        and int(remediation.progress_percent or 0) >= 100
    )
    can_start_remediation = bool(
        can_write and issue_status in {IssueStatus.open.value, IssueStatus.triaged.value}
    )
    can_update_remediation = bool(
        can_write and issue_status in {IssueStatus.in_progress.value, IssueStatus.ready_for_validation.value}
    )
    can_mark_remediation_blocked = bool(
        can_update_remediation
        and (
            remediation_status in {IssueRemediationStatus.draft.value, IssueRemediationStatus.active.value}
            or (issue_status == IssueStatus.ready_for_validation.value and remediation_complete)
        )
    )
    can_mark_remediation_completed = bool(
        can_update_remediation
        and remediation_status in {IssueRemediationStatus.active.value, IssueRemediationStatus.blocked.value}
    )
    can_close = bool(can_write and issue_status == IssueStatus.ready_for_validation.value and remediation_complete)
    is_closed = bool(issue_status == IssueStatus.closed.value)
    can_assign_owner = bool(can_write and not is_closed)
    can_clear_owner = bool(can_write and not is_closed)
    can_link = bool(can_write and not is_closed)
    can_approve = bool(has_permission(current_user, "issues", "approve") and can_read)
    return IssueCapabilities(
        can_read=can_read,
        can_update=bool(can_write and not is_closed),
        can_change_department=bool(can_write and not is_closed and not (issue.links or [])),
        can_assign_owner=can_assign_owner,
        can_clear_owner=can_clear_owner,
        can_start_remediation=can_start_remediation,
        can_update_remediation_progress=can_update_remediation,
        can_mark_remediation_blocked=can_mark_remediation_blocked,
        can_mark_remediation_completed=can_mark_remediation_completed,
        can_request_exception=bool(can_write and not is_closed and active_exception is None),
        can_approve_exception=bool(
            can_approve
            and not is_closed
            and pending_exception is not None
            and active_exception is None
            and pending_exception.requested_by_id != current_user.id
        ),
        can_revoke_exception=bool(can_approve and active_exception is not None),
        can_close=can_close,
        can_link_risk=bool(can_link and has_permission(current_user, "risks", "read")),
        can_link_control=bool(can_link and has_permission(current_user, "controls", "read")),
        can_link_execution=bool(can_link and has_permission(current_user, "controls", "read")),
        can_link_kri=bool(can_link and has_permission(current_user, "risks", "read")),
        can_link_vendor=bool(can_link and has_permission(current_user, "vendors", "read")),
        can_unlink_entities=can_link,
        can_view_activity_history=bool(
            can_read
            and has_permission(current_user, "activity_log", "read")
            and not is_platform_admin(current_user)
        ),
        can_view_risk_contexts=bool(can_read and has_permission(current_user, "risks", "read")),
        can_view_vendor_contexts=bool(can_read and has_permission(current_user, "vendors", "read")),
        can_use_department_lookup=bool(can_write),
        can_use_owner_lookup=bool(can_write and can_access_department_id(current_user, issue.department_id)),
        is_owner=issue.owner_user_id == current_user.id,
        is_closed=is_closed,
        has_active_exception=active_exception is not None,
        has_pending_exception_request=pending_exception is not None,
    )


async def _visible_issue_ids(
    db: AsyncSession,
    *,
    current_user: User,
    issue_ids: set[int],
    include_direct_kri_reporting_owner_links: bool,
) -> set[int]:
    if not issue_ids:
        return set()

    scope_clause = await get_issue_scope_clause(
        db,
        current_user,
        include_direct_kri_reporting_owner_links=include_direct_kri_reporting_owner_links,
    )
    query = select(Issue.id).where(Issue.id.in_(issue_ids))
    if scope_clause is not None:
        query = query.where(scope_clause)
    return set((await db.execute(query)).scalars().all())


async def preload_issue_capabilities(
    db: AsyncSession,
    *,
    current_user: User,
    issues: Sequence[Issue],
) -> dict[int, IssueCapabilities]:
    issue_ids = {issue.id for issue in issues}
    can_read_ids: set[int] = set()
    can_write_ids: set[int] = set()

    if has_permission(current_user, "issues", "read"):
        can_read_ids = await _visible_issue_ids(
            db,
            current_user=current_user,
            issue_ids=issue_ids,
            include_direct_kri_reporting_owner_links=True,
        )
    if has_permission(current_user, "issues", "read") and has_permission(current_user, "issues", "write"):
        can_write_ids = await _visible_issue_ids(
            db,
            current_user=current_user,
            issue_ids=issue_ids,
            include_direct_kri_reporting_owner_links=False,
        )

    now = utc_now()
    return {
        issue.id: _build_issue_capabilities(
            current_user=current_user,
            issue=issue,
            can_read=issue.id in can_read_ids,
            can_write=issue.id in can_write_ids,
            now=now,
        )
        for issue in issues
    }


async def issue_capabilities(db: AsyncSession, *, current_user: User, issue: Issue) -> IssueCapabilities:
    can_read = await can_read_issue_id(db, current_user, issue.id)
    can_write = await can_write_issue_id(db, current_user, issue.id)
    return _build_issue_capabilities(
        current_user=current_user,
        issue=issue,
        can_read=can_read,
        can_write=can_write,
        now=utc_now(),
    )
