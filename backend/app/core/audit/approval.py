from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.audit._emit import emit_adapter
from app.core.audit.labels import safe_entity_label
from app.core.audit.types import AuditLogActivity
from app.models import ApprovalRequest, User
from app.models.activity_log import ActivityAction, ActivityEntityType


def approval_display_name(approval: ApprovalRequest) -> str:
    return f"{approval.resource_type.value}:{approval.resource_id}:{approval.action_type.value}"


async def approval_created(
    db: AsyncSession,
    *,
    actor: User,
    approval: ApprovalRequest,
    department_id: int | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    description = f"Created {approval.action_type.value} approval request"
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=approval_display_name(approval),
        safe_entity_label=safe_entity_label("APPROVAL", approval.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=department_id,
        description=description,
        safe_description=description,
        safe_description_siem=description,
        log_activity_func=log_activity_func,
    )


async def approval_approved(
    db: AsyncSession,
    *,
    actor: User,
    approval: ApprovalRequest,
    department_id: int | None = None,
    changes: dict[str, dict[str, object]] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    description = f"Approved {approval.action_type.value} approval request"
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=approval_display_name(approval),
        safe_entity_label=safe_entity_label("APPROVAL", approval.id),
        action=ActivityAction.APPROVE,
        actor=actor,
        department_id=department_id,
        changes=changes,
        description=description,
        safe_description=description,
        safe_description_siem=description,
        log_activity_func=log_activity_func,
    )


async def approval_rejected(
    db: AsyncSession,
    *,
    actor: User,
    approval: ApprovalRequest,
    department_id: int | None = None,
    changes: dict[str, dict[str, object]] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    description = f"Rejected {approval.action_type.value} approval request"
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=approval_display_name(approval),
        safe_entity_label=safe_entity_label("APPROVAL", approval.id),
        action=ActivityAction.REJECT,
        actor=actor,
        department_id=department_id,
        changes=changes,
        description=description,
        safe_description=description,
        safe_description_siem=description,
        log_activity_func=log_activity_func,
    )


async def approval_cancelled(
    db: AsyncSession,
    *,
    actor: User,
    approval: ApprovalRequest,
    department_id: int | None = None,
    safe_description: str | None = None,
    safe_description_siem: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    description = f"Cancelled {approval.action_type.value} approval request"
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=approval_display_name(approval),
        safe_entity_label=safe_entity_label("APPROVAL", approval.id),
        action=ActivityAction.CANCEL,
        actor=actor,
        department_id=department_id,
        description=description,
        safe_description=safe_description or description,
        safe_description_siem=safe_description_siem or safe_description or description,
        log_activity_func=log_activity_func,
    )
