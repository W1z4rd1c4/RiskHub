from types import SimpleNamespace

import pytest

from app.core.datetime_utils import utc_now
from app.services._admin_telemetry import lifecycle, serialize_scheduler_run


class _FailingDb:
    async def execute(self, statement):
        raise RuntimeError("db probe failed")


class _LoggerProbe:
    def __init__(self):
        self.exception_calls = []

    def exception(self, message, *args, **kwargs):
        self.exception_calls.append((message, args, kwargs))


def test_admin_telemetry_serializes_scheduler_runs_without_route_context():
    started_at = utc_now()
    finished_at = utc_now()
    run = SimpleNamespace(
        job_name="daily_check",
        run_id="run-1",
        status="success",
        trigger_type="scheduled",
        instance_id="scheduler-1",
        scheduled_for=None,
        started_at=started_at,
        finished_at=finished_at,
        duration_ms=12,
        result_json={"ok": True},
        error_message=None,
    )

    summary = serialize_scheduler_run(run)

    assert summary.job_name == "daily_check"
    assert summary.started_at == started_at.isoformat()
    assert summary.finished_at == finished_at.isoformat()
    assert summary.result_json == {"ok": True}


@pytest.mark.asyncio
async def test_system_status_db_failure_logs_exception_with_context(monkeypatch):
    logger_probe = _LoggerProbe()
    monkeypatch.setattr(lifecycle, "logger", logger_probe, raising=False)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(process_started_at=utc_now())))

    snapshot = await lifecycle.build_system_health_snapshot(request, _FailingDb())

    assert snapshot.response.database_status == "error"
    assert len(logger_probe.exception_calls) == 1
    message, args, kwargs = logger_probe.exception_calls[0]
    assert message == "admin_telemetry.db_probe_failed"
    assert args == ()
    assert kwargs["extra"] == {
        "operation": "system_health_database_probe",
        "probe": "database_connectivity",
    }
