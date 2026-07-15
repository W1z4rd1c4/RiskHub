"""Run each browser project against a freshly reset and seeded E2E database."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

PROJECTS = ("chromium", "firefox", "webkit", "ci")


def _run(command: list[str], *, cwd: Path, env: dict[str, str]) -> int:
    return subprocess.run(command, cwd=cwd, env=env, check=False).returncode


def run_matrix(*, repo_root: Path) -> None:
    if os.environ.get("RISKHUB_E2E_TEST_DATABASE") != "1":
        raise ValueError(
            "E2E matrix requires RISKHUB_E2E_TEST_DATABASE=1 in the operator environment"
        )
    backend = repo_root / "backend"
    frontend = repo_root / "frontend"
    python = str(backend / "venv/bin/python")
    reports_root = repo_root / "tests/results/frontend/playwright"
    blob_dir = reports_root / "blob-reports"
    if blob_dir.exists():
        shutil.rmtree(blob_dir)
    blob_dir.mkdir(parents=True, exist_ok=True)

    base_env = os.environ.copy()
    failed_projects: list[str] = []
    for project in PROJECTS:
        setup_commands = (
            [python, "-m", "scripts.reset_e2e_database"],
            [python, "-m", "alembic", "upgrade", "head"],
            [python, "-m", "app.db.seed"],
            [python, "-m", "scripts.seed_e2e_all"],
        )
        if any(_run(command, cwd=backend, env=base_env) != 0 for command in setup_commands):
            failed_projects.append(project)
            continue
        project_env = {
            **base_env,
            "PLAYWRIGHT_BLOB_OUTPUT_FILE": str(blob_dir / f"{project}.zip"),
        }
        return_code = _run(
            [
                "npx",
                "playwright",
                "test",
                "-c",
                "playwright.config.ts",
                f"--project={project}",
                "--workers=1",
                "--reporter=blob",
            ],
            cwd=frontend,
            env=project_env,
        )
        if return_code != 0:
            failed_projects.append(project)

    merge_return_code = _run(
        [
            "npx",
            "playwright",
            "merge-reports",
            "--config",
            "playwright.merge.config.ts",
            str(blob_dir),
        ],
        cwd=frontend,
        env=base_env,
    )
    if merge_return_code != 0:
        failed_projects.append("report-merge")
    if failed_projects:
        raise RuntimeError(f"Playwright matrix failed: {', '.join(failed_projects)}")


def main() -> None:
    run_matrix(repo_root=Path(__file__).resolve().parents[2])


if __name__ == "__main__":
    main()
