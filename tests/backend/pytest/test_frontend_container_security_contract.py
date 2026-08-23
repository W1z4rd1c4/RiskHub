import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


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
