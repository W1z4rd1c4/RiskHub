#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REQUIRED_ENV = (
    "RH_STAGING_BASE_URL",
    "RH_STAGING_ADMIN_BEARER",
    "RH_STAGING_MANAGER_BEARER",
    "RH_STAGING_EMPLOYEE_BEARER",
    "RH_STAGING_DEPT_A_ID",
    "RH_STAGING_DEPT_B_ID",
)


@dataclass
class ReplayResult:
    name: str
    status_code: int | None
    expected: str
    passed: bool
    details: dict[str, Any]


def _hash8(value: str | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:8]


def _request(
    *,
    method: str,
    url: str,
    bearer: str | None = None,
    headers: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    raw_body: str | None = None,
    timeout: float = 20.0,
) -> tuple[int, dict[str, Any] | None, str]:
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    if bearer:
        req_headers["Authorization"] = f"Bearer {bearer}"

    data: bytes | None = None
    if json_body is not None:
        req_headers.setdefault("Content-Type", "application/json")
        data = json.dumps(json_body).encode("utf-8")
    elif raw_body is not None:
        req_headers.setdefault("Content-Type", "application/json")
        data = raw_body.encode("utf-8")

    request = urllib.request.Request(url=url, method=method.upper(), headers=req_headers, data=data)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body_raw = response.read().decode("utf-8", errors="replace")
            status = response.getcode()
    except urllib.error.HTTPError as exc:
        status = exc.code
        body_raw = (exc.read() or b"").decode("utf-8", errors="replace")
    except urllib.error.URLError as exc:
        status = 0
        body_raw = f"transport_error: {exc.reason}"

    try:
        body_json = json.loads(body_raw) if body_raw else None
    except json.JSONDecodeError:
        body_json = None
    return status, body_json, body_raw[:500]


def _check(name: str, status_code: int, expected: str, ok: bool, **details: Any) -> ReplayResult:
    return ReplayResult(
        name=name,
        status_code=status_code,
        expected=expected,
        passed=ok,
        details=details,
    )


def run_replay(base_url: str) -> dict[str, Any]:
    admin = os.environ["RH_STAGING_ADMIN_BEARER"]
    manager = os.environ["RH_STAGING_MANAGER_BEARER"]
    employee = os.environ["RH_STAGING_EMPLOYEE_BEARER"]
    dept_a = os.environ["RH_STAGING_DEPT_A_ID"]
    dept_b = os.environ["RH_STAGING_DEPT_B_ID"]

    checks: list[ReplayResult] = []

    status, body, raw = _request(method="GET", url=f"{base_url}/api/v1/health")
    checks.append(_check("health", status, "200", status == 200, body=body, raw=raw))

    status, body, raw = _request(
        method="GET",
        url=f"{base_url}/api/v1/admin/logs?limit=1",
        bearer=employee,
    )
    checks.append(_check("admin_logs_employee_denied", status, "403", status == 403, body=body, raw=raw))

    status, body, raw = _request(
        method="GET",
        url=f"{base_url}/api/v1/reports/controls/export?format=xlsx&department_id={urllib.parse.quote(str(dept_a))}",
        bearer=admin,
    )
    checks.append(
        _check(
            "excel_invariant",
            status,
            "410 + excel_export_removed",
            status == 410 and isinstance(body, dict) and body.get("code") == "excel_export_removed",
            body=body,
            raw=raw,
        )
    )

    status, body, raw = _request(
        method="GET",
        url=f"{base_url}/api/v1/controls?department_id={urllib.parse.quote(str(dept_a))}&department_id={urllib.parse.quote(str(dept_b))}",
        bearer=employee,
    )
    checks.append(_check("duplicate_query_rejected", status, "400", status == 400, body=body, raw=raw))

    status, body, raw = _request(
        method="GET",
        url=f"{base_url}/api/v1/auth/me",
        bearer=employee,
        headers={"X-HTTP-Method-Override": "DELETE"},
    )
    checks.append(_check("method_override_rejected", status, "400", status == 400, body=body, raw=raw))

    status, body, raw = _request(
        method="PATCH",
        url=f"{base_url}/api/v1/risks/1",
        bearer=employee,
        json_body={"name": "real-staging-write-probe"},
    )
    checks.append(
        _check(
            "employee_cross_scope_write_denied",
            status,
            "403 or 404",
            status in {403, 404},
            body=body,
            raw=raw,
        )
    )

    refresh_cookie = os.getenv("RH_STAGING_REFRESH_COOKIE")
    if refresh_cookie:
        refresh_url = f"{base_url}/api/v1/auth/refresh"

        def do_refresh() -> int:
            status_code, _body, _raw = _request(
                method="POST",
                url=refresh_url,
                headers={"Cookie": f"riskhub_refresh_token={refresh_cookie}"},
            )
            return status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            a = pool.submit(do_refresh)
            b = pool.submit(do_refresh)
            statuses = sorted([a.result(), b.result()])
        checks.append(
            ReplayResult(
                name="refresh_race_optional",
                status_code=None,
                expected="[200, 401]",
                passed=statuses == [200, 401],
                details={"statuses": statuses},
            )
        )
    else:
        checks.append(
            ReplayResult(
                name="refresh_race_optional",
                status_code=None,
                expected="skipped_without_cookie",
                passed=True,
                details={"skipped": True},
            )
        )

    passed = all(item.passed for item in checks)
    return {
        "base_url": base_url,
        "token_fingerprints": {
            "admin": _hash8(admin),
            "manager": _hash8(manager),
            "employee": _hash8(employee),
        },
        "checks": [
            {
                "name": c.name,
                "status_code": c.status_code,
                "expected": c.expected,
                "passed": c.passed,
                "details": c.details,
            }
            for c in checks
        ],
        "decision": "PASS" if passed else "BLOCK",
        "real_staging_not_simulation": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run real staging replay checks with sanitized outputs.")
    parser.add_argument("--base-url", default=os.getenv("RH_STAGING_BASE_URL"))
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    missing = [name for name in REQUIRED_ENV if not os.getenv(name)]
    if missing:
        print(json.dumps({"status": "BLOCKED_PRECONDITION", "missing": missing}, indent=2))
        return 2

    if not args.base_url:
        print(json.dumps({"status": "BLOCKED_PRECONDITION", "missing": ["RH_STAGING_BASE_URL"]}, indent=2))
        return 2

    result = run_replay(args.base_url.rstrip("/"))

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"Wrote replay results: {output_path}")
    return 0 if result["decision"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
