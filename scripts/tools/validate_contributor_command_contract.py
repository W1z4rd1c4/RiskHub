#!/usr/bin/env python3
"""Validate the stable RiskHub contributor command façade."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FACADE = REPO_ROOT / "scripts/riskhub.sh"
SCRIPT_README = REPO_ROOT / "scripts/README.md"
DEVELOPMENT_README = REPO_ROOT / "docs/development/README.md"
CONTRACT_DOC = REPO_ROOT / "docs/development/CONTRIBUTOR_COMMANDS.md"

EXPECTED_DELEGATES = {
    "setup": "exec ./scripts/install.sh doctor --mode dev --repair",
    "dev": 'exec ./scripts/install.sh dev "$@"',
    "lint": "exec make --no-print-directory -f scripts/Makefile lint",
    "test": "exec make --no-print-directory -f scripts/Makefile test",
    "e2e": "exec make --no-print-directory -f scripts/Makefile test-e2e",
    "release-check": (
        "exec make --no-print-directory -f scripts/Makefile release-parity-audit"
    ),
    "clean": "exec make --no-print-directory -f scripts/Makefile clean",
}


def validate() -> list[str]:
    errors: list[str] = []

    if not FACADE.is_file():
        return ["missing scripts/riskhub.sh"]
    if not os.access(FACADE, os.X_OK):
        errors.append("scripts/riskhub.sh must be executable")

    script_text = FACADE.read_text(encoding="utf-8")
    for command, delegate in EXPECTED_DELEGATES.items():
        if f"    {command})" not in script_text:
            errors.append(f"missing command case: {command}")
        if delegate not in script_text:
            errors.append(f"command {command} does not use its canonical delegate")

    exec_lines = [
        line.strip()
        for line in script_text.splitlines()
        if line.strip().startswith("exec ")
    ]
    if set(exec_lines) != set(EXPECTED_DELEGATES.values()):
        errors.append("façade contains an undocumented or duplicated executable path")

    syntax = subprocess.run(
        ["bash", "-n", str(FACADE)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if syntax.returncode != 0:
        errors.append(f"bash syntax validation failed: {syntax.stderr.strip()}")

    documentation_checks = {
        SCRIPT_README: "docs/development/CONTRIBUTOR_COMMANDS.md",
        DEVELOPMENT_README: "CONTRIBUTOR_COMMANDS.md",
    }
    for path, expected_link in documentation_checks.items():
        if not path.is_file():
            errors.append(f"missing documentation index: {path.relative_to(REPO_ROOT)}")
            continue
        if expected_link not in path.read_text(encoding="utf-8"):
            errors.append(
                f"{path.relative_to(REPO_ROOT)} does not link to the command contract"
            )

    if not CONTRACT_DOC.is_file():
        errors.append("missing contributor command contract document")
    else:
        contract_text = CONTRACT_DOC.read_text(encoding="utf-8")
        for command in (*EXPECTED_DELEGATES, "help"):
            if f"`{command}" not in contract_text:
                errors.append(f"command contract does not document {command}")
        for required_section in (
            "## Stable Commands",
            "## Advanced Surface",
            "## CI Gate Map",
            "## Change Policy",
            "## Validation",
        ):
            if required_section not in contract_text:
                errors.append(f"command contract is missing {required_section}")

    return errors


def main() -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"contributor-command error: {error}", file=sys.stderr)
        return 1
    print("Contributor command contract: valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
