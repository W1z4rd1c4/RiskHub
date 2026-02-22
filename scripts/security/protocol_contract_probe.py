#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


CLASSIFICATION_SECURITY_DEFECT = "security_defect"
CLASSIFICATION_CONTRACT_DRIFT = "contract_drift"
CLASSIFICATION_AUTH_PRECONDITION = "auth_precondition"


@dataclass(frozen=True)
class ProbeCase:
    case_id: str
    method: str
    path: str
    expected_statuses: tuple[int, ...]
    classification_hint: str
    description: str
    requires_fresh_auth: bool = False
    demo_user_id: int = 2
    json_body: dict[str, Any] | None = None
    raw_body: str | None = None
    content_type: str = "application/json"
    auth_mode: str = "none"


PROBE_CASES: tuple[ProbeCase, ...] = (
    ProbeCase(
        case_id="sso-invalid-json",
        method="POST",
        path="/api/v1/auth/sso/exchange",
        expected_statuses=(422,),
        classification_hint=CLASSIFICATION_CONTRACT_DRIFT,
        description="Malformed JSON should fail closed with 422 and be documented.",
        raw_body='{"id_token": }',
        auth_mode="none",
    ),
    ProbeCase(
        case_id="sso-invalid-body-type",
        method="POST",
        path="/api/v1/auth/sso/exchange",
        expected_statuses=(422,),
        classification_hint=CLASSIFICATION_CONTRACT_DRIFT,
        description="Wrong body type should fail closed with 422 and be documented.",
        raw_body='"invalid-body"',
        auth_mode="none",
    ),
    ProbeCase(
        case_id="legacy-controls-excel-gone",
        method="GET",
        path="/api/v1/reports/controls/excel",
        expected_statuses=(410,),
        classification_hint=CLASSIFICATION_CONTRACT_DRIFT,
        description="Legacy controls Excel route must remain documented 410.",
        requires_fresh_auth=True,
        auth_mode="fresh_bearer",
    ),
    ProbeCase(
        case_id="legacy-risks-excel-gone",
        method="GET",
        path="/api/v1/reports/risks/excel",
        expected_statuses=(410,),
        classification_hint=CLASSIFICATION_CONTRACT_DRIFT,
        description="Legacy risks Excel route must remain documented 410.",
        requires_fresh_auth=True,
        auth_mode="fresh_bearer",
    ),
    ProbeCase(
        case_id="legacy-summary-excel-gone",
        method="GET",
        path="/api/v1/reports/summary/excel",
        expected_statuses=(410,),
        classification_hint=CLASSIFICATION_CONTRACT_DRIFT,
        description="Legacy summary Excel route must remain documented 410.",
        requires_fresh_auth=True,
        auth_mode="fresh_bearer",
    ),
    ProbeCase(
        case_id="legacy-audit-trail-excel-gone",
        method="GET",
        path="/api/v1/reports/audit-trail/excel",
        expected_statuses=(410,),
        classification_hint=CLASSIFICATION_CONTRACT_DRIFT,
        description="Legacy audit trail Excel route must remain documented 410.",
        requires_fresh_auth=True,
        auth_mode="fresh_bearer",
    ),
    ProbeCase(
        case_id="xlsx-rejected-risks-export",
        method="GET",
        path="/api/v1/reports/risks/export?format=xlsx",
        expected_statuses=(410,),
        classification_hint=CLASSIFICATION_CONTRACT_DRIFT,
        description="xlsx format must be documented as removed for unified exports.",
        requires_fresh_auth=True,
        auth_mode="fresh_bearer",
    ),
    ProbeCase(
        case_id="approval-approve-not-found",
        method="POST",
        path="/api/v1/approvals/999999/approve",
        expected_statuses=(404,),
        classification_hint=CLASSIFICATION_CONTRACT_DRIFT,
        description="Approve endpoint not-found path should be documented.",
        requires_fresh_auth=True,
        auth_mode="fresh_bearer",
        json_body={"resolution_notes": "probe"},
    ),
    ProbeCase(
        case_id="approval-reject-not-found",
        method="POST",
        path="/api/v1/approvals/999999/reject",
        expected_statuses=(404,),
        classification_hint=CLASSIFICATION_CONTRACT_DRIFT,
        description="Reject endpoint not-found path should be documented.",
        requires_fresh_auth=True,
        auth_mode="fresh_bearer",
        json_body={"resolution_notes": "probe"},
    ),
    ProbeCase(
        case_id="approval-cancel-not-found",
        method="POST",
        path="/api/v1/approvals/999999/cancel",
        expected_statuses=(404,),
        classification_hint=CLASSIFICATION_CONTRACT_DRIFT,
        description="Cancel endpoint not-found path should be documented.",
        requires_fresh_auth=True,
        auth_mode="fresh_bearer",
    ),
    ProbeCase(
        case_id="approval-detail-not-found",
        method="GET",
        path="/api/v1/approvals/999999",
        expected_statuses=(404,),
        classification_hint=CLASSIFICATION_CONTRACT_DRIFT,
        description="Approval detail not-found path should be documented.",
        requires_fresh_auth=True,
        auth_mode="fresh_bearer",
    ),
    ProbeCase(
        case_id="approval-auth-precondition",
        method="GET",
        path="/api/v1/approvals/my-approvals?skip=0&skip=1",
        expected_statuses=(400, 401),
        classification_hint=CLASSIFICATION_AUTH_PRECONDITION,
        description="No-auth request should classify as auth precondition, not drift.",
        auth_mode="none",
    ),
)


def parse_target(value: str) -> tuple[str, str]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("Target must be in label=url format.")
    label, raw_url = value.split("=", 1)
    label = label.strip()
    raw_url = raw_url.strip().rstrip("/")
    if not label or not raw_url:
        raise argparse.ArgumentTypeError("Target label and URL must be non-empty.")
    return label, raw_url


def _request(
    *,
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    raw_body: str | None = None,
    content_type: str = "application/json",
    timeout_seconds: float = 10.0,
) -> tuple[int, str, dict[str, Any] | None]:
    req_headers = dict(headers or {})
    data: bytes | None = None
    if json_body is not None:
        req_headers.setdefault("Content-Type", "application/json")
        data = json.dumps(json_body).encode("utf-8")
    elif raw_body is not None:
        req_headers.setdefault("Content-Type", content_type)
        data = raw_body.encode("utf-8")

    request = urllib.request.Request(url=url, method=method.upper(), headers=req_headers, data=data)
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            body_bytes = response.read()
            status = response.getcode()
    except urllib.error.HTTPError as error:
        status = error.code
        body_bytes = error.read() or b""
    body_text = body_bytes.decode("utf-8", errors="replace")
    try:
        parsed_json = json.loads(body_text) if body_text else None
    except json.JSONDecodeError:
        parsed_json = None
    return status, body_text, parsed_json


def _demo_login(base_url: str, user_id: int, timeout_seconds: float) -> tuple[str | None, int, str | None]:
    status, body_text, payload = _request(
        method="POST",
        url=f"{base_url}/api/v1/auth/demo-login/{user_id}",
        timeout_seconds=timeout_seconds,
    )
    if status != 200:
        return None, status, (payload or {"detail": body_text[:240]}).get("detail", body_text[:240])
    token = (payload or {}).get("access_token")
    if not token:
        return None, status, "demo_login_missing_access_token"
    return str(token), status, None


def _strip_query(path: str) -> str:
    return urllib.parse.urlsplit(path).path


def _path_template_match(template: str, concrete: str) -> bool:
    template_parts = [part for part in template.strip("/").split("/") if part]
    concrete_parts = [part for part in concrete.strip("/").split("/") if part]
    if len(template_parts) != len(concrete_parts):
        return False
    for template_part, concrete_part in zip(template_parts, concrete_parts, strict=True):
        if template_part.startswith("{") and template_part.endswith("}"):
            continue
        if template_part != concrete_part:
            return False
    return True


def resolve_documented_statuses(openapi: dict[str, Any], method: str, path: str) -> tuple[list[str], str | None]:
    paths = openapi.get("paths", {})
    concrete = _strip_query(path)
    operation = None
    matched_path = None

    if concrete in paths:
        matched_path = concrete
        operation = paths[concrete].get(method.lower())
    if operation is None:
        for candidate_path, candidate_operations in paths.items():
            if _path_template_match(candidate_path, concrete):
                matched_path = candidate_path
                operation = candidate_operations.get(method.lower())
                if operation is not None:
                    break

    if operation is None:
        return [], matched_path

    response_map = operation.get("responses", {})
    return sorted(response_map.keys()), matched_path


def classify_probe_result(
    *,
    case: ProbeCase,
    status_code: int,
    documented_statuses: list[str],
    auth_error: str | None,
) -> tuple[str, bool, str]:
    if auth_error:
        return CLASSIFICATION_AUTH_PRECONDITION, False, f"auth precondition failure: {auth_error}"

    if status_code not in case.expected_statuses:
        return (
            CLASSIFICATION_SECURITY_DEFECT,
            False,
            f"unexpected status: got {status_code}, expected {sorted(case.expected_statuses)}",
        )

    if case.classification_hint == CLASSIFICATION_AUTH_PRECONDITION:
        return (
            CLASSIFICATION_AUTH_PRECONDITION,
            False,
            f"auth/sanitization precondition accepted (status {status_code})",
        )

    drift_detected = str(status_code) not in documented_statuses
    reason = "status documented in OpenAPI responses"
    if drift_detected:
        reason = f"status {status_code} missing in OpenAPI responses {documented_statuses}"
    return CLASSIFICATION_CONTRACT_DRIFT, drift_detected, reason


def _safe_excerpt(payload: dict[str, Any] | None, raw_body: str) -> str:
    if payload is not None:
        return json.dumps(payload, ensure_ascii=True)[:400]
    return raw_body[:400]


def run_target(*, label: str, base_url: str, timeout_seconds: float) -> list[dict[str, Any]]:
    openapi_status, _, openapi_payload = _request(
        method="GET",
        url=f"{base_url}/openapi.json",
        timeout_seconds=timeout_seconds,
    )
    openapi_doc = openapi_payload if openapi_status == 200 and isinstance(openapi_payload, dict) else {"paths": {}}

    rows: list[dict[str, Any]] = []
    for case in PROBE_CASES:
        headers: dict[str, str] = {"Accept": "application/json"}
        auth_error: str | None = None
        login_status_code: int | None = None
        auth_refreshed = False

        if case.requires_fresh_auth:
            token, login_status_code, login_error = _demo_login(base_url, case.demo_user_id, timeout_seconds)
            if token:
                headers["Authorization"] = f"Bearer {token}"
                auth_refreshed = True
            else:
                auth_error = login_error or "demo_login_failed"

        status_code = 0
        raw_body = ""
        body_json: dict[str, Any] | None = None
        if auth_error is None:
            status_code, raw_body, body_json = _request(
                method=case.method,
                url=f"{base_url}{case.path}",
                headers=headers,
                json_body=case.json_body,
                raw_body=case.raw_body,
                content_type=case.content_type,
                timeout_seconds=timeout_seconds,
            )

        documented_statuses, matched_openapi_path = resolve_documented_statuses(openapi_doc, case.method, case.path)
        classification, drift_detected, reason = classify_probe_result(
            case=case,
            status_code=status_code,
            documented_statuses=documented_statuses,
            auth_error=auth_error,
        )

        rows.append(
            {
                "target": label,
                "base_url": base_url,
                "case_id": case.case_id,
                "description": case.description,
                "method": case.method,
                "path": case.path,
                "status_code": status_code,
                "expected_statuses": list(case.expected_statuses),
                "documented_statuses": documented_statuses,
                "openapi_operation_path": matched_openapi_path,
                "classification": classification,
                "drift_detected": drift_detected,
                "classification_reason": reason,
                "auth_mode": case.auth_mode,
                "auth_refreshed": auth_refreshed,
                "auth_login_status_code": login_status_code,
                "auth_error": auth_error,
                "response_excerpt": _safe_excerpt(body_json, raw_body),
            }
        )
    return rows


def build_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_classification: dict[str, int] = {
        CLASSIFICATION_SECURITY_DEFECT: 0,
        CLASSIFICATION_CONTRACT_DRIFT: 0,
        CLASSIFICATION_AUTH_PRECONDITION: 0,
    }
    unresolved_contract_drift_count = 0
    for row in rows:
        by_classification[row["classification"]] = by_classification.get(row["classification"], 0) + 1
        if row["classification"] == CLASSIFICATION_CONTRACT_DRIFT and row["drift_detected"]:
            unresolved_contract_drift_count += 1

    return {
        "total_cases": len(rows),
        "classification_counts": by_classification,
        "unresolved_contract_drift_count": unresolved_contract_drift_count,
        "security_defect_count": by_classification.get(CLASSIFICATION_SECURITY_DEFECT, 0),
    }


def write_outputs(*, output_json: Path, output_csv: Path, payload: dict[str, Any]) -> None:
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_csv.parent.mkdir(parents=True, exist_ok=True)

    output_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    rows = payload["results"]
    fieldnames = [
        "target",
        "case_id",
        "method",
        "path",
        "status_code",
        "expected_statuses",
        "documented_statuses",
        "classification",
        "drift_detected",
        "classification_reason",
        "auth_mode",
        "auth_refreshed",
        "auth_login_status_code",
        "auth_error",
        "openapi_operation_path",
    ]
    with output_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    key: (
                        json.dumps(row[key], ensure_ascii=True)
                        if isinstance(row.get(key), (list, dict))
                        else row.get(key)
                    )
                    for key in fieldnames
                }
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deterministic protocol/contract drift probe harness.")
    parser.add_argument(
        "--target",
        action="append",
        dest="targets",
        type=parse_target,
        required=True,
        help="Probe target in label=url format. Repeatable.",
    )
    parser.add_argument("--output-json", type=Path, required=True, help="Path to write machine-readable JSON output.")
    parser.add_argument("--output-csv", type=Path, required=True, help="Path to write CSV triage output.")
    parser.add_argument("--timeout-seconds", type=float, default=10.0, help="HTTP timeout for probe requests.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    generated_at = datetime.now(UTC).isoformat()

    all_rows: list[dict[str, Any]] = []
    target_metadata: list[dict[str, str]] = []
    for label, base_url in args.targets:
        target_metadata.append({"label": label, "base_url": base_url})
        all_rows.extend(run_target(label=label, base_url=base_url, timeout_seconds=args.timeout_seconds))

    payload = {
        "generated_at_utc": generated_at,
        "targets": target_metadata,
        "summary": build_summary(all_rows),
        "results": all_rows,
    }
    write_outputs(output_json=args.output_json, output_csv=args.output_csv, payload=payload)

    print(json.dumps(payload["summary"], indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
