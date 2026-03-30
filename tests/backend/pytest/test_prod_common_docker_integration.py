from __future__ import annotations

import shlex
import shutil
import subprocess
import uuid
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
PROD_COMMON = REPO_ROOT / "scripts" / "prod" / "lib" / "common.sh"


def _docker_ready() -> bool:
    if shutil.which("docker") is None:
        return False
    result = subprocess.run(["docker", "ps"], check=False, capture_output=True, text=True)
    return result.returncode == 0


@pytest.mark.docker_integration
def test_rm_container_if_exists_replaces_stubborn_running_container() -> None:
    if not _docker_ready():
        pytest.skip("docker daemon not available")

    container_name = f"riskhub-rm-test-{uuid.uuid4().hex[:8]}"
    try:
        subprocess.run(
            [
                "docker",
                "run",
                "-d",
                "--name",
                container_name,
                "busybox:1.36",
                "sh",
                "-lc",
                "trap '' TERM INT; while true; do sleep 1; done",
            ],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        command = f"""
set -euo pipefail
source {shlex.quote(str(PROD_COMMON))}
rm_container_if_exists {shlex.quote(container_name)}
"""
        result = subprocess.run(
            ["bash", "-lc", command],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        inspect = subprocess.run(
            ["docker", "inspect", container_name],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )

        assert inspect.returncode != 0, result.stderr
    finally:
        subprocess.run(
            ["docker", "rm", "-f", container_name],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
