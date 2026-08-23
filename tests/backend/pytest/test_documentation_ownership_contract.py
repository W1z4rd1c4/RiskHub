from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_documentation_ownership_contract():
    subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "scripts/tools/validate_documentation_ownership.py"),
        ],
        cwd=REPO_ROOT,
        check=True,
    )
