from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.audit._emit import emit_adapter
from app.core.audit.changes import resolve_audit_changes
from app.core.audit.labels import safe_entity_label
from app.core.audit.types import AuditLogActivity
from app.models import Issue, IssueException, IssueLink, IssueRemediationPlan, User
from app.models.activity_log import ActivityAction, ActivityEntityType


def issue_display_name(issue: Issue) -> str:
    return f"{safe_entity_label('ISSUE', issue.id)}: {issue.title}"


async def issue_created(
    db: AsyncSession,
    *,
    actor: User,
    issue: Issue,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue_display_name(issue),
        safe_entity_label=safe_entity_label("ISSUE", issue.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=issue.department_id,
        log_activity_func=log_activity_func,
    )


async def issue_updated(
    db: AsyncSession,
    *,
    actor: User,
    issue: Issue,
    changes: dict[str, dict[str, object]] | None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue_display_name(issue),
        safe_entity_label=safe_entity_label("ISSUE", issue.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=issue.department_id,
        changes=changes,
        description=description,
        log_activity_func=log_activity_func,
    )


async def issue_status_changed(
    db: AsyncSession,
    *,
    actor: User,
    issue: Issue,
    changes: dict[str, dict[str, object]] | None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue_display_name(issue),
        safe_entity_label=safe_entity_label("ISSUE", issue.id),
        action=ActivityAction.STATUS_CHANGE,
        actor=actor,
        department_id=issue.department_id,
        changes=changes,
        description=description,
        log_activity_func=log_activity_func,
    )


async def issue_assigned(
    db: AsyncSession,
    *,
    actor: User,
    issue: Issue,
    changes: dict[str, dict[str, object]] | None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await issue_updated(
        db,
        actor=actor,
        issue=issue,
        changes=changes,
        before_data=before_data,
        after_data=after_data,
        description="Issue assignment updated",
        log_activity_func=log_activity_func,
    )


async def issue_linked(
    db: AsyncSession,
    *,
    actor: User,
    issue: Issue,
    link: IssueLink | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue_display_name(issue),
        safe_entity_label=safe_entity_label("ISSUE", issue.id),
        action=ActivityAction.LINK,
        actor=actor,
        department_id=issue.department_id,
        changes={"link_id": {"old": None, "new": link.id}} if link else None,
        description=description,
        log_activity_func=log_activity_func,
    )


async def issue_unlinked(
    db: AsyncSession,
    *,
    actor: User,
    issue: Issue,
    link: IssueLink | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=issue.id,
        entity_name=issue_display_name(issue),
        safe_entity_label=safe_entity_label("ISSUE", issue.id),
        action=ActivityAction.UNLINK,
        actor=actor,
        department_id=issue.department_id,
        changes={"link_id": {"old": link.id, "new": None}} if link else None,
        description=description,
        log_activity_func=log_activity_func,
    )


async def issue_remediation_created(
    db: AsyncSession,
    *,
    actor: User,
    issue: Issue,
    plan: IssueRemediationPlan,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ISSUE_REMEDIATION,
        entity_id=plan.id,
        entity_name=issue_display_name(issue),
        safe_entity_label=safe_entity_label("ISSUE-REM", plan.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=issue.department_id,
        log_activity_func=log_activity_func,
    )


async def issue_remediation_updated(
    db: AsyncSession,
    *,
    actor: User,
    issue: Issue,
    plan: IssueRemediationPlan,
    changes: dict[str, dict[str, object]] | None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ISSUE_REMEDIATION,
        entity_id=plan.id,
        entity_name=issue_display_name(issue),
        safe_entity_label=safe_entity_label("ISSUE-REM", plan.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=issue.department_id,
        changes=changes,
        description=description,
        log_activity_func=log_activity_func,
    )


async def issue_remediation_status_changed(
    db: AsyncSession,
    *,
    actor: User,
    issue: Issue,
    plan: IssueRemediationPlan,
    changes: dict[str, dict[str, object]] | None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ISSUE_REMEDIATION,
        entity_id=plan.id,
        entity_name=issue_display_name(issue),
        safe_entity_label=safe_entity_label("ISSUE-REM", plan.id),
        action=ActivityAction.STATUS_CHANGE,
        actor=actor,
        department_id=issue.department_id,
        changes=changes,
        description=description,
        log_activity_func=log_activity_func,
    )


async def issue_exception_created(
    db: AsyncSession,
    *,
    actor: User,
    issue: Issue,
    exception: IssueException,
    changes: dict[str, dict[str, object]] | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ISSUE_EXCEPTION,
        entity_id=exception.id,
        entity_name=issue_display_name(issue),
        safe_entity_label=safe_entity_label("ISSUE-EXC", exception.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=issue.department_id,
        changes=changes,
        description=description,
        log_activity_func=log_activity_func,
    )


async def issue_exception_updated(
    db: AsyncSession,
    *,
    actor: User,
    issue: Issue,
    exception: IssueException,
    changes: dict[str, dict[str, object]] | None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ISSUE_EXCEPTION,
        entity_id=exception.id,
        entity_name=issue_display_name(issue),
        safe_entity_label=safe_entity_label("ISSUE-EXC", exception.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=issue.department_id,
        changes=changes,
        description=description,
        log_activity_func=log_activity_func,
    )


async def issue_exception_approved(
    db: AsyncSession,
    *,
    actor: User,
    issue: Issue,
    exception: IssueException,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ISSUE_EXCEPTION,
        entity_id=exception.id,
        entity_name=issue_display_name(issue),
        safe_entity_label=safe_entity_label("ISSUE-EXC", exception.id),
        action=ActivityAction.APPROVE,
        actor=actor,
        department_id=issue.department_id,
        changes=changes,
        log_activity_func=log_activity_func,
    )


async def issue_exception_status_changed(
    db: AsyncSession,
    *,
    actor: User,
    issue: Issue,
    exception: IssueException,
    changes: dict[str, dict[str, object]] | None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.ISSUE_EXCEPTION,
        entity_id=exception.id,
        entity_name=issue_display_name(issue),
        safe_entity_label=safe_entity_label("ISSUE-EXC", exception.id),
        action=ActivityAction.STATUS_CHANGE,
        actor=actor,
        department_id=issue.department_id,
        changes=changes,
        description=description,
        log_activity_func=log_activity_func,
    )
