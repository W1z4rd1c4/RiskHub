from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalRequest
from app.services.outbox import OutboxService

TValue = TypeVar("TValue")
DeferredValue = TValue | Callable[[], TValue]
BeforeCommit = Callable[[], Awaitable[None]]


@dataclass(frozen=True)
class ApprovalResolutionEventPlan:
    event_type: DeferredValue[str]
    idempotency_key: DeferredValue[str]
    payload: DeferredValue[dict[str, Any]]


def _resolve_value(value: DeferredValue[TValue]) -> TValue:
    if callable(value):
        return value()
    return value


def _status_value(approval: ApprovalRequest) -> str:
    return str(approval.status.value)


def approval_resolved_event_plan(approval: ApprovalRequest) -> ApprovalResolutionEventPlan:
    return ApprovalResolutionEventPlan(
        event_type="approval.request_resolved",
        idempotency_key=lambda: f"approval.request_resolved:{approval.id}:{_status_value(approval).lower()}",
        payload=lambda: {
            "approval_id": approval.id,
            "approved": _status_value(approval).lower() == "approved",
        },
    )


def approval_cancelled_event_plan(approval: ApprovalRequest, *, cancelled_by_user_id: int) -> ApprovalResolutionEventPlan:
    return ApprovalResolutionEventPlan(
        event_type="approval.request_cancelled",
        idempotency_key=lambda: f"approval.request_cancelled:{approval.id}",
        payload=lambda: {"approval_id": approval.id, "cancelled_by_user_id": cancelled_by_user_id},
    )


def approval_escalated_event_plan(approval: ApprovalRequest) -> ApprovalResolutionEventPlan:
    return ApprovalResolutionEventPlan(
        event_type="approval.request_created",
        idempotency_key=lambda: f"approval.request_created:{approval.id}:{_status_value(approval).lower()}",
        payload=lambda: {"approval_id": approval.id},
    )


async def finalize_approval_resolution(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    event_type: DeferredValue[str],
    idempotency_key: DeferredValue[str],
    payload: DeferredValue[dict[str, Any]],
    before_commit: BeforeCommit | None = None,
    outbox_service: type[OutboxService] | None = None,
) -> None:
    try:
        if before_commit is not None:
            await before_commit()

        resolved_outbox_service = outbox_service or OutboxService
        await resolved_outbox_service.enqueue(
            db=db,
            event_type=_resolve_value(event_type),
            aggregate_type="approval_request",
            aggregate_id=approval.id,
            idempotency_key=_resolve_value(idempotency_key),
            payload=_resolve_value(payload),
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise


async def finalize_approval_resolution_plan(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    plan: ApprovalResolutionEventPlan,
    before_commit: BeforeCommit | None = None,
    outbox_service: type[OutboxService] | None = None,
) -> None:
    await finalize_approval_resolution(
        db,
        approval=approval,
        event_type=plan.event_type,
        idempotency_key=plan.idempotency_key,
        payload=plan.payload,
        before_commit=before_commit,
        outbox_service=outbox_service,
    )
