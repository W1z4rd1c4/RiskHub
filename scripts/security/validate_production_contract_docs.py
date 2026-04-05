#!/usr/bin/env python3
"""Validate production contract parity across bootstrap, docs, and examples."""

from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.core.production_contract import (  # noqa: E402
    PRODUCTION_ENV_EXPECTED_LINES,
    PRODUCTION_INVARIANTS,
    PRODUCTION_REFERENCE_REQUIRED_SNIPPETS,
    PRODUCTION_REQUIRED_CONFIG_KEYS,
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def main() -> int:
    env_example = _read(REPO_ROOT / ".env.example")
    deployment_reference = _read(REPO_ROOT / "docs" / "deployment" / "reference.md")

    errors: list[str] = []

    for key in PRODUCTION_REQUIRED_CONFIG_KEYS:
        if key not in deployment_reference:
            errors.append(f"docs/deployment/reference.md: missing required production config key `{key}`")

    for snippet in PRODUCTION_ENV_EXPECTED_LINES:
        if snippet not in env_example:
            errors.append(f".env.example: missing expected production-safe line `{snippet}`")

    for snippet in PRODUCTION_REFERENCE_REQUIRED_SNIPPETS:
        if snippet not in deployment_reference:
            errors.append(f"docs/deployment/reference.md: missing required production contract snippet `{snippet}`")

    for invariant in PRODUCTION_INVARIANTS:
        if invariant.required_value is None:
            continue
        reference_line = f"`{invariant.key}={invariant.required_value}`"
        if reference_line not in deployment_reference:
            errors.append(
                "docs/deployment/reference.md: missing production invariant line "
                f"`{invariant.key}={invariant.required_value}`"
            )

    if errors:
        print("Production contract doc validation failed:", file=sys.stderr)
        for error in errors:
            print(f" - {error}", file=sys.stderr)
        return 1

    print("Production contract doc validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
