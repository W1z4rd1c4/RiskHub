from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.exceptions import ConflictError
from app.models import (
    ActivityLog,
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    OutboxEvent,
    Risk,
)
from app.models.activity_log import ActivityEntityType
from app.services import approval_intake
from app.services.transaction_boundary import commit_service_boundary, defer_service_boundary_commits


class RecordingSession:
    def __init__(self):
        self.calls = []
        self.failure_stage = None
        self.failure = RuntimeError("injected intake failure")
        self.rollback_failure = False

    def record(self, stage):
        self.calls.append(stage)
        if stage == self.failure_stage:
            raise self.failure

    def add(self, value):
        self.record("add")

    async def flush(self):
        self.record("flush")

    async def commit(self):
        self.record("commit")

    async def rollback(self):
        self.calls.append("rollback")
        if self.rollback_failure:
            raise RuntimeError("secondary rollback failure")


@pytest.fixture
def intake_call(monkeypatch):
    session = RecordingSession()
    approval = SimpleNamespace(id=42, status=ApprovalStatus.PENDING)
    actor = SimpleNamespace(id=7)

    async def audit(db, **kwargs):
        assert db is session
        assert kwargs == {"actor": actor, "approval": approval, "department_id": 3}
        session.record("audit")

    async def enqueue(db, **kwargs):
        assert db is session
        assert kwargs == {
            "event_type": "approval.request_created",
            "aggregate_type": "approval_request",
            "aggregate_id": 42,
            "idempotency_key": "approval.request_created:42:pending",
            "payload": {"approval_id": 42},
        }
        session.record("outbox")

    monkeypatch.setattr(approval_intake, "approval_created", audit)
    monkeypatch.setattr(approval_intake.OutboxService, "enqueue", enqueue)

    async def invoke():
        return await approval_intake.create_approval_request_with_audit(
            session, approval=approval, actor=actor, department_id=3, on_duplicate_detail="already pending"
        )

    return session, approval, invoke


@pytest.mark.asyncio
async def test_intake_commits_approval_audit_and_outbox_once(intake_call, monkeypatch):
    session, approval, invoke = intake_call
    boundary = AsyncMock(wraps=approval_intake.commit_service_boundary)
    monkeypatch.setattr(approval_intake, "commit_service_boundary", boundary)
    assert await invoke() is approval
    assert session.calls == ["add", "flush", "audit", "outbox", "commit"]
    boundary.assert_awaited_once_with(session, boundary="approval_request_intake")


@pytest.mark.asyncio
async def test_intake_defers_into_outer_boundary_and_restores_commit_behavior(intake_call):
    session, approval, invoke = intake_call
    with defer_service_boundary_commits(session):
        assert await invoke() is approval
    assert session.calls == ["add", "flush", "audit", "outbox", "flush"]
    await commit_service_boundary(session, boundary="outer_intake_test")
    assert session.calls[-1] == "commit"
    assert session.calls.count("commit") == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("stage", ["flush", "audit", "outbox", "commit"])
@pytest.mark.parametrize("rollback_failure", [False, True])
async def test_intake_failures_roll_back_once_and_keep_original_error(intake_call, stage, rollback_failure):
    session, _, invoke = intake_call
    session.failure_stage = stage
    session.rollback_failure = rollback_failure
    with pytest.raises(RuntimeError) as error:
        await invoke()
    assert error.value is session.failure
    assert session.calls[-1] == "rollback"
    assert session.calls.count("rollback") == 1
    assert session.calls.count("commit") == int(stage == "commit")


@pytest.mark.asyncio
@pytest.mark.parametrize("stage", ["flush", "commit"])
@pytest.mark.parametrize("constraint", ["ux_approval_pending", "ux_outbox_idempotency"])
async def test_intake_translates_only_pending_approval_conflicts(intake_call, stage, constraint):
    session, _, invoke = intake_call
    session.failure_stage = stage
    session.failure = IntegrityError("INSERT", {}, Exception(constraint))
    expected = ConflictError if constraint == "ux_approval_pending" else IntegrityError
    with pytest.raises(expected) as error:
        await invoke()
    if expected is ConflictError:
        assert error.value.detail == "already pending"
        assert error.value.__cause__ is session.failure
    else:
        assert error.value is session.failure
    assert session.calls.count("rollback") == 1


@pytest.mark.asyncio
async def test_intake_cancellation_during_staging_rolls_back(intake_call):
    session, _, invoke = intake_call
    session.failure_stage = "audit"
    session.failure = asyncio.CancelledError()
    with pytest.raises(asyncio.CancelledError):
        await invoke()
    assert session.calls == ["add", "flush", "audit", "rollback"]


@pytest.mark.asyncio
@pytest.mark.parametrize("completion", ["commit", "deferred_flush"])
@pytest.mark.parametrize("rollback_failure", [False, True])
async def test_intake_completion_cancellation_rolls_back_once_and_preserves_cancellation(
    intake_call, monkeypatch, completion, rollback_failure
):
    session, _, invoke = intake_call
    session.failure = asyncio.CancelledError("intake completion cancelled")
    session.rollback_failure = rollback_failure

    if completion == "commit":
        session.failure_stage = "commit"
        with pytest.raises(asyncio.CancelledError) as error:
            await invoke()
        expected_completion = "commit"
    else:
        original_flush = session.flush

        async def cancel_second_flush():
            if session.calls.count("flush") == 1:
                session.failure_stage = "flush"
            await original_flush()

        monkeypatch.setattr(session, "flush", cancel_second_flush)
        with pytest.raises(asyncio.CancelledError) as error:
            with defer_service_boundary_commits(session):
                await invoke()
        expected_completion = "flush"

    assert error.value is session.failure
    assert session.calls == ["add", "flush", "audit", "outbox", expected_completion, "rollback"]
    assert session.calls.count("rollback") == 1


@pytest.mark.asyncio
async def test_intake_deferred_completion_failure_rolls_back_without_commit(intake_call, monkeypatch):
    session, _, invoke = intake_call
    original_flush = session.flush

    async def fail_second_flush():
        if session.calls.count("flush") == 1:
            session.failure_stage = "flush"
        await original_flush()

    monkeypatch.setattr(session, "flush", fail_second_flush)
    with pytest.raises(RuntimeError):
        with defer_service_boundary_commits(session):
            await invoke()
    assert session.calls == ["add", "flush", "audit", "outbox", "flush", "rollback"]


@pytest.mark.asyncio
@pytest.mark.parametrize("dialect", ["sqlite", pytest.param("postgresql", marks=pytest.mark.postgres)])
@pytest.mark.parametrize("outcome", ["commit", "outer_rollback", "audit_failure", "outbox_failure", "commit_failure"])
async def test_intake_database_atomicity(
    db_session, async_engine, test_risk, test_user_employee, monkeypatch, dialect, outcome
):
    if async_engine.dialect.name != dialect:
        pytest.skip(f"{dialect} transaction contract")

    risk_id, original_name = test_risk.id, test_risk.name
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk_id,
        resource_name=original_name,
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_employee.id,
        reason="Approval intake transaction contract",
        pending_changes={"name": {"old": original_name, "new": "Atomic intake"}},
        status=ApprovalStatus.PENDING,
    )
    department_id = test_risk.department_id
    commit_spy = AsyncMock(wraps=db_session.commit)
    monkeypatch.setattr(db_session, "commit", commit_spy)
    if outcome in {"audit_failure", "outbox_failure"}:
        owner = approval_intake if outcome == "audit_failure" else approval_intake.OutboxService
        name = "approval_created" if outcome == "audit_failure" else "enqueue"
        original = getattr(owner, name)

        async def fail_after_staging(*args, **kwargs):
            await original(*args, **kwargs)
            raise RuntimeError("injected intake failure")

        monkeypatch.setattr(owner, name, fail_after_staging)
    elif outcome == "commit_failure":
        commit_spy.side_effect = RuntimeError("injected intake failure")

    async def intake():
        test_risk.name = "Atomic intake"
        await approval_intake.create_approval_request_with_audit(
            db_session, approval=approval, actor=test_user_employee, department_id=department_id
        )

    if outcome.endswith("failure"):
        with pytest.raises(RuntimeError, match="injected intake failure"):
            await intake()
    elif outcome == "outer_rollback":
        with defer_service_boundary_commits(db_session):
            await intake()
        await db_session.rollback()
    else:
        await intake()

    assert commit_spy.await_count == int(outcome in {"commit", "commit_failure"})
    async with async_sessionmaker(async_engine)() as observer:
        stored_name = await observer.scalar(select(Risk.name).where(Risk.id == risk_id))
        assert stored_name == ("Atomic intake" if outcome == "commit" else original_name)
        for model, predicate in (
            (ApprovalRequest, ApprovalRequest.resource_id == risk_id),
            (ActivityLog, ActivityLog.entity_type == ActivityEntityType.APPROVAL.value),
            (OutboxEvent, OutboxEvent.event_type == "approval.request_created"),
        ):
            count = await observer.scalar(select(func.count()).select_from(model).where(predicate))
            assert count == int(outcome == "commit"), f"unexpected persisted {model.__name__} rows"
