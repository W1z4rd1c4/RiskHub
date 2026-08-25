from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
MAKEFILE = REPO_ROOT / "scripts/Makefile"


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
