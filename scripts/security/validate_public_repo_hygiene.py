#!/usr/bin/env python3
"""Validate tracked files for public-repo privacy and hygiene leaks."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]

ALLOWED_CONTENT_PATHS = {
    Path("scripts/security/run_public_repo_leak_audit.sh"),
    Path("scripts/security/validate_public_repo_hygiene.py"),
    Path("scripts/tools/docs_tree_audit.py"),
    Path("tests/backend/pytest/test_docs_tree_audit.py"),
    Path("tests/backend/pytest/test_public_repo_hygiene_validator.py"),
}

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
    "placeholder-presentation-output.pdf",
    "presentation.html",
)

FORBIDDEN_CONTENT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "absolute local file URI",
        re.compile(
            r"file:///(?:Users/[^/\s]+/[^/\s]+/|home/[^/\s]+/[^/\s]+/|[A-Za-z]:/Users/[^/\s]+/[^/\s]+/)[^\s)>\]\"']+",
        ),
    ),
    (
        "absolute POSIX user path",
        re.compile(r"(?<![A-Za-z0-9_])/(?:Users|home)/[^/\s]+/[^/\s]+/[^\s)>\]\"']+"),
    ),
    (
        "absolute Windows user path",
        re.compile(
            r"(?<![A-Za-z0-9_])[A-Za-z]:\\Users\\[^\\\s)>\]\"']+(?:\\[^\\\s)>\]\"']+){2,}"
        ),
    ),
)

TRAILING_PUNCTUATION = ".,);]}`"
SAFE_CONTENT_PREFIXES = (
    "/home/riskhub/",
    "/home/zap/",
    "file:///home/riskhub/",
    "file:///home/zap/",
)


@dataclass(frozen=True)
class HygieneFinding:
    kind: str
    reason: str
    path: str
    line: int | None = None
    match: str | None = None


def _run_git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def tracked_files() -> list[Path]:
    result = _run_git("ls-files")
    if result.returncode != 0:
        raise RuntimeError(f"git ls-files failed:\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}")
    return [Path(line) for line in result.stdout.splitlines() if line.strip()]


def _decode_text(path: Path) -> str | None:
    raw = path.read_bytes()
    if b"\0" in raw[:8192]:
        return None
    return raw.decode("utf-8", errors="replace")


def _trim_match(value: str) -> str:
    return value.rstrip(TRAILING_PUNCTUATION)


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
    if rel_path in ALLOWED_CONTENT_PATHS:
        return []

    findings: list[HygieneFinding] = []
    for line_no, line in enumerate(text.splitlines(), start=1):
        occupied: list[tuple[int, int]] = []
        for reason, pattern in FORBIDDEN_CONTENT_PATTERNS:
            for match in pattern.finditer(line):
                span = match.span()
                if any(start <= span[0] and span[1] <= end for start, end in occupied):
                    continue
                trimmed_match = _trim_match(match.group(0))
                if any(trimmed_match.startswith(prefix) for prefix in SAFE_CONTENT_PREFIXES):
                    continue
                occupied.append(span)
                findings.append(
                    HygieneFinding(
                        kind="content",
                        reason=reason,
                        path=rel_path.as_posix(),
                        line=line_no,
                        match=trimmed_match,
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate public-repo hygiene and privacy leaks.")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="Output format.")
    parser.add_argument("--output", default="", help="Optional output path for the report.")
    return parser.parse_args()


def render_text(findings: list[HygieneFinding]) -> str:
    lines = [f"public_repo_hygiene_findings={len(findings)}"]
    if not findings:
        lines.append("Public repo hygiene validation passed.")
        return "\n".join(lines) + "\n"

    lines.append("Public repo hygiene validation failed:")
    for finding in findings:
        line_part = f":{finding.line}" if finding.line is not None else ""
        match_part = f" -> {finding.match}" if finding.match else ""
        lines.append(f"- {finding.reason}: {finding.path}{line_part}{match_part}")
    return "\n".join(lines) + "\n"


def render_json(findings: list[HygieneFinding]) -> str:
    payload = {
        "repo_root": str(REPO_ROOT),
        "finding_count": len(findings),
        "findings": [asdict(finding) for finding in findings],
    }
    return json.dumps(payload, indent=2, ensure_ascii=True) + "\n"


def main() -> int:
    args = parse_args()
    findings = scan_repo()
    rendered = render_json(findings) if args.format == "json" else render_text(findings)

    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    else:
        try:
            print(rendered, end="")
        except BrokenPipeError:
            return 1 if findings else 0

    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
