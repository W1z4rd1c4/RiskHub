from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_PATH = REPO_ROOT / ".github/workflows/security.yml"


def _frontend_enforcement_script() -> str:
    workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
    steps = workflow["jobs"]["container-security"]["steps"]
    step = next(
        item
        for item in steps
        if item.get("name") == "Enforce Frontend Trivy HIGH/CRITICAL Gate"
    )
    return str(step["run"])


def test_frontend_container_vulnerability_gate_contract():
    subprocess.run(
        [
            sys.executable,
            str(
                REPO_ROOT
                / "scripts/security/validate_frontend_container_gate.py"
            ),
        ],
        cwd=REPO_ROOT,
        check=True,
    )


def test_frontend_container_gate_accepts_successful_scan():
    result = subprocess.run(
        ["bash", "-c", _frontend_enforcement_script()],
        cwd=REPO_ROOT,
        env={**os.environ, "FRONTEND_TRIVY_OUTCOME": "success"},
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "findings: 0" in result.stdout


def test_frontend_container_gate_rejects_qualifying_scan_outcome():
    result = subprocess.run(
        ["bash", "-c", _frontend_enforcement_script()],
        cwd=REPO_ROOT,
        env={**os.environ, "FRONTEND_TRIVY_OUTCOME": "failure"},
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "unresolved Trivy HIGH/CRITICAL findings" in result.stdout
