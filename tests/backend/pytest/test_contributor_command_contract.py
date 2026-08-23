from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
FACADE = REPO_ROOT / "scripts/riskhub.sh"


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
    assert "Destructively remove local containers" in result.stdout


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
