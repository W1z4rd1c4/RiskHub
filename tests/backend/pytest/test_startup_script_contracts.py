from __future__ import annotations

import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
COMPOSE_SCRIPT = REPO_ROOT / "scripts" / "compose.sh"


def _run_compose(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(COMPOSE_SCRIPT), *args],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        env=os.environ.copy(),
    )


def test_compose_help_entrypoints_exit_zero() -> None:
    for args in (["--help"], ["-h"], ["help"]):
        result = _run_compose(*args)
        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode == 0, output
        assert "Usage:" in result.stdout


def test_compose_without_command_exits_nonzero() -> None:
    result = _run_compose()
    output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode != 0, output
    assert "Usage:" in result.stdout
