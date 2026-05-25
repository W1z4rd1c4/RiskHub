from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEV_SCRIPT = REPO_ROOT / "scripts" / "dev.sh"
MAKEFILE = REPO_ROOT / "scripts" / "Makefile"


def test_dev_script_runs_schema_preflight_before_local_backend_startup() -> None:
    text = DEV_SCRIPT.read_text(encoding="utf-8")

    assert "run_schema_preflight()" in text
    assert "ensure_local_schema_ready()" in text
    assert "bootstrap_local_database()" in text
    assert '"full")' in text
    assert '"backend")' in text
    assert text.count("ensure_local_schema_ready") >= 3
    assert "ensure_local_schema_ready\n" in text
    assert "start_backend_local" in text


def test_dev_script_schema_preflight_prints_actionable_migration_command() -> None:
    text = DEV_SCRIPT.read_text(encoding="utf-8")

    assert "Database schema preflight failed." in text
    assert "Current DB revision(s):" in text
    assert "Expected app head(s):" in text
    assert "Fix:   cd backend && ./venv/bin/alembic upgrade head" in text
    assert "Detected a brand-new local database; running first-run bootstrap." in text
    assert "Bootstrapping local database (migrations + base seed)..." in text
    assert "Backend failed during startup." in text
    assert "Backend process exited before becoming ready." in text


def test_dev_script_unexpected_port_conflict_marker_is_machine_readable() -> None:
    text = DEV_SCRIPT.read_text(encoding="utf-8")

    assert "DEV_PORT_CONFLICT_UNEXPECTED_PROCESS" in text
    assert "refusing to stop unexpected process on port" in text.lower()


def test_dev_script_enables_outbox_only_scheduler_for_local_e2e_parity() -> None:
    text = DEV_SCRIPT.read_text(encoding="utf-8")

    assert "ENABLE_SCHEDULER=true" in text
    assert "SCHEDULER_JOB_PROFILE=outbox_only" in text
    assert "outbox-only scheduler for E2E notification parity" in text


def test_makefile_e2e_gate_uses_single_worker_for_shared_seed_data() -> None:
    text = MAKEFILE.read_text(encoding="utf-8")

    assert "npx playwright test --workers=1" in text


def test_makefile_postgres_ci_uses_resolved_python_runner() -> None:
    text = MAKEFILE.read_text(encoding="utf-8")

    assert "BACKEND_PYTHON" in text
    assert "backend/venv/bin/python" in text
    assert "command -v python3" in text
    assert "$$BACKEND_PYTHON -m pytest" in text
