"""Safe audit adapters for immutable governed-mutation proposals."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.audit._emit import emit_adapter
from app.core.audit.labels import safe_entity_label
from app.core.audit.types import AuditLogActivity
from app.models import ApprovalRequest, User
from app.models.activity_log import ActivityAction, ActivityEntityType


class GovernedProposalAuditIdentity(Protocol):
    proposal_id: str
    proposal_version: int


AuditChanges = dict[str, dict[str, object]] | Mapping[str, object]


def _proposal_description(proposal: GovernedProposalAuditIdentity, outcome: str) -> str:
    return (
        f"Governed Process proposal {proposal.proposal_id} "
        f"v{proposal.proposal_version} {outcome}"
    )


async def proposal_submitted(
    db: AsyncSession,
    *,
    actor: User,
    approval: ApprovalRequest,
    proposal: GovernedProposalAuditIdentity,
    department_id: int | None = None,
    changes: AuditChanges | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    description = _proposal_description(proposal, "submitted")
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=f"{proposal.proposal_id}:v{proposal.proposal_version}",
        safe_entity_label=safe_entity_label("GOVPROP", approval.id),
        actor=actor,
        action=ActivityAction.CREATE,
        department_id=department_id,
        changes=changes,
        description=description,
        safe_description=description,
        safe_description_siem=description,
        log_activity_func=log_activity_func,
    )


async def proposal_applied(
    db: AsyncSession,
    *,
    actor: User,
    approval: ApprovalRequest,
    proposal: GovernedProposalAuditIdentity,
    department_id: int | None = None,
    changes: AuditChanges | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    description = _proposal_description(proposal, "applied")
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=f"{proposal.proposal_id}:v{proposal.proposal_version}",
        safe_entity_label=safe_entity_label("GOVPROP", approval.id),
        actor=actor,
        action=ActivityAction.APPROVE,
        department_id=department_id,
        changes=changes,
        description=description,
        safe_description=description,
        safe_description_siem=description,
        log_activity_func=log_activity_func,
    )


async def proposal_rejected(
    db: AsyncSession,
    *,
    actor: User,
    approval: ApprovalRequest,
    proposal: GovernedProposalAuditIdentity,
    department_id: int | None = None,
    changes: AuditChanges | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    description = _proposal_description(proposal, "rejected")
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=f"{proposal.proposal_id}:v{proposal.proposal_version}",
        safe_entity_label=safe_entity_label("GOVPROP", approval.id),
        actor=actor,
        action=ActivityAction.REJECT,
        department_id=department_id,
        changes=changes,
        description=description,
        safe_description=description,
        safe_description_siem=description,
        log_activity_func=log_activity_func,
    )


async def proposal_cancelled(
    db: AsyncSession,
    *,
    actor: User,
    approval: ApprovalRequest,
    proposal: GovernedProposalAuditIdentity,
    department_id: int | None = None,
    changes: AuditChanges | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    description = _proposal_description(proposal, "cancelled")
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=f"{proposal.proposal_id}:v{proposal.proposal_version}",
        safe_entity_label=safe_entity_label("GOVPROP", approval.id),
        actor=actor,
        action=ActivityAction.CANCEL,
        department_id=department_id,
        changes=changes,
        description=description,
        safe_description=description,
        safe_description_siem=description,
        log_activity_func=log_activity_func,
    )


async def proposal_expired(
    db: AsyncSession,
    *,
    actor: User,
    approval: ApprovalRequest,
    proposal: GovernedProposalAuditIdentity,
    department_id: int | None = None,
    changes: AuditChanges | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    description = _proposal_description(proposal, "expired")
    await emit_adapter(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=f"{proposal.proposal_id}:v{proposal.proposal_version}",
        safe_entity_label=safe_entity_label("GOVPROP", approval.id),
        actor=actor,
        action=ActivityAction.STATUS_CHANGE,
        department_id=department_id,
        changes=changes,
        description=description,
        safe_description=description,
        safe_description_siem=description,
        log_activity_func=log_activity_func,
    )


__all__ = [
    "proposal_applied",
    "proposal_cancelled",
    "proposal_expired",
    "proposal_rejected",
    "proposal_submitted",
]
