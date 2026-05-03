from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from httpx import AsyncClient
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.scheduler import (
    FULL_SCHEDULER_JOB_IDS,
    OPTIONAL_SCHEDULER_JOB_IDS,
    OUTBOX_ONLY_SCHEDULER_JOB_IDS,
    PostgresAdvisoryLockProvider,
    SchedulerLockProvider,
    configure_scheduler,
    execute_tracked_job,
    get_scheduler_role_status,
    start_scheduler_async,
)
from app.core.scheduler_errors import FatalSchedulerJobError
from app.core.settings import Settings
from app.models.outbox_event import OutboxEvent
from app.models.scheduler_job_run import SchedulerJobRun
from app.services.outbox.store import NON_POSTGRES_OUTBOX_SINGLE_WORKER_ERROR


def _registered_job_ids(test_scheduler: AsyncIOScheduler) -> set[str]:
    return {job.id for job in test_scheduler.get_jobs()}


def _assert_full_job_registration(job_ids: set[str]) -> None:
    required = set(FULL_SCHEDULER_JOB_IDS)
    optional = set(OPTIONAL_SCHEDULER_JOB_IDS)
    assert required.issubset(job_ids)
    assert job_ids - required <= optional


def test_scheduler_role_status_reports_leader() -> None:
    assert get_scheduler_role_status(
        scheduler_enabled=True,
        scheduler_running=True,
        lock_acquired=True,
    ) == {
        "scheduler_role": "leader",
        "scheduler_status": "leader_running",
    }


def test_scheduler_role_status_reports_follower_ready() -> None:
    assert get_scheduler_role_status(
        scheduler_enabled=True,
        scheduler_running=False,
        lock_acquired=False,
    ) == {
        "scheduler_role": "follower",
        "scheduler_status": "follower_ready",
    }


@pytest_asyncio.fixture
async def isolated_scheduler(async_engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch):
    import app.core.scheduler as scheduler_module
    import app.core.scheduler_jobs as scheduler_jobs_module

    test_scheduler = AsyncIOScheduler()
    monkeypatch.setattr(scheduler_module, "scheduler", test_scheduler)
    monkeypatch.setattr(scheduler_jobs_module, "scheduler", test_scheduler)
    monkeypatch.setenv("ENABLE_SCHEDULER", "true")
    configure_scheduler(
        async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False),
        async_engine,
    )

    yield scheduler_module

    await scheduler_module.stop_scheduler_async()


@pytest.mark.asyncio
async def test_scheduler_job_run_table_exists(async_engine: AsyncEngine) -> None:
    async with async_engine.begin() as conn:
        table_names = await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names())
        assert "scheduler_job_runs" in table_names


@pytest.mark.asyncio
async def test_scheduler_start_with_lock_acquired_starts_runtime_and_records_ownership(
    isolated_scheduler,
    async_engine: AsyncEngine,
):
    provider = SchedulerLockProvider()
    isolated_scheduler._lock_provider = None

    isolated_scheduler._resolve_lock_provider = lambda: provider

    await start_scheduler_async()

    assert isolated_scheduler.scheduler.running is True
    assert provider.lock_acquired is True
    _assert_full_job_registration(_registered_job_ids(isolated_scheduler.scheduler))

    async_session = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        runtime_rows = (
            (
                await session.execute(
                    select(SchedulerJobRun).where(
                        SchedulerJobRun.job_name == isolated_scheduler.SCHEDULER_RUNTIME_JOB_NAME
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(runtime_rows) == 1


@pytest.mark.asyncio
async def test_scheduler_outbox_only_profile_registers_only_dispatch_job_and_records_runtime(
    isolated_scheduler,
    async_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
):
    provider = SchedulerLockProvider()
    isolated_scheduler._lock_provider = None
    isolated_scheduler._resolve_lock_provider = lambda: provider
    monkeypatch.setenv("SCHEDULER_JOB_PROFILE", "outbox_only")

    await start_scheduler_async()

    assert isolated_scheduler.scheduler.running is True
    assert provider.lock_acquired is True
    assert _registered_job_ids(isolated_scheduler.scheduler) == set(OUTBOX_ONLY_SCHEDULER_JOB_IDS)

    async_session = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        runtime_rows = (
            (
                await session.execute(
                    select(SchedulerJobRun).where(
                        SchedulerJobRun.job_name == isolated_scheduler.SCHEDULER_RUNTIME_JOB_NAME
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(runtime_rows) == 1


@pytest.mark.asyncio
async def test_scheduler_stop_marks_runtime_run_stopped(
    isolated_scheduler,
    async_engine: AsyncEngine,
) -> None:
    provider = SchedulerLockProvider()
    isolated_scheduler._lock_provider = None
    isolated_scheduler._resolve_lock_provider = lambda: provider

    await start_scheduler_async()
    await isolated_scheduler.stop_scheduler_async()

    assert isolated_scheduler.scheduler.running is False
    assert provider.lock_acquired is False
    assert isolated_scheduler._runtime_run_id is None

    async_session = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        runtime_rows = (
            (
                await session.execute(
                    select(SchedulerJobRun).where(
                        SchedulerJobRun.job_name == isolated_scheduler.SCHEDULER_RUNTIME_JOB_NAME
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(runtime_rows) == 1
        assert runtime_rows[0].status == "stopped"
        assert runtime_rows[0].finished_at is not None


@pytest.mark.asyncio
async def test_scheduler_start_failure_releases_lock_and_stops_scheduler(
    isolated_scheduler,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class TrackingLockProvider(SchedulerLockProvider):
        def __init__(self) -> None:
            super().__init__()
            self.release_calls = 0

        async def release(self) -> None:
            self.release_calls += 1
            await super().release()

    provider = TrackingLockProvider()
    isolated_scheduler._lock_provider = None
    isolated_scheduler._resolve_lock_provider = lambda: provider

    async def fail_runtime_start() -> None:
        raise RuntimeError("runtime start failed")

    monkeypatch.setattr(isolated_scheduler, "_mark_runtime_started", fail_runtime_start)

    with pytest.raises(RuntimeError, match="runtime start failed"):
        await start_scheduler_async()

    await asyncio.sleep(0)

    assert isolated_scheduler.scheduler.running is False
    assert provider.lock_acquired is False
    assert provider.release_calls == 1
    assert isolated_scheduler._lock_provider is None
    assert isolated_scheduler._runtime_run_id is None


@pytest.mark.asyncio
async def test_scheduler_start_with_lock_denied_skips_runtime_start(
    isolated_scheduler,
):
    class DeniedLockProvider(SchedulerLockProvider):
        async def acquire(self) -> bool:
            self.lock_acquired = False
            return False

    isolated_scheduler._resolve_lock_provider = lambda: DeniedLockProvider()

    await start_scheduler_async()

    assert isolated_scheduler.scheduler.running is False


@pytest.mark.asyncio
async def test_scheduler_rejects_multi_worker_non_postgres_outbox_runtime(
    isolated_scheduler,
    async_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    if async_engine.dialect.name == "postgresql":
        pytest.skip("Non-Postgres runtime guard only applies outside PostgreSQL")

    monkeypatch.setenv("API_WORKERS", "2")

    with pytest.raises(RuntimeError, match=NON_POSTGRES_OUTBOX_SINGLE_WORKER_ERROR):
        await start_scheduler_async()

    assert isolated_scheduler.scheduler.running is False


@pytest.mark.asyncio
async def test_execute_tracked_job_records_success(async_engine: AsyncEngine, isolated_scheduler) -> None:
    async def successful_job() -> dict[str, int]:
        return {"processed": 3}

    await execute_tracked_job("test_success_job", successful_job)

    async_session = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        rows = (
            (await session.execute(select(SchedulerJobRun).where(SchedulerJobRun.job_name == "test_success_job")))
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].status == "succeeded"
        assert rows[0].result_json == {"processed": 3}


@pytest.mark.asyncio
async def test_execute_tracked_job_records_failure(async_engine: AsyncEngine, isolated_scheduler) -> None:
    async def failing_job() -> None:
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError, match="boom"):
        await execute_tracked_job("test_failure_job", failing_job)

    async_session = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        rows = (
            (await session.execute(select(SchedulerJobRun).where(SchedulerJobRun.job_name == "test_failure_job")))
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].status == "failed"
        assert rows[0].error_message == "boom"


@pytest.mark.asyncio
async def test_execute_tracked_job_records_expected_failure_category(
    async_engine: AsyncEngine,
    isolated_scheduler,
) -> None:
    async def failing_job() -> None:
        raise FatalSchedulerJobError("source data invalid")

    with pytest.raises(FatalSchedulerJobError, match="source data invalid"):
        await execute_tracked_job("test_expected_failure_job", failing_job)

    async_session = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        rows = (
            (
                await session.execute(
                    select(SchedulerJobRun).where(SchedulerJobRun.job_name == "test_expected_failure_job")
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].status == "failed"
        assert rows[0].error_message == "[expected:fatal] source data invalid"


@pytest.mark.asyncio
async def test_admin_jobs_status_returns_runtime_and_latest_runs(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.core.scheduler as scheduler_module

    process_started_at = datetime.now(UTC) - timedelta(minutes=10)
    monkeypatch.setattr(
        scheduler_module,
        "get_scheduler_runtime_state",
        lambda: {
            "process_role": "api",
            "instance_id": "api-instance",
            "process_started_at": process_started_at.isoformat(),
            "scheduler_enabled": False,
            "scheduler_running": False,
            "lock_provider": "noop",
            "lock_acquired": False,
            "scheduler_role": "disabled",
            "scheduler_status": "disabled",
        },
    )

    db_session.add_all(
        [
            SchedulerJobRun(
                job_name=scheduler_module.SCHEDULER_RUNTIME_JOB_NAME,
                run_id="runtime-run-id",
                status="running",
                trigger_type="startup",
                instance_id="scheduler-instance",
                started_at=datetime.now(UTC) - timedelta(minutes=5),
            ),
            SchedulerJobRun(
                job_name="kri_deadline_check",
                run_id="job-run-id",
                status="succeeded",
                trigger_type="scheduled",
                instance_id="scheduler-instance",
                started_at=datetime.now(UTC) - timedelta(minutes=4),
                finished_at=datetime.now(UTC) - timedelta(minutes=4, seconds=-1),
                duration_ms=1000,
                result_json={"processed": 2},
            ),
        ]
    )
    await db_session.commit()

    response = await client_platform_admin.get("/api/v1/admin/jobs/status")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["process_role"] == "api"
    assert payload["current_owner_instance_id"] == "scheduler-instance"
    assert payload["latest_runs"][0]["job_name"] == "kri_deadline_check"
    assert payload["latest_runs"][0]["result_json"] == {"processed": 2}


@pytest.mark.asyncio
async def test_sso_jwks_refresh_job_uses_cached_verifier(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.core.scheduler_jobs as scheduler_jobs_module

    settings = Settings(
        secret_key="test-secret-key-32-chars-minimum-value",
        auth_mode="microsoft_sso",
        entra_tenant_id="00000000-0000-0000-0000-000000000000",
        entra_client_id="11111111-1111-1111-1111-111111111111",
    )
    captured: dict[str, object] = {}

    class FakeVerifier:
        async def prefetch_signing_metadata(self) -> dict[str, object]:
            captured["prefetch_called"] = True
            return {"issuer": "issuer", "jwks_uri": "jwks", "key_count": 1}

    def fake_get_settings() -> Settings:
        return settings

    def fake_get_entra_verifier(value: Settings) -> FakeVerifier:
        captured["settings"] = value
        return FakeVerifier()

    monkeypatch.setattr("app.core.config.get_settings", fake_get_settings)
    monkeypatch.setattr("app.services.sso_token_service.get_entra_verifier", fake_get_entra_verifier)

    payload = await scheduler_jobs_module._sso_jwks_refresh_job()

    assert captured["settings"] is settings
    assert captured["prefetch_called"] is True
    assert payload == {"issuer": "issuer", "jwks_uri": "jwks", "key_count": 1}


def test_register_full_scheduler_jobs_skips_sso_jwks_refresh_without_sso_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.core.scheduler_jobs as scheduler_jobs_module

    test_scheduler = AsyncIOScheduler()
    monkeypatch.setattr(scheduler_jobs_module, "scheduler", test_scheduler)

    registered = scheduler_jobs_module.register_full_scheduler_jobs(
        Settings(
            secret_key="test-secret-key-32-chars-minimum-value",
            auth_mode="password",
        )
    )

    assert "sso_jwks_refresh" not in registered
    assert _registered_job_ids(test_scheduler) == set(FULL_SCHEDULER_JOB_IDS)


def test_register_full_scheduler_jobs_adds_sso_jwks_refresh_when_sso_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.core.scheduler_jobs as scheduler_jobs_module

    test_scheduler = AsyncIOScheduler()
    monkeypatch.setattr(scheduler_jobs_module, "scheduler", test_scheduler)

    registered = scheduler_jobs_module.register_full_scheduler_jobs(
        Settings(
            secret_key="test-secret-key-32-chars-minimum-value",
            auth_mode="microsoft_sso",
            entra_tenant_id="00000000-0000-0000-0000-000000000000",
            entra_client_id="11111111-1111-1111-1111-111111111111",
        )
    )

    assert "sso_jwks_refresh" in registered
    assert _registered_job_ids(test_scheduler) == set(FULL_SCHEDULER_JOB_IDS).union(OPTIONAL_SCHEDULER_JOB_IDS)


@pytest.mark.asyncio
async def test_admin_outbox_status_returns_queue_health_and_dispatch_state(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.core.scheduler as scheduler_module

    now = datetime.now(UTC)
    monkeypatch.setattr(
        scheduler_module,
        "get_outbox_dispatch_runtime_state",
        lambda: {
            "last_started_at": (now - timedelta(seconds=15)).isoformat(),
            "last_finished_at": (now - timedelta(seconds=10)).isoformat(),
            "last_status": "succeeded",
            "last_processed": 3,
            "last_error": None,
        },
    )

    db_session.add_all(
        [
            OutboxEvent(
                event_type="approval.request_created",
                aggregate_type="approval_request",
                aggregate_id=101,
                idempotency_key="pending-1",
                payload={"approval_request_id": 101},
                status="pending",
                available_at=now - timedelta(seconds=30),
                created_at=now - timedelta(seconds=45),
            ),
            OutboxEvent(
                event_type="issue.assigned",
                aggregate_type="issue",
                aggregate_id=202,
                idempotency_key="processing-1",
                payload={"issue_id": 202},
                status="processing",
                attempt_count=2,
                available_at=now - timedelta(seconds=20),
                created_at=now - timedelta(seconds=40),
                locked_at=now - timedelta(seconds=5),
                locked_by="scheduler-instance",
                last_error="temporary failure",
            ),
            OutboxEvent(
                event_type="questionnaire.sent",
                aggregate_type="questionnaire",
                aggregate_id=303,
                idempotency_key="dead-1",
                payload={"questionnaire_id": 303},
                status="dead_letter",
                attempt_count=10,
                available_at=now - timedelta(minutes=1),
                created_at=now - timedelta(minutes=2),
                last_error="permanent failure",
            ),
        ]
    )
    await db_session.commit()

    response = await client_platform_admin.get("/api/v1/admin/outbox/status")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["pending_count"] == 1
    assert payload["processing_count"] == 1
    assert payload["dead_letter_count"] == 1
    assert payload["oldest_pending_age_seconds"] is not None
    assert payload["last_dispatch_status"] == "succeeded"
    assert payload["last_dispatch_processed"] == 3
    assert {item["event_type"] for item in payload["recent_failures"]} == {
        "questionnaire.sent",
        "issue.assigned",
    }


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_postgres_advisory_lock_provider_enforces_single_owner(async_engine: AsyncEngine) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Postgres advisory lock test requires PostgreSQL")

    provider_one = PostgresAdvisoryLockProvider(async_engine)
    provider_two = PostgresAdvisoryLockProvider(async_engine)

    assert await provider_one.acquire() is True
    assert await provider_two.acquire() is False

    await provider_one.release()
    assert await provider_two.acquire() is True
    await provider_two.release()
