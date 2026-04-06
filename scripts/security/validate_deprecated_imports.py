#!/usr/bin/env python3
"""Block net-new imports of deprecated compatibility facades."""

from __future__ import annotations

from pathlib import Path
import re
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
SCAN_ROOTS = (
    REPO_ROOT / "backend" / "app",
    REPO_ROOT / "tests" / "backend" / "pytest",
)
DEPRECATED_IMPORTS = {
    "app.services.outbox_service": set(),
    "app.middleware.security": set(),
}


def main() -> int:
    violations: list[str] = []
    patterns = {
        deprecated_import: re.compile(
            rf"(^|\n)\s*(from|import)\s+{re.escape(deprecated_import)}(\s|$)",
            re.MULTILINE,
        )
        for deprecated_import in DEPRECATED_IMPORTS
    }

    for scan_root in SCAN_ROOTS:
        for path in scan_root.rglob("*.py"):
            relative_path = path.relative_to(REPO_ROOT).as_posix()
            text = path.read_text(encoding="utf-8")
            for deprecated_import, allowlist in DEPRECATED_IMPORTS.items():
                if not patterns[deprecated_import].search(text):
                    continue
                if relative_path not in allowlist:
                    violations.append(f"{relative_path} imports deprecated facade {deprecated_import}")

    if violations:
        for violation in violations:
            print(violation, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
