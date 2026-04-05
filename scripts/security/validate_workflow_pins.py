#!/usr/bin/env python3
"""Fail CI when security-sensitive workflows use mutable action or image refs."""

from __future__ import annotations

import re
import sys
from pathlib import Path

USES_RE = re.compile(r"^\s*-\s+uses:\s+([^\s]+)")
IMAGE_RE = re.compile(r"^\s*image:\s+([^\s]+)")
FULL_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
PINNED_IMAGE_RE = re.compile(r"anchore/(?:syft|grype):[^\s'\"]+@sha256:[0-9a-f]{64}")
EXTERNAL_IMAGE_RE = re.compile(r"^[a-z0-9./_-]+:[^@\s'\"]+@sha256:[0-9a-f]{64}$")


def _strip_quotes(value: str) -> str:
    return value.strip().strip("'").strip('"')


def validate_workflow(path: Path) -> list[str]:
    errors: list[str] = []

    for lineno, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.split("#", 1)[0].rstrip()
        if not line:
            continue

        uses_match = USES_RE.match(line)
        if uses_match:
            target = _strip_quotes(uses_match.group(1))
            if target.startswith("./"):
                continue
            if "@" not in target:
                errors.append(f"{path}:{lineno}: action ref is missing '@': {target}")
                continue

            ref = target.rsplit("@", 1)[1]
            if not FULL_SHA_RE.fullmatch(ref):
                errors.append(
                    f"{path}:{lineno}: action ref must be pinned to a full commit SHA, found {target}",
                )

        if ":latest" in line:
            errors.append(f"{path}:{lineno}: mutable image tag ':latest' is forbidden")

        if "docker://" in line and "@sha256:" not in line:
            errors.append(f"{path}:{lineno}: docker:// action image must be pinned by digest")

        if ("anchore/syft:" in line or "anchore/grype:" in line) and not PINNED_IMAGE_RE.search(line):
            errors.append(
                f"{path}:{lineno}: scanner image must include an explicit version tag and digest",
            )

        image_match = IMAGE_RE.match(line)
        if image_match:
            target = _strip_quotes(image_match.group(1))
            if target.startswith("${{"):
                continue
            if ":" not in target:
                continue
            if not EXTERNAL_IMAGE_RE.fullmatch(target):
                errors.append(
                    f"{path}:{lineno}: workflow service image must include an explicit version tag and digest, found {target}",
                )

    return errors


def main(argv: list[str]) -> int:
    paths = [Path(arg) for arg in argv] or sorted(Path(".github/workflows").glob("*.yml"))

    errors: list[str] = []
    for path in paths:
        if not path.exists():
            errors.append(f"{path}: file not found")
            continue
        errors.extend(validate_workflow(path))

    if errors:
        print("Workflow pin validation failed:", file=sys.stderr)
        for error in errors:
            print(f" - {error}", file=sys.stderr)
        return 1

    print("Workflow pin validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
