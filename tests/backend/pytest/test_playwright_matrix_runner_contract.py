import os
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine


def _fake_reset_engine(connected_database: str):
    statements: list[str] = []

    class Connection:
        async def execute(self, statement):
            statements.append(str(statement))
            return SimpleNamespace(scalar_one=lambda: connected_database)

    class ConnectionContext:
        async def __aenter__(self):
            return Connection()

        async def __aexit__(self, exc_type, exc, traceback):
            return False

    class Engine:
        def connect(self):
            return ConnectionContext()

        async def dispose(self) -> None:
            return None

    return Engine(), statements


async def _run_postgres_statement(database_url: str, statement: str) -> None:
    engine = create_async_engine(database_url, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as connection:
            await connection.execute(text(statement))
    finally:
        await engine.dispose()


@pytest.mark.parametrize("database_name", ["riskhub", "riskhub_prod", "test_riskhub"])
def test_e2e_reset_guard_rejects_database_without_test_suffix(database_name: str) -> None:
    from scripts.reset_e2e_database import validate_test_database

    with pytest.raises(ValueError, match="_test"):
        validate_test_database(
            f"postgresql+asyncpg://riskhub:secret@localhost/{database_name}",
            explicitly_marked=True,
        )


def test_e2e_reset_guard_requires_explicit_test_marker() -> None:
    from scripts.reset_e2e_database import validate_test_database

    with pytest.raises(ValueError, match="explicitly marked"):
        validate_test_database(
            "postgresql+asyncpg://riskhub:secret@localhost/riskhub_test",
            explicitly_marked=False,
        )


def test_e2e_reset_evicts_stale_sessions_before_schema_rebuild() -> None:
    source = Path("scripts/reset_e2e_database.py").read_text(encoding="utf-8")

    assert "pg_terminate_backend" in source
    assert "pid <> pg_backend_pid()" in source


@pytest.mark.asyncio
@pytest.mark.parametrize("connected_database", ["riskhub", "shadow_test"])
async def test_e2e_reset_refuses_connected_database_name_mismatch(
    monkeypatch, connected_database: str
) -> None:
    from scripts import reset_e2e_database

    engine, statements = _fake_reset_engine(connected_database)
    monkeypatch.setattr(
        reset_e2e_database,
        "create_async_engine",
        lambda *args, **kwargs: engine,
    )

    with pytest.raises(ValueError, match="connected database"):
        await reset_e2e_database.reset_database(
            "postgresql+asyncpg://riskhub:secret@localhost/riskhub_test"
        )

    assert statements == ["SELECT current_database()"]


@pytest.mark.asyncio
async def test_e2e_reset_rebuilds_only_after_connected_test_database_matches(monkeypatch) -> None:
    from scripts import reset_e2e_database

    engine, statements = _fake_reset_engine("riskhub_test")
    monkeypatch.setattr(
        reset_e2e_database,
        "create_async_engine",
        lambda *args, **kwargs: engine,
    )

    await reset_e2e_database.reset_database(
        "postgresql+asyncpg://riskhub:secret@localhost/riskhub_test"
    )

    assert statements[0] == "SELECT current_database()"
    assert "pg_terminate_backend" in statements[1]
    assert statements[2:] == ["DROP SCHEMA IF EXISTS public CASCADE", "CREATE SCHEMA public"]


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_e2e_reset_rejects_real_connected_database_mismatch_before_schema_rebuild(
    monkeypatch,
) -> None:
    from scripts import reset_e2e_database

    source_url = os.environ.get("TEST_DATABASE_URL", "")
    if not source_url.startswith("postgresql"):
        pytest.skip("Live reset guard regression requires TEST_DATABASE_URL pointing to PostgreSQL")

    source = make_url(source_url)
    maintenance_url = source.set(database="postgres").render_as_string(hide_password=False)
    connected_database = f"riskhub_reset_guard_{uuid4().hex[:12]}_test"
    expected_database = f"riskhub_reset_claim_{uuid4().hex[:12]}_test"
    connected_url = source.set(database=connected_database).render_as_string(hide_password=False)
    expected_url = source.set(database=expected_database).render_as_string(hide_password=False)
    quoted_connected_database = '"' + connected_database.replace('"', '""') + '"'

    await _run_postgres_statement(maintenance_url, f"CREATE DATABASE {quoted_connected_database}")
    real_create_async_engine = create_async_engine
    try:
        sentinel_engine = real_create_async_engine(connected_url)
        try:
            async with sentinel_engine.begin() as connection:
                current_database = (await connection.execute(text("SELECT current_database()"))).scalar_one()
                await connection.execute(text("CREATE TABLE reset_guard_sentinel (value integer NOT NULL)"))
                await connection.execute(text("INSERT INTO reset_guard_sentinel (value) VALUES (41)"))
        finally:
            await sentinel_engine.dispose()

        assert current_database == connected_database

        def connect_to_disposable_database(_claimed_database_url, **kwargs):
            # Exercise the real connection while making the URL's claimed target
            # differ from PostgreSQL's current_database() result.
            return real_create_async_engine(connected_url, **kwargs)

        monkeypatch.setattr(
            reset_e2e_database,
            "create_async_engine",
            connect_to_disposable_database,
        )

        with pytest.raises(ValueError, match="connected database"):
            await reset_e2e_database.reset_database(expected_url)

        verification_engine = real_create_async_engine(connected_url)
        try:
            async with verification_engine.connect() as connection:
                surviving_database = (
                    await connection.execute(text("SELECT current_database()"))
                ).scalar_one()
                sentinel_value = (
                    await connection.execute(text("SELECT value FROM reset_guard_sentinel"))
                ).scalar_one()
        finally:
            await verification_engine.dispose()

        assert surviving_database == connected_database
        assert sentinel_value == 41
    finally:
        await _run_postgres_statement(
            maintenance_url,
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname = '{connected_database}' AND pid <> pg_backend_pid()",
        )
        await _run_postgres_statement(maintenance_url, f"DROP DATABASE IF EXISTS {quoted_connected_database}")


def test_matrix_runner_orders_reset_seed_and_execution_for_each_project(monkeypatch, tmp_path: Path) -> None:
    from scripts.run_playwright_matrix import PROJECTS, run_matrix

    calls: list[tuple[tuple[str, ...], Path]] = []

    monkeypatch.setenv("RISKHUB_E2E_TEST_DATABASE", "1")

    def record(command, *, cwd, env, check):
        del env, check
        calls.append((tuple(str(part) for part in command), Path(cwd)))
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr("scripts.run_playwright_matrix.subprocess.run", record)
    run_matrix(repo_root=tmp_path)

    assert len(calls) == len(PROJECTS) * 5 + 1
    for index, project in enumerate(PROJECTS):
        reset, migrate, base_seed, e2e_seed, playwright = calls[index * 5 : index * 5 + 5]
        assert reset[0][-2:] == ("-m", "scripts.reset_e2e_database")
        assert migrate[0][-3:] == ("alembic", "upgrade", "head")
        assert base_seed[0][-2:] == ("-m", "app.db.seed")
        assert e2e_seed[0][-2:] == ("-m", "scripts.seed_e2e_all")
        assert f"--project={project}" in playwright[0]
        assert "--workers=1" in playwright[0]
    assert calls[-1][0][-2:] == (
        "playwright.merge.config.ts",
        str(tmp_path / "tests/results/frontend/playwright/blob-reports"),
    )


def test_matrix_runner_requires_operator_marker(monkeypatch, tmp_path: Path) -> None:
    from scripts.run_playwright_matrix import run_matrix

    monkeypatch.delenv("RISKHUB_E2E_TEST_DATABASE", raising=False)
    with pytest.raises(ValueError, match="operator environment"):
        run_matrix(repo_root=tmp_path)


def test_matrix_runner_runs_all_projects_and_merges_after_failure(monkeypatch, tmp_path: Path) -> None:
    from scripts.run_playwright_matrix import PROJECTS, run_matrix

    calls: list[tuple[str, ...]] = []
    monkeypatch.setenv("RISKHUB_E2E_TEST_DATABASE", "1")

    def fail_chromium(command, *, cwd, env, check):
        del cwd, env, check
        normalized = tuple(str(part) for part in command)
        calls.append(normalized)
        return SimpleNamespace(returncode=1 if "--project=chromium" in normalized else 0)

    monkeypatch.setattr("scripts.run_playwright_matrix.subprocess.run", fail_chromium)
    with pytest.raises(RuntimeError, match="chromium"):
        run_matrix(repo_root=tmp_path)

    for project in PROJECTS:
        assert any(f"--project={project}" in command for command in calls)
    assert "merge-reports" in calls[-1]


def test_merged_html_report_never_opens_an_interactive_server() -> None:
    source = Path("../frontend/playwright.merge.config.ts").read_text(encoding="utf-8")

    assert "open: 'never'" in source
