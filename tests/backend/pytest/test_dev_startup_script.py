from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
DEV_SCRIPT = REPO_ROOT / "scripts" / "dev.sh"


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
