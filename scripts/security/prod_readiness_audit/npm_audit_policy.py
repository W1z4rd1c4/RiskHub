from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

HIGH_CRITICAL = {"high", "critical"}
REQUIRED_POLICY_FIELDS = {
    "id",
    "severity",
    "packages",
    "owner",
    "reason",
    "reachability_evidence",
    "no_fixed_version_proof",
    "exit_criterion",
    "expires_on",
}


class NpmAuditPolicyError(ValueError):
    pass


def _load_policy(policy_path: Path, today: date) -> dict[str, Any]:
    try:
        document = json.loads(policy_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise NpmAuditPolicyError(f"invalid npm audit policy: {exc}") from exc
    if not isinstance(document, dict) or document.get("schema_version") != 1:
        raise NpmAuditPolicyError("invalid npm audit policy schema_version")
    policy = document.get("accepted_advisory")
    if not isinstance(policy, dict):
        raise NpmAuditPolicyError("invalid npm audit policy accepted_advisory")
    missing = sorted(REQUIRED_POLICY_FIELDS - policy.keys())
    if missing:
        raise NpmAuditPolicyError(
            f"invalid npm audit policy: missing {', '.join(missing)}"
        )
    for field in REQUIRED_POLICY_FIELDS - {"packages"}:
        if not isinstance(policy[field], str) or not policy[field].strip():
            raise NpmAuditPolicyError(f"invalid npm audit policy field: {field}")
    packages = policy["packages"]
    if (
        not isinstance(packages, list)
        or not packages
        or not all(isinstance(package, str) and package for package in packages)
        or len(packages) != len(set(packages))
    ):
        raise NpmAuditPolicyError("invalid npm audit policy field: packages")
    if not re.fullmatch(r"GHSA-[a-z0-9]{4}(?:-[a-z0-9]{4}){2}", policy["id"]):
        raise NpmAuditPolicyError("invalid npm audit policy field: id")
    if policy["severity"] not in HIGH_CRITICAL:
        raise NpmAuditPolicyError("invalid npm audit policy field: severity")
    try:
        expiry = date.fromisoformat(policy["expires_on"])
    except ValueError as exc:
        raise NpmAuditPolicyError("invalid npm audit policy field: expires_on") from exc
    if today > expiry:
        raise NpmAuditPolicyError(f"npm audit policy expired on {expiry.isoformat()}")
    return policy


def _advisory_id(url: object) -> str | None:
    prefix = "https://github.com/advisories/"
    if isinstance(url, str) and url.startswith(prefix):
        return url.removeprefix(prefix)
    return None


def _resolved_advisories(
    package: str, vulnerabilities: dict[str, Any], seen: set[str]
) -> set[str]:
    if package in seen:
        return set()
    seen.add(package)
    entry = vulnerabilities.get(package, {})
    if not isinstance(entry, dict):
        return set()
    resolved: set[str] = set()
    for via in entry.get("via", []):
        if isinstance(via, str):
            resolved.update(_resolved_advisories(via, vulnerabilities, seen))
        elif isinstance(via, dict):
            advisory = _advisory_id(via.get("url"))
            if advisory:
                resolved.add(advisory)
    return resolved


def _load_audit(raw_report: Path) -> dict[str, Any]:
    try:
        payload = json.loads(raw_report.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise NpmAuditPolicyError(f"invalid npm audit report: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("auditReportVersion") != 2:
        raise NpmAuditPolicyError("invalid npm audit report version")
    vulnerabilities = payload.get("vulnerabilities")
    metadata = payload.get("metadata")
    counts = metadata.get("vulnerabilities") if isinstance(metadata, dict) else None
    if not isinstance(vulnerabilities, dict) or not isinstance(counts, dict):
        raise NpmAuditPolicyError("invalid npm audit report shape")
    if not all(isinstance(entry, dict) for entry in vulnerabilities.values()):
        raise NpmAuditPolicyError("invalid npm audit report vulnerability entry")
    raw_count = sum(
        1
        for entry in vulnerabilities.values()
        if str(entry.get("severity", "")).lower() in HIGH_CRITICAL
    )
    try:
        reported_count = int(counts["high"]) + int(counts["critical"])
    except (KeyError, TypeError, ValueError) as exc:
        raise NpmAuditPolicyError("invalid npm audit severity counts") from exc
    if raw_count != reported_count:
        raise NpmAuditPolicyError(
            "npm audit High/Critical counts do not match vulnerability entries"
        )
    return payload


def evaluate_npm_audit(
    *, raw_report: Path, policy_path: Path, today: date | None = None
) -> dict[str, object]:
    payload = _load_audit(raw_report)
    policy = _load_policy(policy_path, today or datetime.now(UTC).date())
    vulnerabilities = payload["vulnerabilities"]
    accepted_id = policy["id"]
    accepted_packages = set(policy["packages"])

    raw_packages: list[str] = []
    matching_policy: list[str] = []
    open_packages: list[str] = []
    for package, entry in vulnerabilities.items():
        severity = (
            str(entry.get("severity", "")).lower() if isinstance(entry, dict) else ""
        )
        if severity not in HIGH_CRITICAL:
            continue
        raw_packages.append(package)
        advisories = _resolved_advisories(package, vulnerabilities, set())
        if (
            package in accepted_packages
            and severity == policy["severity"]
            and advisories == {accepted_id}
        ):
            matching_policy.append(package)
        else:
            open_packages.append(package)

    accepted = matching_policy if set(matching_policy) == accepted_packages else []
    if matching_policy and not accepted:
        open_packages.extend(matching_policy)

    return {
        "raw_high_critical_packages": len(raw_packages),
        "accepted_high_critical_packages": len(accepted),
        "open_high_critical_packages": len(open_packages),
        "accepted_advisories": [accepted_id] if accepted else [],
        "open_packages": sorted(open_packages),
        "accepted_risk": policy if accepted else None,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Apply the exact RiskHub npm advisory acceptance policy."
    )
    parser.add_argument("--raw-report", type=Path, required=True)
    parser.add_argument("--policy", type=Path, required=True)
    parser.add_argument("--filtered-report", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        result = evaluate_npm_audit(raw_report=args.raw_report, policy_path=args.policy)
    except NpmAuditPolicyError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    args.filtered_report.parent.mkdir(parents=True, exist_ok=True)
    args.filtered_report.write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(
        "npm audit High/Critical packages: "
        f"raw={result['raw_high_critical_packages']} "
        f"accepted={result['accepted_high_critical_packages']} "
        f"open={result['open_high_critical_packages']}"
    )
    return 1 if result["open_high_critical_packages"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
