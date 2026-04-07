"""Repository hygiene contracts for git-visible source and config files."""

from __future__ import annotations

import os
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


def _tracked_files() -> list[str]:
    tracked = _run_git("ls-files")
    assert tracked.returncode == 0, _describe_result(tracked)
    return [
        line
        for line in tracked.stdout.splitlines()
        if line.strip() and (REPO_ROOT / line).exists()
    ]


def _tracked_ignored_paths() -> list[str]:
    tracked = _run_git("ls-files", "-ci", "--exclude-standard")
    assert tracked.returncode == 0, _describe_result(tracked)
    return [
        line
        for line in tracked.stdout.splitlines()
        if line.strip() and (REPO_ROOT / line).exists()
    ]


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
        "tests/results/quality/frontend/cleanup-audit/unreachable.json",
        "scripts/runtime-artifacts/README.md",
    ],
)
def test_generated_local_outputs_remain_ignored(rel_path: str) -> None:
    ignored = _run_git("check-ignore", "-v", "--", rel_path)
    assert ignored.returncode == 0, _describe_result(ignored)


def test_frontend_repo_root_generated_wrappers_are_not_tracked() -> None:
    tracked = _tracked_files()
    forbidden_prefixes = (
        "frontend/cleanup-audit/",
        "frontend/i18n-audit/",
        "frontend/quality-audit/",
    )

    leaked = [
        path
        for path in tracked
        if path.startswith(forbidden_prefixes) or path.startswith("frontend/ts-trace-")
    ]
    assert leaked == [], f"unexpected tracked generated wrapper paths: {leaked}"


def test_repository_has_no_tracked_retired_artifact_surfaces() -> None:
    tracked = _tracked_files()
    forbidden_exact = {
        "docs/reference/file_list.txt",
        "scripts/tools/generate_pdf.py",
        "scripts/tools/generate_pdf.js",
        "frontend/generate_pdf.js",
    }
    forbidden_prefixes = ("frontend/public/docs/",)

    leaked = [
        path
        for path in tracked
        if path in forbidden_exact or (path.startswith(forbidden_prefixes) and path != "frontend/public/docs/README.md")
    ]
    assert leaked == [], f"unexpected tracked retired artifact paths: {leaked}"

def test_repository_has_no_tracked_ignored_paths() -> None:
    assert _tracked_ignored_paths() == []


def test_repository_has_no_tracked_dependency_tree_paths() -> None:
    tracked_dependency_paths = [
        rel_path for rel_path in _tracked_files() if "node_modules/" in rel_path or rel_path.endswith("/node_modules")
    ]
    assert tracked_dependency_paths == []


def test_repository_has_no_tracked_symlinked_dependency_trees() -> None:
    bad_symlinks: list[str] = []

    for rel_path in _tracked_files():
        abs_path = REPO_ROOT / rel_path
        if not abs_path.is_symlink():
            continue

        resolved = Path(os.path.realpath(abs_path))
        if "node_modules" in resolved.parts:
            if resolved.is_relative_to(REPO_ROOT):
                resolved_text = resolved.relative_to(REPO_ROOT).as_posix()
            else:
                resolved_text = str(resolved)
            bad_symlinks.append(f"{rel_path} -> {resolved_text}")

    assert bad_symlinks == []


def test_frontend_readme_is_not_the_stock_vite_template() -> None:
    text = (REPO_ROOT / "frontend" / "README.md").read_text(encoding="utf-8")

    assert "# RiskHub Frontend" in text
    assert "This template provides a minimal setup to get React working in Vite" not in text


@pytest.mark.parametrize(
    ("rel_path", "placeholder"),
    [
        ("backend/README.md", "Folder for `backend` implementation assets."),
        ("tests/README.md", "Folder for `tests` implementation assets."),
    ],
)
def test_top_level_readmes_are_curated(rel_path: str, placeholder: str) -> None:
    text = (REPO_ROOT / rel_path).read_text(encoding="utf-8")

    assert "RiskHub" in text
    assert placeholder not in text
