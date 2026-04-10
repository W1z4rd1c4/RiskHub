from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parents[3] / "scripts" / "tools" / "changed_quality_targets.py"


def _run(cmd: list[str], cwd: Path) -> str:
    return subprocess.check_output(cmd, cwd=cwd, text=True).strip()


def _init_repo(repo_root: Path) -> None:
    _run(["git", "init", "--initial-branch=main"], repo_root)
    _run(["git", "config", "user.name", "RiskHub Test"], repo_root)
    _run(["git", "config", "user.email", "riskhub@example.com"], repo_root)


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_changed_quality_targets_filters_changed_backend_and_frontend_files(
    tmp_path: Path,
) -> None:
    _init_repo(tmp_path)
    _write(tmp_path / "backend" / "app" / "core.py", "VALUE = 1\n")
    _write(tmp_path / "frontend" / "src" / "app.ts", "export const value = 1;\n")
    _write(tmp_path / "docs" / "README.md", "# docs\n")
    _run(["git", "add", "."], tmp_path)
    _run(["git", "commit", "-m", "initial"], tmp_path)
    before_sha = _run(["git", "rev-parse", "HEAD"], tmp_path)

    _write(tmp_path / "backend" / "app" / "core.py", "VALUE = 2\n")
    _write(tmp_path / "frontend" / "src" / "app.ts", "export const value = 2;\n")
    _write(tmp_path / "docs" / "README.md", "# docs updated\n")
    _run(["git", "add", "."], tmp_path)
    _run(["git", "commit", "-m", "change targets"], tmp_path)
    head_sha = _run(["git", "rev-parse", "HEAD"], tmp_path)

    backend_output = _run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--repo-root",
            str(tmp_path),
            "--event-name",
            "push",
            "--before-sha",
            before_sha,
            "--head-sha",
            head_sha,
            "--kind",
            "backend-python",
        ],
        tmp_path,
    )
    frontend_output = _run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--repo-root",
            str(tmp_path),
            "--event-name",
            "push",
            "--before-sha",
            before_sha,
            "--head-sha",
            head_sha,
            "--kind",
            "frontend-typescript",
        ],
        tmp_path,
    )

    assert backend_output.splitlines() == ["backend/app/core.py"]
    assert frontend_output.splitlines() == ["frontend/src/app.ts"]


def test_changed_quality_targets_falls_back_to_full_tree_without_diff_base(
    tmp_path: Path,
) -> None:
    _init_repo(tmp_path)
    _write(tmp_path / "backend" / "app" / "core.py", "VALUE = 1\n")
    _write(tmp_path / "backend" / "app" / "nested" / "extra.py", "VALUE = 2\n")
    _write(tmp_path / "frontend" / "src" / "app.tsx", "export const App = () => null;\n")
    _run(["git", "add", "."], tmp_path)
    _run(["git", "commit", "-m", "initial"], tmp_path)

    backend_output = _run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--repo-root",
            str(tmp_path),
            "--event-name",
            "push",
            "--before-sha",
            "deadbeef",
            "--kind",
            "backend-python",
        ],
        tmp_path,
    )

    assert backend_output.splitlines() == [
        "backend/app/core.py",
        "backend/app/nested/extra.py",
    ]
