#!/usr/bin/env python3
"""Record and enforce the frontend Trivy container-scan outcome."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
SCANNER = "trivy"
IMAGE = "riskhub-frontend:scan"
CLEAN_STATUS = "clean"


def _load_sarif(path: Path) -> tuple[bool, bool, int, str | None]:
    if not path.is_file():
        return False, False, 0, "sarif_missing"

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return True, False, 0, "sarif_invalid_json"

    if not isinstance(payload, dict) or payload.get("version") != "2.1.0":
        return True, False, 0, "sarif_invalid_shape"

    runs = payload.get("runs")
    if not isinstance(runs, list):
        return True, False, 0, "sarif_invalid_shape"

    finding_count = 0
    for run in runs:
        if not isinstance(run, dict):
            return True, False, 0, "sarif_invalid_shape"
        results = run.get("results", [])
        if not isinstance(results, list):
            return True, False, 0, "sarif_invalid_shape"
        finding_count += len(results)

    return True, True, finding_count, None


def build_status(*, outcome: str, sarif_path: Path) -> dict[str, Any]:
    normalized_outcome = outcome.strip().lower() or "unknown"
    sarif_present, sarif_valid, finding_count, evidence_reason = _load_sarif(
        sarif_path
    )

    if not sarif_present:
        status = "scan_failed"
        reason = evidence_reason
    elif not sarif_valid:
        status = "evidence_invalid"
        reason = evidence_reason
    elif finding_count > 0:
        status = "findings"
        reason = "high_or_critical_findings"
    elif normalized_outcome != "success":
        status = "scan_failed"
        reason = f"scan_outcome_{normalized_outcome}"
    else:
        status = CLEAN_STATUS
        reason = None

    return {
        "schema_version": SCHEMA_VERSION,
        "scanner": SCANNER,
        "image": IMAGE,
        "scan_outcome": normalized_outcome,
        "sarif_path": str(sarif_path),
        "sarif_present": sarif_present,
        "sarif_valid": sarif_valid,
        "finding_count": finding_count,
        "status": status,
        "reason": reason,
    }


def record(*, outcome: str, sarif_path: Path, output_path: Path) -> int:
    payload = build_status(outcome=outcome, sarif_path=sarif_path)
    output_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(
        "Frontend Trivy status recorded: "
        f"status={payload['status']} outcome={payload['scan_outcome']} "
        f"findings={payload['finding_count']}"
    )
    return 0


def enforce(*, status_path: Path) -> int:
    try:
        payload = json.loads(status_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        print(
            f"Frontend Trivy gate cannot read status evidence: {exc}",
            file=sys.stderr,
        )
        return 1

    if not isinstance(payload, dict) or payload.get("schema_version") != SCHEMA_VERSION:
        print("Frontend Trivy status evidence has an invalid schema", file=sys.stderr)
        return 1

    status = payload.get("status")
    outcome = payload.get("scan_outcome")
    findings = payload.get("finding_count")
    reason = payload.get("reason")
    print(
        "Frontend Trivy gate: "
        f"status={status} outcome={outcome} findings={findings} reason={reason}"
    )

    if status != CLEAN_STATUS:
        return 1
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Record or enforce frontend Trivy scan evidence."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    record_parser = subparsers.add_parser("record")
    record_parser.add_argument("--outcome", required=True)
    record_parser.add_argument("--sarif", type=Path, required=True)
    record_parser.add_argument("--output", type=Path, required=True)

    enforce_parser = subparsers.add_parser("enforce")
    enforce_parser.add_argument("--status-file", type=Path, required=True)

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "record":
        return record(
            outcome=args.outcome,
            sarif_path=args.sarif,
            output_path=args.output,
        )
    return enforce(status_path=args.status_file)


if __name__ == "__main__":
    raise SystemExit(main())
