#!/usr/bin/env python3
"""README coverage audit/apply for non-dot, non-ignored directories."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ACCEPTED_README_NAMES = {"readme", "readme.md", "readme.txt"}
MAX_CONTENT_ITEMS = 15


@dataclass(frozen=True)
class AuditResult:
    in_scope_dirs: list[Path]
    missing_dirs: list[Path]

    @property
    def in_scope_count(self) -> int:
        return len(self.in_scope_dirs)

    @property
    def missing_count(self) -> int:
        return len(self.missing_dirs)

    @property
    def by_top_level(self) -> dict[str, int]:
        counts = Counter(path.parts[0] for path in self.missing_dirs)
        return {key: counts[key] for key in sorted(counts)}


def run_git_check_ignore(repo_root: Path, relative_paths: Iterable[str]) -> set[str]:
    """Return ignored paths (normalized, no trailing slash) for provided relative paths."""
    path_list = [p for p in relative_paths if p and p != "."]
    if not path_list:
        return set()

    proc = subprocess.run(
        ["git", "check-ignore", "--stdin"],
        input=("\n".join(path_list) + "\n").encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=repo_root,
        check=False,
    )

    if proc.returncode not in (0, 1):
        stderr = proc.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"git check-ignore failed: {stderr}")

    ignored: set[str] = set()
    for line in proc.stdout.decode("utf-8", errors="replace").splitlines():
        cleaned = line.strip().rstrip("/")
        if cleaned:
            ignored.add(cleaned)
    return ignored


def ignored_directories_for_batch(repo_root: Path, rel_dir_paths: list[str]) -> set[str]:
    """Resolve which directory paths are gitignored using a single batched call."""
    if not rel_dir_paths:
        return set()

    # Probe raw paths only. Adding trailing slashes can fail for symlinked
    # directories with: "pathspec ... is beyond a symbolic link".
    ignored_raw = run_git_check_ignore(repo_root, rel_dir_paths)
    ignored_dirs: set[str] = set()
    for rel in rel_dir_paths:
        if rel in ignored_raw:
            ignored_dirs.add(rel)
    return ignored_dirs


def list_in_scope_directories(repo_root: Path) -> list[Path]:
    """List all non-dot, non-ignored directories below repo root (excluding root)."""
    in_scope: list[Path] = []

    for current, dirs, _ in os.walk(repo_root, topdown=True):
        current_path = Path(current)
        rel_current = current_path.relative_to(repo_root)

        non_dot_dirs = [d for d in dirs if not d.startswith(".")]
        rel_children = [str((current_path / d).relative_to(repo_root).as_posix()) for d in non_dot_dirs]
        ignored_children = ignored_directories_for_batch(repo_root, rel_children)

        kept_dirs = []
        for d in non_dot_dirs:
            rel_child = (current_path / d).relative_to(repo_root).as_posix()
            if rel_child in ignored_children:
                continue
            kept_dirs.append(d)
        dirs[:] = kept_dirs

        if rel_current == Path("."):
            continue
        if any(part.startswith(".") for part in rel_current.parts):
            continue

        in_scope.append(rel_current)

    in_scope.sort(key=lambda p: p.as_posix())
    return in_scope


def has_accepted_readme(abs_dir: Path) -> bool:
    file_names = {entry.name.lower() for entry in abs_dir.iterdir() if entry.is_file()}
    return bool(file_names & ACCEPTED_README_NAMES)


def audit_repo(repo_root: Path) -> AuditResult:
    in_scope = list_in_scope_directories(repo_root)
    missing = [rel for rel in in_scope if not has_accepted_readme(repo_root / rel)]
    return AuditResult(in_scope_dirs=in_scope, missing_dirs=missing)


def classify_purpose(rel_dir: Path) -> str:
    text = rel_dir.as_posix()
    parts = rel_dir.parts

    if text == "backend":
        return "Backend API, migrations, runtime packaging, and backend test configuration for RiskHub."

    if text == "frontend":
        return "React frontend application, build tooling, and frontend quality scripts for RiskHub."

    if text == "tests":
        return "Centralized backend, frontend, and generated verification artifacts for RiskHub."

    if text == "backend/app":
        return "Primary FastAPI application package, including models, services, and API routing."

    if text == "frontend/src":
        return "Frontend application source for pages, components, hooks, state, and shared UI logic."

    if text.startswith("backend/app/api/v1/endpoints/"):
        domain = parts[5] if len(parts) > 5 else "endpoint"
        return f"API endpoint package for `{domain}` domain."

    if text == "backend/app/models" or text.startswith("backend/app/models/"):
        return "ORM models and persistence entities."

    if text == "backend/app/schemas" or text.startswith("backend/app/schemas/"):
        return "API request/response schema definitions."

    if text.startswith("backend/app/services/"):
        area = parts[3] if len(parts) > 3 else "services"
        return f"Business/service-layer logic for `{area}`."

    if text.startswith("frontend/src/components/"):
        area = parts[3] if len(parts) > 3 else "components"
        return f"UI components for `{area}` area."

    if text.startswith("frontend/src/pages/"):
        area = parts[3] if len(parts) > 3 else "pages"
        return f"Route-level page modules for `{area}`."

    if text.startswith("tests/frontend/e2e/"):
        area = parts[3] if len(parts) > 3 else "e2e"
        return f"Playwright E2E suite for `{area}`."

    if text.startswith("tests/backend/pytest/"):
        area = parts[3] if len(parts) > 3 else "pytest"
        return f"Pytest backend coverage for `{area}`."

    return f"Folder for `{text}` implementation assets."


def render_contents(abs_dir: Path) -> list[str]:
    entries: list[str] = []
    for entry in sorted(abs_dir.iterdir(), key=lambda p: p.name.lower()):
        if entry.name.startswith("."):
            continue
        label = f"{entry.name}/" if entry.is_dir() else entry.name
        entries.append(label)

    if not entries:
        return ["- (empty)"]

    rendered = [f"- `{name}`" for name in entries[:MAX_CONTENT_ITEMS]]
    if len(entries) > MAX_CONTENT_ITEMS:
        rendered.append("- `...`")
    return rendered


def build_readme(rel_dir: Path, abs_dir: Path) -> str:
    lines: list[str] = []
    lines.append(f"# {rel_dir.as_posix()}")
    lines.append("")
    lines.append("## Purpose")
    lines.append("")
    lines.append(classify_purpose(rel_dir))
    lines.append("")
    lines.append("## Contents")
    lines.append("")
    lines.extend(render_contents(abs_dir))
    lines.append("")
    lines.append("## Notes")
    lines.append("")
    lines.append("Keep this README updated when responsibilities or structure in this folder change.")
    lines.append("")
    return "\n".join(lines)


def apply_missing_readmes(repo_root: Path, missing_dirs: list[Path]) -> list[Path]:
    created: list[Path] = []

    for rel_dir in sorted(missing_dirs, key=lambda p: p.as_posix()):
        abs_dir = repo_root / rel_dir
        if has_accepted_readme(abs_dir):
            continue

        readme_path = abs_dir / "README.md"
        readme_path.write_text(build_readme(rel_dir, abs_dir), encoding="utf-8")
        created.append(rel_dir)

    return created


def print_audit(result: AuditResult) -> None:
    print("README coverage audit")
    print(f"in_scope_dirs={result.in_scope_count}")
    print(f"missing_readme_in_scope={result.missing_count}")

    print("missing_by_top_level:")
    if result.by_top_level:
        for key, value in result.by_top_level.items():
            print(f"- {key}: {value}")
    else:
        print("- none")

    print("missing_dirs:")
    if result.missing_dirs:
        for rel in result.missing_dirs:
            print(f"- {rel.as_posix()}")
    else:
        print("- none")


def write_json_report(path: Path, result: AuditResult) -> None:
    payload = {
        "in_scope_dirs_total": result.in_scope_count,
        "missing_readme_in_scope": result.missing_count,
        "missing_by_top_level": result.by_top_level,
        "missing_dirs": [p.as_posix() for p in result.missing_dirs],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def write_markdown_report(path: Path, result: AuditResult) -> None:
    lines: list[str] = []
    lines.append("# README Coverage Report")
    lines.append("")
    lines.append(f"- In-scope directories: `{result.in_scope_count}`")
    lines.append(f"- Missing README directories: `{result.missing_count}`")
    lines.append("")
    lines.append("## Missing by Top-Level")
    lines.append("")
    if result.by_top_level:
        for key, value in result.by_top_level.items():
            lines.append(f"- `{key}`: `{value}`")
    else:
        lines.append("- none")
    lines.append("")
    lines.append("## Missing Directories")
    lines.append("")
    if result.missing_dirs:
        for rel in result.missing_dirs:
            lines.append(f"- `{rel.as_posix()}`")
    else:
        lines.append("- none")
    lines.append("")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def maybe_write_reports(json_path: str | None, md_path: str | None, result: AuditResult) -> None:
    if json_path:
        write_json_report(Path(json_path), result)
    if md_path:
        write_markdown_report(Path(md_path), result)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit/apply README coverage for non-dot, non-ignored folders.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    audit = subparsers.add_parser("audit", help="Audit README coverage")
    audit.add_argument("--report-json", default=None, help="Optional JSON report output path")
    audit.add_argument("--report-md", default=None, help="Optional Markdown report output path")

    apply_cmd = subparsers.add_parser("apply", help="Create missing README.md files")
    apply_cmd.add_argument("--report-json", default=None, help="Optional JSON report output path")
    apply_cmd.add_argument("--report-md", default=None, help="Optional Markdown report output path")

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(".").resolve()

    if args.command == "audit":
        result = audit_repo(repo_root)
        print_audit(result)
        maybe_write_reports(args.report_json, args.report_md, result)
        return 1 if result.missing_count > 0 else 0

    if args.command == "apply":
        before = audit_repo(repo_root)
        print("README coverage apply")
        print(f"missing_before={before.missing_count}")

        created = apply_missing_readmes(repo_root, before.missing_dirs)
        print(f"created_readmes={len(created)}")

        after = audit_repo(repo_root)
        print(f"missing_after={after.missing_count}")

        maybe_write_reports(args.report_json, args.report_md, after)

        if after.missing_count > 0:
            print_audit(after)
            return 2
        return 0

    print(f"ERROR: Unsupported command: {args.command}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
