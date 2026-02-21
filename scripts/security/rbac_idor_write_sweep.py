#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROLE_USER_IDS = {
    "admin": 1,
    "risk_manager": 3,
    "department_head": 4,
    "employee": 7,
}

WRITE_METHODS = {"post", "put", "patch", "delete"}
CLUSTERS = (
    "/api/v1/vendors",
    "/api/v1/vendor",
    "/api/v1/questionnaires",
    "/api/v1/directory",
    "/api/v1/executions",
    "/api/v1/notifications",
    "/api/v1/orphaned-items",
    "/api/v1/activity-log",
    "/api/v1/riskhub",
)

_PARAM_RE = re.compile(r"\{[^}]+\}")


def _request(
    *,
    method: str,
    url: str,
    bearer: str | None = None,
    json_body: dict[str, Any] | None = None,
    timeout: float = 15.0,
) -> tuple[int, str]:
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
            return response.getcode(), response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, (exc.read() or b"").decode("utf-8", errors="replace")
    except urllib.error.URLError as exc:
        return 0, f"transport_error: {exc.reason}"


def _demo_login(base_url: str, user_id: int) -> str | None:
    status, raw = _request(method="POST", url=f"{base_url}/api/v1/auth/demo-login/{user_id}")
    if status != 200:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None
    token = payload.get("access_token")
    return token if isinstance(token, str) and token else None


def _normalize_path(path: str) -> str:
    return _PARAM_RE.sub("1", path)


def _eligible(path: str) -> bool:
    if any(path.startswith(prefix) for prefix in CLUSTERS):
        return True
    return False


def _collect_write_paths(openapi: dict[str, Any]) -> list[tuple[str, str]]:
    collected: list[tuple[str, str]] = []
    for path, item in (openapi.get("paths") or {}).items():
        if not isinstance(item, dict):
            continue
        if not _eligible(path):
            continue
        for method, _spec in item.items():
            if method.lower() not in WRITE_METHODS:
                continue
            concrete = _normalize_path(path)
            if "/auth/logout" in concrete:
                continue
            collected.append((method.upper(), concrete))
    return sorted(set(collected))


def _parse_target(value: str) -> tuple[str, str]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("target must be label=url")
    label, url = value.split("=", 1)
    return label.strip(), url.strip().rstrip("/")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run RBAC/IDOR write-surface sweep")
    parser.add_argument("--target", action="append", required=True, type=_parse_target)
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--output-csv", required=True)
    args = parser.parse_args()

    rows: list[dict[str, Any]] = []

    for label, base_url in args.target:
        status, raw = _request(method="GET", url=f"{base_url}/openapi.json")
        if status != 200:
            rows.append(
                {
                    "target": label,
                    "role": "*",
                    "method": "GET",
                    "path": "/openapi.json",
                    "status": status,
                    "result": "openapi_unavailable",
                }
            )
            continue

        openapi = json.loads(raw)
        write_paths = _collect_write_paths(openapi)

        tokens = {role: _demo_login(base_url, user_id) for role, user_id in ROLE_USER_IDS.items()}

        for role, token in tokens.items():
            if not token:
                rows.append(
                    {
                        "target": label,
                        "role": role,
                        "method": "POST",
                        "path": "/api/v1/auth/demo-login/{user_id}",
                        "status": None,
                        "result": "login_failed",
                    }
                )
                continue

            for method, path in write_paths:
                payload = {} if method in {"POST", "PUT", "PATCH"} else None
                status_code, body_excerpt = _request(
                    method=method,
                    url=f"{base_url}{path}",
                    bearer=token,
                    json_body=payload,
                )
                result = "deny_or_not_found" if status_code in {401, 403, 404, 405, 409, 410, 422} else "potential_write"
                rows.append(
                    {
                        "target": label,
                        "role": role,
                        "method": method,
                        "path": path,
                        "status": status_code,
                        "result": result,
                        "body_excerpt": body_excerpt[:300],
                    }
                )

    decision = "PASS" if not any(row.get("result") == "potential_write" for row in rows) else "BLOCK"
    payload = {
        "decision": decision,
        "rows": rows,
        "potential_write_count": sum(1 for row in rows if row.get("result") == "potential_write"),
    }

    json_path = Path(args.output_json)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    csv_path = Path(args.output_csv)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["target", "role", "method", "path", "status", "result", "body_excerpt"]
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k) for k in fieldnames})

    print(f"Wrote RBAC write sweep JSON: {json_path}")
    print(f"Wrote RBAC write sweep CSV: {csv_path}")
    return 0 if decision == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
