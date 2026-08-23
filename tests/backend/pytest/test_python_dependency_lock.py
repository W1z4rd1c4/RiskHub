from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
VALIDATOR = REPO_ROOT / "scripts/tools/validate_python_dependency_lock.py"
REFRESHER = REPO_ROOT / "scripts/tools/refresh_python_dependency_lock.py"


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
