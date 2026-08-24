#!/usr/bin/env python3
"""Record and enforce the frontend Trivy container-scan outcome."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
SCANNER = "trivy"
IMAGE = "riskhub-frontend:scan"
CLEAN_STATUS = "clean"
VALID_STATUSES = {CLEAN_STATUS, "findings", "scan_failed", "evidence_invalid"}
SARIF_SCHEMA_URI = (
    "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/"
    "sarif-2.1/schema/sarif-schema-2.1.0.json"
)
TRIVY_DRIVER_NAME = "Trivy"
TRIVY_DRIVER_FULL_NAME = "Trivy Vulnerability Scanner"
TRIVY_INFORMATION_URI = "https://github.com/aquasecurity/trivy"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
REQUIRED_STATUS_FIELDS = {
    "schema_version",
    "scanner",
    "image",
    "scan_outcome",
    "sarif_path",
    "sarif_present",
    "sarif_valid",
    "sarif_sha256",
    "finding_count",
    "status",
    "reason",
}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _valid_result_message(result: dict[str, Any]) -> bool:
    message = result.get("message")
    if not isinstance(message, dict):
        return False
    return any(
        isinstance(message.get(field), str) and message[field].strip()
        for field in ("text", "markdown")
    )


def _load_sarif(path: Path) -> tuple[bool, bool, int, str | None, str | None]:
    if not path.is_file():
        return False, False, 0, "sarif_missing", None

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return True, False, 0, "sarif_invalid_json", None

    if not isinstance(payload, dict) or payload.get("version") != "2.1.0":
        return True, False, 0, "sarif_invalid_shape", None

    if payload.get("$schema") != SARIF_SCHEMA_URI:
        return True, False, 0, "sarif_invalid_schema", None

    runs = payload.get("runs")
    if not isinstance(runs, list) or len(runs) != 1:
        return True, False, 0, "sarif_invalid_runs", None

    run = runs[0]
    if not isinstance(run, dict):
        return True, False, 0, "sarif_invalid_runs", None

    tool = run.get("tool")
    driver = tool.get("driver") if isinstance(tool, dict) else None
    if not isinstance(driver, dict):
        return True, False, 0, "sarif_invalid_tool", None
    if driver.get("name") != TRIVY_DRIVER_NAME:
        return True, False, 0, "sarif_unexpected_tool", None
    if driver.get("fullName") != TRIVY_DRIVER_FULL_NAME:
        return True, False, 0, "sarif_unexpected_tool", None
    information_uri = driver.get("informationUri")
    if (
        not isinstance(information_uri, str)
        or information_uri.rstrip("/") != TRIVY_INFORMATION_URI
    ):
        return True, False, 0, "sarif_unexpected_tool", None
    if not isinstance(driver.get("rules"), list):
        return True, False, 0, "sarif_invalid_rules", None

    results = run.get("results")
    if not isinstance(results, list):
        return True, False, 0, "sarif_invalid_results", None
    for result in results:
        if not isinstance(result, dict):
            return True, False, 0, "sarif_invalid_results", None
        rule_id = result.get("ruleId")
        if not isinstance(rule_id, str) or not rule_id.strip():
            return True, False, 0, "sarif_invalid_result_identity", None
        if not _valid_result_message(result):
            return True, False, 0, "sarif_invalid_result_message", None

    try:
        digest = _sha256(path)
    except OSError:
        return True, False, 0, "sarif_unreadable", None
    return True, True, len(results), None, digest


def build_status(*, outcome: str, sarif_path: Path) -> dict[str, Any]:
    normalized_outcome = outcome.strip().lower() or "unknown"
    (
        sarif_present,
        sarif_valid,
        finding_count,
        evidence_reason,
        sarif_sha256,
    ) = _load_sarif(sarif_path)

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
        "sarif_sha256": sarif_sha256,
        "finding_count": finding_count,
        "status": status,
        "reason": reason,
    }


def _status_errors(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return ["status evidence must be a JSON object"]

    errors: list[str] = []
    missing = sorted(REQUIRED_STATUS_FIELDS - set(payload))
    if missing:
        errors.append("status evidence is missing required fields: " + ", ".join(missing))
        return errors

    if (
        type(payload.get("schema_version")) is not int
        or payload["schema_version"] != SCHEMA_VERSION
    ):
        errors.append("schema_version must equal 1")
    if payload.get("scanner") != SCANNER:
        errors.append(f"scanner must equal {SCANNER!r}")
    if payload.get("image") != IMAGE:
        errors.append(f"image must equal {IMAGE!r}")
    if (
        not isinstance(payload.get("scan_outcome"), str)
        or not payload["scan_outcome"]
    ):
        errors.append("scan_outcome must be a non-empty string")
    if not isinstance(payload.get("sarif_path"), str) or not payload["sarif_path"]:
        errors.append("sarif_path must be a non-empty string")
    if type(payload.get("sarif_present")) is not bool:
        errors.append("sarif_present must be a boolean")
    if type(payload.get("sarif_valid")) is not bool:
        errors.append("sarif_valid must be a boolean")
    if (
        type(payload.get("finding_count")) is not int
        or payload["finding_count"] < 0
    ):
        errors.append("finding_count must be a non-negative integer")

    digest = payload.get("sarif_sha256")
    if digest is not None and (
        not isinstance(digest, str) or SHA256_RE.fullmatch(digest) is None
    ):
        errors.append("sarif_sha256 must be null or a lowercase SHA-256 digest")

    status = payload.get("status")
    if status not in VALID_STATUSES:
        errors.append("status is not recognized")
    reason = payload.get("reason")
    if reason is not None and not isinstance(reason, str):
        errors.append("reason must be null or a string")

    if errors:
        return errors

    outcome = payload["scan_outcome"]
    present = payload["sarif_present"]
    valid = payload["sarif_valid"]
    findings = payload["finding_count"]

    if status == CLEAN_STATUS:
        if outcome != "success":
            errors.append("clean status requires scan_outcome=success")
        if not present or not valid:
            errors.append("clean status requires present, valid SARIF evidence")
        if findings != 0:
            errors.append("clean status requires finding_count=0")
        if reason is not None:
            errors.append("clean status requires reason=null")
        if not isinstance(digest, str):
            errors.append("clean status requires a SARIF digest")
    elif status == "findings":
        if not present or not valid or findings <= 0:
            errors.append("findings status requires valid SARIF with at least one result")
        if reason != "high_or_critical_findings":
            errors.append("findings status requires the qualifying-finding reason")
        if not isinstance(digest, str):
            errors.append("findings status requires a SARIF digest")
    elif status == "evidence_invalid":
        if not present or valid:
            errors.append("evidence_invalid requires present but invalid SARIF")
        if findings != 0 or digest is not None:
            errors.append("invalid evidence cannot carry findings or a digest")
    elif status == "scan_failed":
        if outcome == "success" and present:
            errors.append("scan_failed cannot describe a successful scan with present evidence")
        if findings != 0:
            errors.append("scan_failed cannot carry findings")

    return errors


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

    errors = _status_errors(payload)
    if errors:
        for error in errors:
            print(f"Frontend Trivy status evidence invalid: {error}", file=sys.stderr)
        return 1

    status = payload["status"]
    outcome = payload["scan_outcome"]
    findings = payload["finding_count"]
    reason = payload["reason"]
    print(
        "Frontend Trivy gate: "
        f"status={status} outcome={outcome} findings={findings} reason={reason}"
    )

    if status != CLEAN_STATUS:
        return 1

    sarif_path = Path(payload["sarif_path"])
    present, valid, current_findings, evidence_reason, current_digest = _load_sarif(
        sarif_path
    )
    if not present or not valid:
        print(
            "Frontend Trivy clean evidence cannot be revalidated: "
            f"{evidence_reason}",
            file=sys.stderr,
        )
        return 1
    if current_findings != 0:
        print("Frontend Trivy clean evidence now contains findings", file=sys.stderr)
        return 1
    if current_digest != payload["sarif_sha256"]:
        print("Frontend Trivy SARIF digest does not match status evidence", file=sys.stderr)
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
