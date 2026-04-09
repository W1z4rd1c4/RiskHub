#!/usr/bin/env python3
"""Resolve changed quality-gate targets with safe fallbacks."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ZERO_SHA = "0" * 40


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Resolve changed frontend/backend quality targets from git history.",
    )
    parser.add_argument(
        "--repo-root",
        default=str(REPO_ROOT),
        help="Repository root to inspect.",
    )
    parser.add_argument(
        "--event-name",
        default="pull_request",
        choices=("pull_request", "push", "workflow_dispatch"),
        help="GitHub event name or equivalent workflow mode.",
    )
    parser.add_argument(
        "--base-ref",
        default="",
        help="Base branch/ref name for pull_request style diffs.",
    )
    parser.add_argument(
        "--before-sha",
        default="",
        help="Before SHA for push style diffs.",
    )
    parser.add_argument(
        "--head-sha",
        default="HEAD",
        help="Head SHA/ref to diff against.",
    )
    parser.add_argument(
        "--kind",
        required=True,
        choices=("backend-python", "frontend-typescript"),
        help="Target set to print.",
    )
    return parser.parse_args()


def run_git(repo_root: Path, *args: str) -> str:
    return subprocess.check_output(
        ["git", *args],
        cwd=repo_root,
        text=True,
        stderr=subprocess.DEVNULL,
    ).strip()


def git_ref_exists(repo_root: Path, ref: str) -> bool:
    if not ref:
        return False
    try:
        run_git(repo_root, "rev-parse", "--verify", f"{ref}^{{commit}}")
    except subprocess.CalledProcessError:
        return False
    return True


def resolve_base_commit(repo_root: Path, args: argparse.Namespace) -> str | None:
    head_sha = args.head_sha
    base_candidates = [candidate for candidate in (f"origin/{args.base_ref}", args.base_ref) if candidate]

    if args.event_name == "push" and args.before_sha and args.before_sha != ZERO_SHA:
        if git_ref_exists(repo_root, args.before_sha):
            return args.before_sha

    for candidate in base_candidates:
        if not git_ref_exists(repo_root, candidate):
            continue
        try:
            return run_git(repo_root, "merge-base", candidate, head_sha)
        except subprocess.CalledProcessError:
            continue

    parent_ref = f"{head_sha}~1"
    if git_ref_exists(repo_root, parent_ref):
        return parent_ref

    return None


def collect_diff_paths(repo_root: Path, base_commit: str | None, head_sha: str) -> list[str]:
    if base_commit is None:
        return []
    try:
        output = run_git(
            repo_root,
            "diff",
            "--name-only",
            "--diff-filter=ACMRTUXB",
            base_commit,
            head_sha,
        )
    except subprocess.CalledProcessError:
        return []
    if not output:
        return []
    return [line.strip() for line in output.splitlines() if line.strip()]


def classify_kind(path: str, kind: str) -> bool:
    if kind == "backend-python":
        return path.startswith("backend/app/") and path.endswith(".py")
    if kind == "frontend-typescript":
        return path.startswith("frontend/src/") and path.endswith((".ts", ".tsx"))
    raise ValueError(f"Unsupported kind: {kind}")


def fallback_paths(repo_root: Path, kind: str) -> list[str]:
    if kind == "backend-python":
        roots = [repo_root / "backend" / "app"]
        suffixes = (".py",)
    elif kind == "frontend-typescript":
        roots = [repo_root / "frontend" / "src"]
        suffixes = (".ts", ".tsx")
    else:
        raise ValueError(f"Unsupported kind: {kind}")

    discovered: list[str] = []
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if path.is_file() and path.suffix in suffixes:
                discovered.append(path.relative_to(repo_root).as_posix())
    return discovered


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()

    base_commit = resolve_base_commit(repo_root, args)
    changed_paths = collect_diff_paths(repo_root, base_commit, args.head_sha)
    selected_paths = sorted(
        {
            path
            for path in changed_paths
            if classify_kind(path, args.kind)
        }
    )

    if not changed_paths or base_commit is None:
        selected_paths = fallback_paths(repo_root, args.kind)

    if selected_paths:
        sys.stdout.write("\n".join(selected_paths))
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
