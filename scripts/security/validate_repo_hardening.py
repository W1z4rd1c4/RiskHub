#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]

CHECKS: tuple[tuple[str, Path, re.Pattern[str]], ...] = (
    ("mutable workflow ref", REPO_ROOT / ".github" / "workflows", re.compile(r"@master\b")),
    ("latest image tag", REPO_ROOT / ".github" / "workflows", re.compile(r":latest\b")),
    ("legacy X-XSS-Protection header", REPO_ROOT / "backend" / "app", re.compile(r"\bX-XSS-Protection\b")),
    ("legacy X-XSS-Protection header", REPO_ROOT / "frontend" / "nginx.conf", re.compile(r"\bX-XSS-Protection\b")),
    ("legacy X-XSS-Protection header", REPO_ROOT / "scripts" / "verify_security_headers.py", re.compile(r"\bX-XSS-Protection\b")),
    ("duplicate sanitizeReturnTo definitions", REPO_ROOT / "frontend" / "src", re.compile(r"\bfunction sanitizeReturnTo\b")),
    ("hardNavigate usage", REPO_ROOT / "frontend" / "src", re.compile(r"\bhardNavigate\b")),
    (
        "window.location.assign usage",
        REPO_ROOT / "frontend" / "src",
        re.compile(r"\bwindow\.location\.assign\b"),
    ),
    (
        "window.location.reload usage",
        REPO_ROOT / "frontend" / "src",
        re.compile(r"\bwindow\.location\.reload\b"),
    ),
    ("inline React styles", REPO_ROOT / "frontend" / "src", re.compile(r"style=\{\{")),
    (
        "production CSP style unsafe-inline",
        REPO_ROOT / "frontend" / "nginx.conf",
        re.compile(r"style-src [^\n]*'unsafe-inline'"),
    ),
    (
        "production CSP style unsafe-inline",
        REPO_ROOT / "scripts" / "deploy" / "templates" / "linux" / "nginx-site.conf.tmpl",
        re.compile(r"style-src [^\n]*'unsafe-inline'"),
    ),
)

IGNORED_PATH_PATTERNS = (
    re.compile(r"/node_modules/"),
    re.compile(r"/dist/"),
    re.compile(r"/tests/results/"),
    re.compile(r"/coverage_html/"),
)


def iter_files(root: Path) -> list[Path]:
    if root.is_file():
        return [root]
    return [path for path in root.rglob("*") if path.is_file()]


def is_ignored(path: Path) -> bool:
    as_posix = path.as_posix()
    return any(pattern.search(as_posix) for pattern in IGNORED_PATH_PATTERNS)


def main() -> int:
    failures: list[str] = []

    sanitize_hits = 0

    for label, root, pattern in CHECKS:
        for path in iter_files(root):
            if is_ignored(path):
                continue
            try:
                content = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue

            matches = list(pattern.finditer(content))
            if not matches:
                continue

            if label == "duplicate sanitizeReturnTo definitions":
                sanitize_hits += len(matches)
                continue

            for match in matches:
                line = content.count("\n", 0, match.start()) + 1
                failures.append(f"{label}: {path.relative_to(REPO_ROOT)}:{line}")

    if sanitize_hits > 1:
        failures.append(f"duplicate sanitizeReturnTo definitions: found {sanitize_hits}")

    if failures:
        print("Repository hardening validation failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("Repository hardening validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
