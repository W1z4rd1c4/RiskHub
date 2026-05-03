from types import SimpleNamespace

from app.core.datetime_utils import utc_now
from app.services._admin_telemetry import serialize_scheduler_run


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
