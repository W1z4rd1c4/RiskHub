from types import SimpleNamespace

import pytest

from app.services._approval_execution import resolution


@pytest.mark.asyncio
async def test_finalize_approval_resolution_enqueues_after_before_commit(monkeypatch):
    db = _FakeDb()
    approval = SimpleNamespace(id=7, status=SimpleNamespace(value="approved"))
    enqueued_payloads: list[dict] = []

    async def before_commit() -> None:
        approval.status = SimpleNamespace(value="rejected")

    async def fake_enqueue(*args, **kwargs) -> None:
        enqueued_payloads.append(kwargs)

    monkeypatch.setattr(resolution.OutboxService, "enqueue", fake_enqueue)

    await resolution.finalize_approval_resolution(
        db,
        approval=approval,
        event_type="approval.request_resolved",
        idempotency_key=lambda: f"approval.request_resolved:{approval.id}:{approval.status.value}",
        payload=lambda: {"approval_id": approval.id, "approved": approval.status.value == "approved"},
        before_commit=before_commit,
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
async def test_finalize_approval_resolution_rolls_back_when_outbox_fails(monkeypatch):
    db = _FakeDb()
    approval = SimpleNamespace(id=9)

    async def fake_enqueue(*args, **kwargs) -> None:
        raise RuntimeError("outbox unavailable")

    monkeypatch.setattr(resolution.OutboxService, "enqueue", fake_enqueue)

    with pytest.raises(RuntimeError, match="outbox unavailable"):
        await resolution.finalize_approval_resolution(
            db,
            approval=approval,
            event_type="approval.request_cancelled",
            idempotency_key="approval.request_cancelled:9",
            payload={"approval_id": 9},
        )

    assert db.commits == 0
    assert db.rollbacks == 1


class _FakeDb:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1
