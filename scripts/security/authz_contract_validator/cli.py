"""CLI adapter for authorization contract validation."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable

from .models import Finding


def run_cli(validate_func: Callable[[str, bool], list[Finding]]) -> int:
    parser = argparse.ArgumentParser(
        description="Validate RiskHub authorization/capability contract docs."
    )
    parser.add_argument(
        "--base-ref",
        default="HEAD",
        help="Git ref used for changed-file doc-touch enforcement. Defaults to HEAD.",
    )
    parser.add_argument(
        "--skip-doc-touch",
        action="store_true",
        help="Validate contract structure only.",
    )
    parser.add_argument(
        "paths",
        nargs="*",
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args()

    try:
        findings = validate_func(args.base_ref, args.skip_doc_touch)
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"authorization capability contract validation failed: {exc}", file=sys.stderr)
        return 2

    if findings:
        print("Authorization capability contract validation failed:", file=sys.stderr)
        for finding in findings:
            print(f"- {finding.reason}: {finding.detail}", file=sys.stderr)
        return 1

    print("Authorization capability contract validation passed.")
    return 0
