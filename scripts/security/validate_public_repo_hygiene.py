#!/usr/bin/env python3
"""Validate tracked files and git history for public-repo privacy leaks."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PATCH_COMMIT_PREFIX = "__RISKHUB_HYGIENE_PATCH_COMMIT__ "
MESSAGE_COMMIT_PREFIX = "__RISKHUB_HYGIENE_MESSAGE_COMMIT__ "
MESSAGE_END_MARKER = "__RISKHUB_HYGIENE_MESSAGE_END__"
DIFF_HEADER_RE = re.compile(r"^diff --git a/(.+) b/(.+)$")

ALLOWED_CONTENT_PATHS = {
    Path("scripts/security/run_public_repo_leak_audit.sh"),
    Path("scripts/security/validate_public_repo_hygiene.py"),
    Path("scripts/tools/docs_tree_audit.py"),
    Path("tests/backend/pytest/test_docs_tree_audit.py"),
    Path("tests/backend/pytest/test_public_repo_hygiene_validator.py"),
}

DEFAULT_HISTORY_PATCH_EXCLUDES = (
    ":(exclude)scripts/security/run_public_repo_leak_audit.sh",
    ":(exclude)scripts/security/validate_public_repo_hygiene.py",
    ":(exclude)scripts/tools/docs_tree_audit.py",
    ":(exclude)tests/backend/pytest/test_docs_tree_audit.py",
    ":(exclude)tests/backend/pytest/test_public_repo_hygiene_validator.py",
)

POSIX_PATH_COMPONENT = r"[^/\s)\]>\"']+"
WINDOWS_PATH_COMPONENT = r"[^\\\s)\]>\"']+"

FORBIDDEN_TRACKED_PATH_PREFIXES = (
    "backend/logs/",
    "frontend/.playwright-browsers/",
    "frontend/playwright-report/",
    "frontend/test-results/",
    "scripts/runtime-artifacts/",
    "tests/results/",
)

FORBIDDEN_TRACKED_PATHS = (
    ".dev-backend.pid",
    ".dev-frontend.pid",
    "backend/bandit-report.json",
    "backend/pip-audit-report.json",
    "dev.sh.pid",
    "presentation.html",
)

FORBIDDEN_CONTENT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "absolute local file URI",
        re.compile(
            rf"file:///(?:(?:Users|home)/{POSIX_PATH_COMPONENT}(?:/{POSIX_PATH_COMPONENT})+|[A-Za-z]:/Users/{POSIX_PATH_COMPONENT}(?:/{POSIX_PATH_COMPONENT})+)"
        ),
    ),
    (
        "absolute POSIX user path",
        re.compile(
            rf"(?<![A-Za-z0-9_])/(?:Users|home)/{POSIX_PATH_COMPONENT}(?:/{POSIX_PATH_COMPONENT})+"
        ),
    ),
    (
        "absolute Windows user path",
        re.compile(
            rf"(?<![A-Za-z0-9_])[A-Za-z]:\\Users\\{WINDOWS_PATH_COMPONENT}(?:\\{WINDOWS_PATH_COMPONENT})+"
        ),
    ),
)

TRAILING_PUNCTUATION = ".,);]}`"
SAFE_CONTENT_PREFIXES = (
    "/home/riskhub/",
    "/home/zap/",
    "/home/youruser/",
    "file:///home/riskhub/",
    "file:///home/zap/",
    "file:///home/youruser/",
)


@dataclass(frozen=True)
class HygieneFinding:
    kind: str
    reason: str
    path: str
    line: int | None = None
    match: str | None = None
    commit: str | None = None


def _run_git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def tracked_files() -> list[Path]:
    result = _run_git("ls-files")
    if result.returncode != 0:
        raise RuntimeError(
            f"git ls-files failed:\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return [Path(line) for line in result.stdout.splitlines() if line.strip()]


def _normalize_rel_path(raw_path: str) -> Path | None:
    candidate = Path(raw_path)
    if candidate.is_absolute():
        try:
            return candidate.resolve().relative_to(REPO_ROOT)
        except ValueError:
            return None

    try:
        return (REPO_ROOT / candidate).resolve().relative_to(REPO_ROOT)
    except ValueError:
        return None


def _decode_text(path: Path) -> str | None:
    raw = path.read_bytes()
    if b"\0" in raw[:8192]:
        return None
    return raw.decode("utf-8", errors="replace")


def _trim_match(value: str) -> str:
    return value.rstrip(TRAILING_PUNCTUATION)


def _line_findings(
    rel_path: Path | None,
    *,
    finding_path: str,
    line: str,
    line_no: int | None,
    commit: str | None,
) -> list[HygieneFinding]:
    if rel_path is not None and rel_path in ALLOWED_CONTENT_PATHS:
        return []

    findings: list[HygieneFinding] = []
    occupied: list[tuple[int, int]] = []
    for reason, pattern in FORBIDDEN_CONTENT_PATTERNS:
        for match in pattern.finditer(line):
            span = match.span()
            if any(start <= span[0] and span[1] <= end for start, end in occupied):
                continue

            trimmed_match = _trim_match(match.group(0))
            if any(
                trimmed_match.startswith(prefix) for prefix in SAFE_CONTENT_PREFIXES
            ):
                continue

            occupied.append(span)
            findings.append(
                HygieneFinding(
                    kind="content",
                    reason=reason,
                    path=finding_path,
                    line=line_no,
                    match=trimmed_match,
                    commit=commit,
                )
            )
    return findings


def path_findings(rel_path: Path) -> list[HygieneFinding]:
    path_posix = rel_path.as_posix()
    findings: list[HygieneFinding] = []
    if path_posix in FORBIDDEN_TRACKED_PATHS:
        findings.append(
            HygieneFinding(
                kind="tracked_path",
                reason="tracked generated/local-only artifact",
                path=path_posix,
            )
        )
    for prefix in FORBIDDEN_TRACKED_PATH_PREFIXES:
        if path_posix.startswith(prefix):
            findings.append(
                HygieneFinding(
                    kind="tracked_path",
                    reason="tracked generated/local-only artifact directory",
                    path=path_posix,
                )
            )
            break
    return findings


def content_findings(rel_path: Path, text: str) -> list[HygieneFinding]:
    findings: list[HygieneFinding] = []
    for line_no, line in enumerate(text.splitlines(), start=1):
        findings.extend(
            _line_findings(
                rel_path,
                finding_path=rel_path.as_posix(),
                line=line,
                line_no=line_no,
                commit=None,
            )
        )
    return findings


def scan_repo() -> list[HygieneFinding]:
    findings: list[HygieneFinding] = []
    for rel_path in tracked_files():
        findings.extend(path_findings(rel_path))
        abs_path = REPO_ROOT / rel_path
        try:
            text = _decode_text(abs_path)
        except OSError:
            continue
        if text is None:
            continue
        findings.extend(content_findings(rel_path, text))
    return findings


def scan_paths(raw_paths: list[str]) -> list[HygieneFinding]:
    findings: list[HygieneFinding] = []
    seen: set[Path] = set()
    for raw_path in raw_paths:
        rel_path = _normalize_rel_path(raw_path)
        if rel_path is None or rel_path in seen:
            continue
        seen.add(rel_path)

        abs_path = REPO_ROOT / rel_path
        if not abs_path.exists() or abs_path.is_dir():
            continue

        findings.extend(path_findings(rel_path))
        try:
            text = _decode_text(abs_path)
        except OSError:
            continue
        if text is None:
            continue
        findings.extend(content_findings(rel_path, text))
    return findings


def scan_history_patch_output(output: str) -> list[HygieneFinding]:
    findings: list[HygieneFinding] = []
    current_commit: str | None = None
    current_path: Path | None = None

    for line_no, line in enumerate(output.splitlines(), start=1):
        if line.startswith(PATCH_COMMIT_PREFIX):
            current_commit = line.removeprefix(PATCH_COMMIT_PREFIX).strip()
            current_path = None
            continue

        match = DIFF_HEADER_RE.match(line)
        if match:
            current_path = Path(match.group(2))
            continue

        if current_commit is None:
            continue

        findings.extend(
            _line_findings(
                current_path,
                finding_path=(
                    current_path.as_posix()
                    if current_path is not None
                    else "<history-patch>"
                ),
                line=line,
                line_no=line_no,
                commit=current_commit,
            )
        )
    return findings


def scan_history_message_output(output: str) -> list[HygieneFinding]:
    findings: list[HygieneFinding] = []
    current_commit: str | None = None
    message_line_no = 0

    for line in output.splitlines():
        if line.startswith(MESSAGE_COMMIT_PREFIX):
            current_commit = line.removeprefix(MESSAGE_COMMIT_PREFIX).strip()
            message_line_no = 0
            continue
        if line == MESSAGE_END_MARKER:
            current_commit = None
            message_line_no = 0
            continue
        if current_commit is None:
            continue

        message_line_no += 1
        findings.extend(
            _line_findings(
                None,
                finding_path="<commit-message>",
                line=line,
                line_no=message_line_no,
                commit=current_commit,
            )
        )
    return findings


def scan_history_patches(path_excludes: tuple[str, ...]) -> list[HygieneFinding]:
    result = _run_git(
        "log",
        "--all",
        "-p",
        "--no-ext-diff",
        "--text",
        f"--format={PATCH_COMMIT_PREFIX}%H",
        "--",
        ".",
        *path_excludes,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"git log patch scan failed:\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return scan_history_patch_output(result.stdout)


def scan_history_messages() -> list[HygieneFinding]:
    result = _run_git(
        "log",
        "--all",
        f"--format={MESSAGE_COMMIT_PREFIX}%H%n%s%n%b%n{MESSAGE_END_MARKER}",
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"git log message scan failed:\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return scan_history_message_output(result.stdout)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate public-repo hygiene and privacy leaks."
    )
    parser.add_argument(
        "--mode",
        choices=("tracked", "history-patches", "history-messages"),
        default="tracked",
        help="Scan the tracked tree, history patches, or commit messages.",
    )
    parser.add_argument(
        "--path-exclude",
        action="append",
        default=[],
        help="Additional git pathspec exclusion for history-patches mode.",
    )
    parser.add_argument(
        "--format", choices=("text", "json"), default="text", help="Output format."
    )
    parser.add_argument(
        "--output", default="", help="Optional output path for the report."
    )
    parser.add_argument(
        "paths",
        nargs="*",
        help="Optional tracked paths to scan in tracked mode. Defaults to the full tracked tree.",
    )
    return parser.parse_args()


def render_text(findings: list[HygieneFinding]) -> str:
    lines = [f"public_repo_hygiene_findings={len(findings)}"]
    if not findings:
        lines.append("Public repo hygiene validation passed.")
        return "\n".join(lines) + "\n"

    lines.append("Public repo hygiene validation failed:")
    for finding in findings:
        line_part = f":{finding.line}" if finding.line is not None else ""
        commit_part = f" [{finding.commit[:12]}]" if finding.commit else ""
        match_part = f" -> {finding.match}" if finding.match else ""
        lines.append(
            f"- {finding.reason}: {finding.path}{line_part}{commit_part}{match_part}"
        )
    return "\n".join(lines) + "\n"


def render_json(findings: list[HygieneFinding], *, mode: str) -> str:
    payload = {
        "repo_root": str(REPO_ROOT),
        "mode": mode,
        "finding_count": len(findings),
        "findings": [asdict(finding) for finding in findings],
    }
    return json.dumps(payload, indent=2, ensure_ascii=True) + "\n"


def main() -> int:
    args = parse_args()
    try:
        if args.mode == "tracked":
            findings = scan_paths(args.paths) if args.paths else scan_repo()
        elif args.mode == "history-patches":
            path_excludes = DEFAULT_HISTORY_PATCH_EXCLUDES + tuple(args.path_exclude)
            findings = scan_history_patches(path_excludes)
        else:
            findings = scan_history_messages()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    rendered = (
        render_json(findings, mode=args.mode)
        if args.format == "json"
        else render_text(findings)
    )

    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(rendered, encoding="utf-8")
    else:
        try:
            print(rendered, end="")
        except BrokenPipeError:
            return 1 if findings else 0

    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
