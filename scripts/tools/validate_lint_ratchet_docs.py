#!/usr/bin/env python3
"""Validate lint ratchet documentation artifacts."""

from __future__ import annotations

from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
DOC_PATH = REPO_ROOT / "docs" / "quality" / "lint-ratchet-status.md"
BASELINE_FILES = (
    REPO_ROOT / "docs" / "quality" / "baseline" / "e712-app.txt",
    REPO_ROOT / "docs" / "quality" / "baseline" / "e402-app.txt",
    REPO_ROOT / "docs" / "quality" / "baseline" / "e501-app.txt",
)
REQUIRED_SECTIONS = (
    "## Required Sections",
    "## Ratchet Classes",
    "## Notes",
)


def main() -> int:
    errors: list[str] = []

    if not DOC_PATH.is_file():
        errors.append(f"Missing ratchet status doc: {DOC_PATH.relative_to(REPO_ROOT)}")
    else:
        text = DOC_PATH.read_text(encoding="utf-8")
        for section in REQUIRED_SECTIONS:
            if section not in text:
                errors.append(f"Missing section {section!r} in {DOC_PATH.relative_to(REPO_ROOT)}")

    for baseline_path in BASELINE_FILES:
        if not baseline_path.is_file():
            errors.append(f"Missing baseline file: {baseline_path.relative_to(REPO_ROOT)}")

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
