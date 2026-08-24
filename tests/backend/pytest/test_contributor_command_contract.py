from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
FACADE = REPO_ROOT / "scripts/riskhub.sh"
CI_CONTRACT = REPO_ROOT / "docs/development/ci-gate-contract.json"
CONTRACT_DOC = REPO_ROOT / "docs/development/CONTRIBUTOR_COMMANDS.md"


def _ci_contract() -> dict:
    return json.loads(CI_CONTRACT.read_text(encoding="utf-8"))


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


def test_human_ci_map_covers_every_machine_mapped_workflow_job():
    payload = _ci_contract()
    documentation = CONTRACT_DOC.read_text(encoding="utf-8")

    job_keys = [
        (check["workflow"], check["job_id"])
        for check in payload["checks"]
    ]
    assert len(job_keys) == len(set(job_keys))
    for check in payload["checks"]:
        workflow_name = Path(check["workflow"]).name
        assert f"| `{check['job_name']}` | `{workflow_name}` |" in documentation


def test_ci_contract_includes_release_publication_workflow_and_purpose():
    payload = _ci_contract()

    assert payload["schema_version"] == 2
    release_jobs = {
        check["job_id"]
        for check in payload["checks"]
        if check["workflow"] == ".github/workflows/release.yml"
    }
    assert release_jobs == {
        "workflow-pin-validation",
        "prepare",
        "release-parity-gate",
        "docker-images",
        "linux-bundle",
        "verify-linux-bundle",
        "create-release",
    }
    for check in payload["checks"]:
        assert check["owner"].strip()
        assert check["purpose"].strip()
        assert check["runtime_budget"].strip()
        assert check["triage"].strip()


def test_ci_contract_records_exact_branch_path_tag_and_schedule_filters():
    events = _ci_contract()["workflow_contracts"]

    assert events[".github/workflows/startup-smoke.yml"]["events"] == {
        "pull_request": {"branches": ["main", "develop"]},
        "push": {"branches": ["main", "develop"]},
        "schedule": {"crons": ["45 2 * * *"]},
        "workflow_dispatch": {"inputs": []},
    }

    maintenance_pr = events[
        ".github/workflows/maintenance-governance.yml"
    ]["events"]["pull_request"]
    assert maintenance_pr["branches"] == ["main", "develop"]
    assert maintenance_pr["paths"] == [
        "AGENTS.md",
        ".planning/**",
        "docs/**",
        "scripts/check_docs_contract.py",
        "scripts/quality/**",
        "scripts/tools/**",
        "frontend/scripts/**",
        "backend/mypy.ini",
        "backend/ruff.toml",
        ".github/workflows/**",
    ]

    assert events[".github/workflows/release.yml"]["events"] == {
        "push": {"tags": ["v*"]},
        "workflow_dispatch": {"inputs": ["version"]},
    }


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
