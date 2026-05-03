"""Git input collection for authorization contract validation."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

DIFF_HEADER_RE = re.compile(r"^diff --git a/(.+) b/(.+)$")


def run_git(repo_root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo_root,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def changed_files(repo_root: Path, base_ref: str) -> list[Path]:
    result = run_git(repo_root, "diff", "--name-only", base_ref, "--")
    if result.returncode != 0:
        raise RuntimeError(
            f"git diff failed for base {base_ref!r}:\n{result.stderr.strip()}"
        )
    files = [Path(line.strip()) for line in result.stdout.splitlines() if line.strip()]

    untracked = run_git(repo_root, "ls-files", "--others", "--exclude-standard")
    if untracked.returncode != 0:
        raise RuntimeError(f"git ls-files failed:\n{untracked.stderr.strip()}")
    files.extend(Path(line.strip()) for line in untracked.stdout.splitlines() if line.strip())
    return sorted(set(files))


def changed_file_diffs(repo_root: Path, base_ref: str) -> dict[Path, str]:
    result = run_git(repo_root, "diff", "--unified=0", base_ref, "--")
    if result.returncode != 0:
        raise RuntimeError(
            f"git diff failed for base {base_ref!r}:\n{result.stderr.strip()}"
        )

    diffs: dict[Path, list[str]] = {}
    current_path: Path | None = None
    for line in result.stdout.splitlines():
        match = DIFF_HEADER_RE.match(line)
        if match:
            current_path = Path(match.group(2))
            diffs[current_path] = [line]
            continue
        if current_path is not None:
            diffs[current_path].append(line)

    return {path: "\n".join(lines) for path, lines in diffs.items()}
