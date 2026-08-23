#!/usr/bin/env python3
"""Validate the documentation and work-tracking authority contract."""

from __future__ import annotations

from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
OWNERSHIP = REPO_ROOT / "docs/DOCUMENTATION_OWNERSHIP.md"

REQUIRED_LINKS = {
    REPO_ROOT / "docs/README.md": "DOCUMENTATION_OWNERSHIP.md",
    REPO_ROOT / "docs/DOCUMENTATION_TREE.md": "DOCUMENTATION_OWNERSHIP.md",
    REPO_ROOT / ".planning/README.md": "../docs/DOCUMENTATION_OWNERSHIP.md",
    REPO_ROOT / "CONTRIBUTING.md": "docs/DOCUMENTATION_OWNERSHIP.md",
}

REQUIRED_HEADINGS = {
    "## Operating Model",
    "## Authority Matrix",
    "## Conflict Resolution",
    "## Update Triggers",
    "## Duplication Rule",
    "## Archival Boundary",
    "## Validation",
}

REQUIRED_TERMS = {
    "GitHub Issues and Projects",
    ".planning/STATE.md",
    "Live delivery truth",
    "Versioned repository truth",
    "Historical phase records",
}


def validate() -> list[str]:
    errors: list[str] = []

    if not OWNERSHIP.is_file():
        return [f"missing authority document: {OWNERSHIP.relative_to(REPO_ROOT)}"]

    ownership_text = OWNERSHIP.read_text(encoding="utf-8")
    for heading in sorted(REQUIRED_HEADINGS):
        if heading not in ownership_text:
            errors.append(f"authority document is missing heading: {heading}")
    for term in sorted(REQUIRED_TERMS):
        if term not in ownership_text:
            errors.append(f"authority document is missing required term: {term}")

    for path, link in REQUIRED_LINKS.items():
        if not path.is_file():
            errors.append(f"missing index file: {path.relative_to(REPO_ROOT)}")
            continue
        text = path.read_text(encoding="utf-8")
        if link not in text:
            errors.append(
                f"{path.relative_to(REPO_ROOT)} does not link to the authority document"
            )

    planning_text = (REPO_ROOT / ".planning/README.md").read_text(encoding="utf-8")
    if "Active Planning Truth" in planning_text:
        errors.append(
            ".planning/README.md still claims an unqualified second live source of truth"
        )
    if "GitHub Issues" not in planning_text:
        errors.append(".planning/README.md must identify the live delivery tracker")

    return errors


def main() -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"documentation-ownership error: {error}", file=sys.stderr)
        return 1
    print("Documentation ownership contract: valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
