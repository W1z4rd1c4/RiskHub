from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any


def capture_release_baseline(*, root_dir: Path, captured_at_utc: str) -> dict[str, Any]:
    git_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root_dir, text=True).strip()
    git_branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=root_dir, text=True).strip()
    git_status = subprocess.check_output(["git", "status", "--short", "--branch"], cwd=root_dir, text=True)
    return {
        "captured_at_utc": captured_at_utc,
        "git_sha": git_sha,
        "git_branch": git_branch,
        "git_status": git_status,
        "is_clean": len([line for line in git_status.splitlines() if line and not line.startswith("##")]) == 0,
        "root": str(root_dir),
    }
