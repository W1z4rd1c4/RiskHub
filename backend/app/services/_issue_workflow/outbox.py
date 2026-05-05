from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.services._issue_workflow.contracts import IssueOutboxPlan
from app.services.outbox import OutboxService


async def enqueue_issue_outbox(db: AsyncSession, plan) -> None:
    await OutboxService.enqueue(
        db,
        event_type=plan.event_type,
        aggregate_type=plan.aggregate_type,
        aggregate_id=plan.aggregate_id,
        idempotency_key=plan.idempotency_key,
        payload=plan.payload,
    )


def issue_assigned_outbox_plan(*, issue, owner_user_id: int, actor_id: int) -> IssueOutboxPlan:
    return IssueOutboxPlan(
        event_type="issue.assigned",
        aggregate_type="issue",
        aggregate_id=issue.id,
        idempotency_key=f"issue:{issue.id}:assigned:{owner_user_id}:{actor_id}",
        payload={
            "issue_id": issue.id,
            "owner_user_id": owner_user_id,
            "actor_user_id": actor_id,
        },
    )


def issue_exception_requested_outbox_plan(*, issue, exception, actor_id: int) -> IssueOutboxPlan:
    return IssueOutboxPlan(
        event_type="issue.exception_requested",
        aggregate_type="issue_exception",
        aggregate_id=exception.id,
        idempotency_key=f"issue:{issue.id}:exception-requested:{exception.id}",
        payload={
            "issue_id": issue.id,
            "actor_user_id": actor_id,
        },
    )


def issue_exception_approved_outbox_plan(*, issue, approved, actor_id: int) -> IssueOutboxPlan:
    return IssueOutboxPlan(
        event_type="issue.exception_approved",
        aggregate_type="issue_exception",
        aggregate_id=approved.id,
        idempotency_key=f"issue:{issue.id}:exception-approved:{approved.id}",
        payload={
            "issue_id": issue.id,
            "requested_by_id": approved.requested_by_id,
            "owner_user_id": issue.owner_user_id,
            "actor_user_id": actor_id,
        },
    )
