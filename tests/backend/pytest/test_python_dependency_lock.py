import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_backend_development_dependency_lock_contract():
    subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "scripts/tools/validate_python_dependency_lock.py"),
        ],
        cwd=REPO_ROOT,
        check=True,
    )
