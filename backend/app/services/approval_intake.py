"""Service-owned approval intake transaction: approval, audit and outbox together."""

from __future__ import annotations

from asyncio import CancelledError
from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.approval import approval_created
from app.core.exceptions import ConflictError
from app.services.outbox import OutboxService
from app.services.transaction_boundary import (
    commit_service_boundary,
    rollback_service_boundary_after_failure,
)

if TYPE_CHECKING:
    from app.models import ApprovalRequest, User

BOUNDARY = "approval_request_intake"


async def create_approval_request_with_audit(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    actor: User,
    department_id: int | None,
    on_duplicate_detail: str = "An approval request is already pending for this action.",
) -> ApprovalRequest:
    """Persist intake atomically, or flush into an explicitly deferred outer unit.

    Only the pending-approval uniqueness conflict is translated; unrelated
    integrity failures (including outbox idempotency collisions) remain intact.
    The named boundary owns rollback on completion failure. Staging failures
    also roll back without allowing a secondary rollback error to mask them.
    """
    try:
        try:
            db.add(approval)
            await db.flush()
            await approval_created(
                db,
                actor=actor,
                approval=approval,
                department_id=department_id,
            )
            await OutboxService.enqueue(
                db,
                event_type="approval.request_created",
                aggregate_type="approval_request",
                aggregate_id=approval.id,
                idempotency_key=f"approval.request_created:{approval.id}:{approval.status.value.lower()}",
                payload={"approval_id": approval.id},
            )
        except BaseException:
            await rollback_service_boundary_after_failure(db, boundary=BOUNDARY)
            raise

        try:
            await commit_service_boundary(db, boundary=BOUNDARY)
        except CancelledError:
            # The shared boundary rolls back ordinary completion failures, but
            # cancellation is a BaseException and still belongs to this owner.
            await rollback_service_boundary_after_failure(db, boundary=BOUNDARY)
            raise
    except IntegrityError as error:
        if "ux_approval_pending" in str(error).lower():
            raise ConflictError(on_duplicate_detail) from error
        raise
    return approval
