from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
FACADE = REPO_ROOT / "scripts/riskhub.sh"
CI_CONTRACT = REPO_ROOT / "docs/development/ci-gate-contract.json"
CONTRACT_DOC = REPO_ROOT / "docs/development/CONTRIBUTOR_COMMANDS.md"


def test_contributor_command_contract():
    subprocess.run(
        [
            sys.executable,
            str(
                REPO_ROOT
                / "scripts/tools/validate_contributor_command_contract.py"
            ),
        ],
        cwd=REPO_ROOT,
        check=True,
    )


def test_contributor_command_help_lists_stable_surface():
    result = subprocess.run(
        [str(FACADE), "help"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )

    for command in (
        "setup",
        "dev",
        "lint",
        "test",
        "e2e",
        "release-check",
        "clean",
    ):
        assert command in result.stdout

    assert "Repair and start local development services" in result.stdout
    assert "Run the default backend regression contract" in result.stdout
    assert "Stop local dev/Compose" in result.stdout
    assert "keep backend/venv" in result.stdout
    assert "remove local containers, volumes, dependencies" not in result.stdout


def test_human_ci_map_covers_every_machine_mapped_job():
    payload = json.loads(CI_CONTRACT.read_text(encoding="utf-8"))
    documentation = CONTRACT_DOC.read_text(encoding="utf-8")

    job_names = [check["job_name"] for check in payload["checks"]]
    assert len(job_names) == len(set(job_names))
    for job_name in job_names:
        assert f"`{job_name}`" in documentation


def test_contributor_command_rejects_unknown_command():
    result = subprocess.run(
        [str(FACADE), "unknown-command"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 2
    assert "Unknown RiskHub command" in result.stderr
