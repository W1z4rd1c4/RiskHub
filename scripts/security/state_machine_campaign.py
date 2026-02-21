#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_ROLE_USER_IDS = {
    "admin": 1,
    "risk_manager": 3,
    "department_head": 4,
    "employee": 7,
}


CASES: list[dict[str, Any]] = [
    {
        "name": "employee_approve_missing",
        "role": "employee",
        "method": "POST",
        "path": "/api/v1/approvals/999999/approve",
        "json": {"resolution_notes": "state-machine-probe"},
    },
    {
        "name": "risk_manager_cancel_missing",
        "role": "risk_manager",
        "method": "POST",
        "path": "/api/v1/approvals/999999/cancel",
    },
    {
        "name": "employee_issue_close_missing",
        "role": "employee",
        "method": "POST",
        "path": "/api/v1/issues/999999/close",
        "json": {"validation_note": "x", "completion_notes": "x"},
    },
    {
        "name": "employee_vendor_delete_missing",
        "role": "employee",
        "method": "DELETE",
        "path": "/api/v1/vendors/999999",
    },
]


def _request(
    *,
    method: str,
    url: str,
    bearer: str | None = None,
    json_body: dict[str, Any] | None = None,
    timeout: float = 15.0,
) -> tuple[int, dict[str, Any] | None, str]:
    headers = {"Accept": "application/json"}
    data = None
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    if json_body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(json_body).encode("utf-8")

    req = urllib.request.Request(url=url, method=method.upper(), headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            status = response.getcode()
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw = (exc.read() or b"").decode("utf-8", errors="replace")
    except urllib.error.URLError as exc:
        status = 0
        raw = f"transport_error: {exc.reason}"

    try:
        parsed = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        parsed = None
    return status, parsed, raw[:400]


def _demo_login(base_url: str, user_id: int) -> tuple[str | None, int, str | None]:
    status, body, raw = _request(method="POST", url=f"{base_url}/api/v1/auth/demo-login/{user_id}")
    if status != 200:
        return None, status, (body or {}).get("detail") if isinstance(body, dict) else raw
    token = body.get("access_token") if isinstance(body, dict) else None
    if not token:
        return None, status, "missing access_token"
    return token, status, None


def _run_target(label: str, base_url: str, role_user_ids: dict[str, int]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for case in CASES:
        role = case["role"]
        token, login_status, login_error = _demo_login(base_url, role_user_ids[role])
        if not token:
            rows.append(
                {
                    "target": label,
                    "case": case["name"],
                    "role": role,
                    "status": None,
                    "passed": False,
                    "reason": "demo_login_failed",
                    "login_status": login_status,
                    "login_error": login_error,
                }
            )
            continue

        status, body, raw = _request(
            method=case["method"],
            url=f"{base_url}{case['path']}",
            bearer=token,
            json_body=case.get("json"),
        )
        rows.append(
            {
                "target": label,
                "case": case["name"],
                "role": role,
                "method": case["method"],
                "path": case["path"],
                "status": status,
                "passed": status != 401,
                "reason": "ok" if status != 401 else "session_revoked_noise",
                "body": body,
                "raw": raw,
            }
        )

    return {
        "target": label,
        "base_url": base_url,
        "results": rows,
        "failed_cases": [r for r in rows if not r["passed"]],
    }


def _parse_target(value: str) -> tuple[str, str]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("target must be label=url")
    label, url = value.split("=", 1)
    return label.strip(), url.strip().rstrip("/")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run state-machine campaign with fresh tokens per case")
    parser.add_argument("--target", action="append", required=True, type=_parse_target)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    role_user_ids = dict(DEFAULT_ROLE_USER_IDS)

    output = {
        "campaign": "state_machine_valid_session",
        "targets": [],
    }

    failures = 0
    for label, base_url in args.target:
        result = _run_target(label, base_url, role_user_ids)
        output["targets"].append(result)
        failures += len(result["failed_cases"])

    output["decision"] = "PASS" if failures == 0 else "BLOCK"
    output["failed_case_count"] = failures

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Wrote state-machine campaign artifact: {out}")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
