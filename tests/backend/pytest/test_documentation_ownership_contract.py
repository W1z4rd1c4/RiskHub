from __future__ import annotations

import importlib.util
import subprocess
import sys
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
MAKEFILE = REPO_ROOT / "scripts/Makefile"
VALIDATOR_PATH = REPO_ROOT / "scripts/tools/validate_documentation_ownership.py"

VALIDATOR_SPEC = importlib.util.spec_from_file_location(
    "validate_documentation_ownership", VALIDATOR_PATH
)
assert VALIDATOR_SPEC is not None and VALIDATOR_SPEC.loader is not None
VALIDATOR = importlib.util.module_from_spec(VALIDATOR_SPEC)
VALIDATOR_SPEC.loader.exec_module(VALIDATOR)


def test_documentation_ownership_contract():
    subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "scripts/tools/validate_documentation_ownership.py"),
        ],
        cwd=REPO_ROOT,
        check=True,
    )


def test_docs_topology_consistency_runs_documentation_ownership_validator():
    result = subprocess.run(
        ["make", "--dry-run", "-f", str(MAKEFILE), "docs-topology-consistency"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )

    assert "python3 scripts/tools/validate_documentation_ownership.py" in result.stdout


def test_archived_architecture_plan_has_machine_checked_status_correction():
    assert VALIDATOR._validate_architecture_plan_status() == []


def test_coverage_verification_date_accepts_baseline_and_later_dates():
    assert VALIDATOR._coverage_verification_date_error("2026-08-24") is None
    assert VALIDATOR._coverage_verification_date_error("2026-08-25") is None
    assert VALIDATOR._coverage_verification_date_error("2030-01-01") is None


def test_coverage_verification_date_rejects_malformed_and_too_old_dates():
    malformed = VALIDATOR._coverage_verification_date_error("2026/08/25")
    too_old = VALIDATOR._coverage_verification_date_error("2026-08-23")

    assert malformed == "must be an ISO date"
    assert too_old == f"must be on or after {date(2026, 8, 24).isoformat()}"
