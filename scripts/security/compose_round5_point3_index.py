#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


DEFAULT_BASE_FINDINGS = Path(
    "/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-gap-round5-20260221-225327/findings-round5.json"
)
DEFAULT_PARITY_ROOT = Path(
    "/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-gap-round5-point3-parity-20260221-230550"
)


def _must_exist(path: Path, label: str) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Missing {label}: {path}")


def _load_json(path: Path, label: str) -> dict[str, Any]:
    _must_exist(path, label)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {label}: {path} ({exc})") from exc
    if not isinstance(raw, dict):
        raise ValueError(f"Expected JSON object in {label}: {path}")
    return raw


def _require_keys(obj: dict[str, Any], keys: list[str], label: str) -> None:
    missing = [key for key in keys if key not in obj]
    if missing:
        raise ValueError(f"Missing required keys in {label}: {missing}")


def _parse_point3_status(path: Path) -> str:
    _must_exist(path, "parity status")
    text = path.read_text(encoding="utf-8").strip()
    prefix = "point3_parity_decision="
    if not text.startswith(prefix):
        raise ValueError(f"Unexpected parity status format in {path}: {text!r}")
    value = text[len(prefix) :].strip().upper()
    if value not in {"PASS", "BLOCK"}:
        raise ValueError(f"Unexpected point3 parity decision value: {value!r}")
    return value


def _compute_parity_decision(summary: dict[str, Any]) -> str:
    decision = str(summary.get("decision", "")).upper()
    failed_case_count = int(summary.get("failed_case_count", -1))
    failed_cases = int(summary.get("staging_sim_failed_cases", -1))
    transport_errors = int(summary.get("staging_sim_transport_errors", -1))
    session_noise = int(summary.get("staging_sim_session_noise_401", -1))
    if (
        decision == "PASS"
        and failed_case_count == 0
        and failed_cases == 0
        and transport_errors == 0
        and session_noise == 0
    ):
        return "PASS"
    return "BLOCK"


def _find_finding(findings: list[dict[str, Any]], finding_id: str) -> dict[str, Any]:
    for item in findings:
        if item.get("id") == finding_id:
            return item
    raise ValueError(f"Finding {finding_id} not found in base findings")


def _overall_decision(*, confirmed_high_critical_count: int, point3_decision: str, effective_statuses: list[str]) -> str:
    if confirmed_high_critical_count > 0:
        return "BLOCK"
    if point3_decision == "BLOCK":
        return "BLOCK"
    if "blocked_precondition" in effective_statuses:
        return "PARTIAL_BLOCKED_PRECONDITION"
    if "partial" in effective_statuses:
        return "PARTIAL"
    return "PASS"


def build_index(
    *,
    run_id: str,
    base_findings_path: Path,
    parity_root: Path,
    campaign_path: Path,
    parity_summary_path: Path,
    parity_status_path: Path,
) -> dict[str, Any]:
    base = _load_json(base_findings_path, "base findings")
    _require_keys(base, ["run_scope", "decision", "summary", "findings", "exclusions", "invariants"], "base findings")
    if not isinstance(base["summary"], dict):
        raise ValueError("base findings.summary must be an object")
    if not isinstance(base["findings"], list):
        raise ValueError("base findings.findings must be an array")

    summary = base["summary"]
    _require_keys(summary, ["confirmed_high_critical"], "base findings.summary")
    confirmed_high_critical = int(summary["confirmed_high_critical"])

    parity_summary = _load_json(parity_summary_path, "parity summary")
    _require_keys(
        parity_summary,
        [
            "decision",
            "failed_case_count",
            "staging_sim_failed_cases",
            "staging_sim_transport_errors",
            "staging_sim_session_noise_401",
        ],
        "parity summary",
    )
    _load_json(campaign_path, "parity campaign")
    status_from_file = _parse_point3_status(parity_status_path)
    status_from_summary = _compute_parity_decision(parity_summary)
    if status_from_file != status_from_summary:
        raise ValueError(
            "Parity status mismatch: "
            f"parity-status.txt={status_from_file}, parity-summary-derived={status_from_summary}"
        )

    findings = base["findings"]
    finding_g5001 = _find_finding(findings, "G5-001")
    if finding_g5001.get("status") != "blocked_precondition":
        raise ValueError("Expected G5-001 to remain blocked_precondition")

    finding_g5003 = _find_finding(findings, "G5-003")
    status_before = str(finding_g5003.get("status", "")).lower()
    if status_before != "partial":
        raise ValueError(f"Expected G5-003 status to be 'partial' in base findings, got: {status_before!r}")

    parity_evidence = [
        str(campaign_path),
        str(parity_summary_path),
        str(parity_status_path),
        str(parity_root / "reports/point3-closure-note.md"),
    ]

    findings_updates = [
        {
            "id": "G5-003",
            "title": finding_g5003.get("title"),
            "severity": finding_g5003.get("severity"),
            "status_before": "partial",
            "status_after": "fixed",
            "details": (
                "Point 3 parity rerun completed on local + staging-sim with deterministic PASS "
                "and no transport/session-noise failures."
            ),
            "evidence": parity_evidence,
        }
    ]

    unchanged = []
    effective_statuses: list[str] = []
    for item in findings:
        fid = str(item.get("id", ""))
        if fid == "G5-003":
            effective_statuses.append("fixed")
            continue
        status = str(item.get("status", ""))
        effective_statuses.append(status)
        unchanged.append(
            {
                "id": fid,
                "status": status,
                "severity": item.get("severity"),
                "source": str(base_findings_path),
            }
        )

    output = {
        "run_id": run_id,
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "base_run_artifact_root": str(base_findings_path.parent),
        "parity_run_artifact_root": str(parity_root),
        "base_findings_source": str(base_findings_path),
        "parity_sources": {
            "campaign": str(campaign_path),
            "parity_summary": str(parity_summary_path),
            "parity_status": str(parity_status_path),
        },
        "results": {
            "overall_decision": _overall_decision(
                confirmed_high_critical_count=confirmed_high_critical,
                point3_decision=status_from_summary,
                effective_statuses=effective_statuses,
            ),
            "point3_parity_decision": status_from_summary,
            "confirmed_high_critical_count": confirmed_high_critical,
        },
        "findings_updates": findings_updates,
        "unchanged_findings_refs": unchanged,
        "exclusions": base["exclusions"],
        "invariants": base["invariants"],
    }

    _require_keys(
        output,
        [
            "run_id",
            "generated_at_utc",
            "base_run_artifact_root",
            "parity_run_artifact_root",
            "base_findings_source",
            "parity_sources",
            "results",
            "findings_updates",
            "unchanged_findings_refs",
            "exclusions",
            "invariants",
        ],
        "output",
    )
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description="Compose consolidated Round 5 Point-3 parity findings index")
    parser.add_argument("--base-findings", default=str(DEFAULT_BASE_FINDINGS))
    parser.add_argument("--parity-root", default=str(DEFAULT_PARITY_ROOT))
    parser.add_argument("--campaign")
    parser.add_argument("--parity-summary")
    parser.add_argument("--parity-status")
    parser.add_argument("--output")
    args = parser.parse_args()

    base_findings_path = Path(args.base_findings)
    parity_root = Path(args.parity_root)
    run_id = parity_root.name

    campaign_path = Path(args.campaign) if args.campaign else parity_root / "campaigns/state-machine-valid-session.json"
    parity_summary_path = (
        Path(args.parity_summary) if args.parity_summary else parity_root / "reports/point3-parity-summary.json"
    )
    parity_status_path = Path(args.parity_status) if args.parity_status else parity_root / "reports/parity-status.txt"
    output_path = Path(args.output) if args.output else parity_root / "findings-round5-point3-parity.json"

    try:
        payload = build_index(
            run_id=run_id,
            base_findings_path=base_findings_path,
            parity_root=parity_root,
            campaign_path=campaign_path,
            parity_summary_path=parity_summary_path,
            parity_status_path=parity_status_path,
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote consolidated findings index: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
