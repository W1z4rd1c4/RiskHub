"""Repository hygiene contracts for git-visible source and config files."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]


def _run_git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def _describe_result(result: subprocess.CompletedProcess[str]) -> str:
    return f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"


@pytest.mark.parametrize(
    "rel_path",
    [
        "scripts/deploy/lib/render.py",
        "scripts/prod/lib/common.sh",
        "frontend/src/lib/utils.ts",
        "backend/requirements-runtime.txt",
        "backend/security/pip-audit-allowlist.txt",
        "frontend/scripts/i18n/allowlist.json",
        "docs/reference/readme_coverage.json",
        "docs/quality/baseline/e402-app.txt",
    ],
)
def test_repo_owned_paths_are_not_ignored_and_are_tracked(rel_path: str) -> None:
    assert (REPO_ROOT / rel_path).exists(), rel_path

    ignored = _run_git("check-ignore", "-v", "--", rel_path)
    assert ignored.returncode == 1, _describe_result(ignored)

    tracked = _run_git("ls-files", "--error-unmatch", "--", rel_path)
    assert tracked.returncode == 0, _describe_result(tracked)


@pytest.mark.parametrize(
    "rel_path",
    [
        "backend/bandit-report.json",
        "frontend/cleanup-audit/unreachable.json",
        "scripts/runtime-artifacts/README.md",
    ],
)
def test_generated_local_outputs_remain_ignored(rel_path: str) -> None:
    assert (REPO_ROOT / rel_path).exists(), rel_path

    ignored = _run_git("check-ignore", "-v", "--", rel_path)
    assert ignored.returncode == 0, _describe_result(ignored)
