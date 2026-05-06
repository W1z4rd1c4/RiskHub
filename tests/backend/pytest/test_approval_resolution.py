from types import SimpleNamespace

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    OutboxEvent,
    User,
)
from app.services._approval_execution import resolution


@pytest.mark.asyncio
async def test_finalize_approval_resolution_enqueues_after_before_commit():
    db = _FakeDb()
    approval = SimpleNamespace(id=7, status=SimpleNamespace(value="approved"))
    enqueued_payloads: list[dict] = []

    async def before_commit() -> None:
        approval.status = SimpleNamespace(value="rejected")

    async def fake_enqueue(*args, **kwargs) -> None:
        enqueued_payloads.append(kwargs)

    class FakeOutboxService:
        enqueue = staticmethod(fake_enqueue)

    await resolution.finalize_approval_resolution(
        db,
        approval=approval,
        event_type="approval.request_resolved",
        idempotency_key=lambda: f"approval.request_resolved:{approval.id}:{approval.status.value}",
        payload=lambda: {"approval_id": approval.id, "approved": approval.status.value == "approved"},
        before_commit=before_commit,
        outbox_service=FakeOutboxService,
    )

    assert enqueued_payloads == [
        {
            "db": db,
            "event_type": "approval.request_resolved",
            "aggregate_type": "approval_request",
            "aggregate_id": 7,
            "idempotency_key": "approval.request_resolved:7:rejected",
            "payload": {"approval_id": 7, "approved": False},
        }
    ]
    assert db.commits == 1
    assert db.rollbacks == 0


@pytest.mark.asyncio
async def test_finalize_approval_resolution_plan_evaluates_payload_after_before_commit():
    db = _FakeDb()
    approval = SimpleNamespace(id=11, status=SimpleNamespace(value="approved"))
    enqueued_payloads: list[dict] = []

    async def before_commit() -> None:
        approval.status = SimpleNamespace(value="rejected")

    async def fake_enqueue(*args, **kwargs) -> None:
        enqueued_payloads.append(kwargs)

    class FakeOutboxService:
        enqueue = staticmethod(fake_enqueue)

    await resolution.finalize_approval_resolution_plan(
        db,
        approval=approval,
        plan=resolution.approval_resolved_event_plan(approval),
        before_commit=before_commit,
        outbox_service=FakeOutboxService,
    )

    assert enqueued_payloads == [
        {
            "db": db,
            "event_type": "approval.request_resolved",
            "aggregate_type": "approval_request",
            "aggregate_id": 11,
            "idempotency_key": "approval.request_resolved:11:rejected",
            "payload": {"approval_id": 11, "approved": False},
        }
    ]
    assert db.commits == 1
    assert db.rollbacks == 0


@pytest.mark.asyncio
async def test_finalize_approval_resolution_rolls_back_when_outbox_fails():
    db = _FakeDb()
    approval = SimpleNamespace(id=9)

    async def fake_enqueue(*args, **kwargs) -> None:
        raise RuntimeError("outbox unavailable")

    class FakeOutboxService:
        enqueue = staticmethod(fake_enqueue)

    with pytest.raises(RuntimeError, match="outbox unavailable"):
        await resolution.finalize_approval_resolution(
            db,
            approval=approval,
            event_type="approval.request_cancelled",
            idempotency_key="approval.request_cancelled:9",
            payload={"approval_id": 9},
            outbox_service=FakeOutboxService,
        )

    assert db.commits == 0
    assert db.rollbacks == 1


@pytest.mark.asyncio
async def test_finalize_approval_resolution_persists_outbox_with_real_session(
    db_session: AsyncSession,
    test_user: User,
):
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=1001,
        resource_name="Resolution Success Risk",
        action_type=ApprovalActionType.DELETE,
        requested_by_id=test_user.id,
        reason="Approval resolution success test",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)

    async def before_commit() -> None:
        approval.status = ApprovalStatus.APPROVED
        db_session.add(approval)
        await db_session.flush()

    await resolution.finalize_approval_resolution_plan(
        db_session,
        approval=approval,
        plan=resolution.approval_resolved_event_plan(approval),
        before_commit=before_commit,
    )

    await db_session.refresh(approval)
    assert approval.status == ApprovalStatus.APPROVED
    outbox_event = await db_session.scalar(
        select(OutboxEvent).where(
            OutboxEvent.event_type == "approval.request_resolved",
            OutboxEvent.aggregate_id == approval.id,
        )
    )
    assert outbox_event is not None
    assert outbox_event.payload == {"approval_id": approval.id, "approved": True}


@pytest.mark.asyncio
async def test_finalize_approval_resolution_rolls_back_real_session_when_outbox_fails(
    db_session: AsyncSession,
    test_user: User,
):
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=1002,
        resource_name="Resolution Failure Risk",
        action_type=ApprovalActionType.DELETE,
        requested_by_id=test_user.id,
        reason="Approval resolution failure test",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)

    async def before_commit() -> None:
        approval.status = ApprovalStatus.APPROVED
        db_session.add(approval)
        await db_session.flush()

    async def fail_enqueue(*args, **kwargs) -> None:
        raise RuntimeError("outbox unavailable")

    class FailingOutboxService:
        enqueue = staticmethod(fail_enqueue)

    with pytest.raises(RuntimeError, match="outbox unavailable"):
        await resolution.finalize_approval_resolution_plan(
            db_session,
            approval=approval,
            plan=resolution.approval_resolved_event_plan(approval),
            before_commit=before_commit,
            outbox_service=FailingOutboxService,
        )

    await db_session.refresh(approval)
    assert approval.status == ApprovalStatus.PENDING
    outbox_count = await db_session.scalar(
        select(func.count()).select_from(OutboxEvent).where(OutboxEvent.aggregate_id == approval.id)
    )
    assert outbox_count == 0


class _FakeDb:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1
