from pathlib import Path
from types import SimpleNamespace

import pytest


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
