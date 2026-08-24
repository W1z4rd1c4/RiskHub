from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
VALIDATOR = REPO_ROOT / "scripts/tools/validate_python_dependency_lock.py"
REFRESHER = REPO_ROOT / "scripts/tools/refresh_python_dependency_lock.py"
ENTRYPOINT = REPO_ROOT / "backend/requirements-dev.txt"
REFRESH_WORKFLOW = REPO_ROOT / ".github/workflows/python-dev-lock-refresh.yml"


def test_backend_development_dependency_lock_contract():
    subprocess.run(
        [sys.executable, str(VALIDATOR)],
        cwd=REPO_ROOT,
        check=True,
    )


def test_backend_dependency_lock_refresh_command_is_documented_and_runnable():
    result = subprocess.run(
        [sys.executable, str(REFRESHER), "--help"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )

    assert "Regenerate RiskHub's exact Python 3.13" in result.stdout


def test_backend_dependency_entrypoint_has_generated_terminal_newline():
    content = ENTRYPOINT.read_bytes()
    assert content.endswith(b"\n")
    assert not content.endswith(b"\n\n")


def test_backend_lock_refresh_uses_approved_pr_credential():
    workflow = REFRESH_WORKFLOW.read_text(encoding="utf-8")
    assert "RISKHUB_AUTOMATION_PR_TOKEN" in workflow
    assert "secrets.GITHUB_TOKEN" not in workflow
    assert "persist-credentials: false" in workflow
    assert "gh auth setup-git" in workflow
    assert "if: github.ref == 'refs/heads/main'" in workflow


def test_backend_lock_refresh_preflights_required_write_permissions():
    workflow = REFRESH_WORKFLOW.read_text(encoding="utf-8")

    assert "Validate automation credential and mutation permissions" in workflow
    assert "repos/${GITHUB_REPOSITORY}/git/refs" in workflow
    assert "repos/${GITHUB_REPOSITORY}/pulls" in workflow
    assert workflow.count("expect_validation_error") >= 3
    assert "HTTP 422" in workflow
    assert "0000000000000000000000000000000000000000" in workflow
    assert "__riskhub_permission_probe_missing__" in workflow
