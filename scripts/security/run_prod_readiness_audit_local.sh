#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d-%H%M%S)}"
REPORT_DATE="${REPORT_DATE:-$(date -u +%Y-%m-%d)}"

ARTIFACT_ROOT="${ARTIFACT_ROOT:-$ROOT_DIR/tests/results/prod/prod-readiness-audit-$RUN_ID}"
REPORT_PATH="$ROOT_DIR/docs/security/reports/prod-readiness-deep-audit-${REPORT_DATE}.md"

META_DIR="$ARTIFACT_ROOT/meta"
LOG_DIR="$ARTIFACT_ROOT/logs"
REPORTS_DIR="$ARTIFACT_ROOT/reports"
TMP_DIR="$ARTIFACT_ROOT/tmp"
MATRIX_NDJSON="$TMP_DIR/command-matrix.ndjson"
MATRIX_JSON="$REPORTS_DIR/command-matrix.json"

mkdir -p "$META_DIR" "$LOG_DIR" "$REPORTS_DIR" "$TMP_DIR"
mkdir -p "$ROOT_DIR/tests/results/prod" "$ROOT_DIR/docs/security/reports"
: >"$MATRIX_NDJSON"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

pick_free_port() {
  python3 - "$1" "$2" <<'PY'
import socket
import sys

start = int(sys.argv[1])
end = int(sys.argv[2])

for port in range(start, end + 1):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            continue
        print(port)
        raise SystemExit(0)

raise SystemExit(f"No free port found in range {start}-{end}")
PY
}

required_failures=0

run_cmd() {
  local id="$1"
  local required="$2"
  local timeout_sec="$3"
  local cwd="$4"
  shift 4
  local cmd="$*"

  local log_path="$LOG_DIR/${id}.log"
  local start_iso end_iso start_epoch end_epoch duration_sec rc

  start_iso="$(python3 - <<'PY'
from datetime import UTC, datetime
print(datetime.now(UTC).isoformat())
PY
)"
  start_epoch="$(python3 - <<'PY'
import time
print(time.time())
PY
)"

  set +e
  (
    cd "$cwd"
    bash -lc "$cmd"
  ) >"$log_path" 2>&1
  rc=$?
  set -e

  printf '$ %s\n' "$cmd" >>"$log_path"

  end_iso="$(python3 - <<'PY'
from datetime import UTC, datetime
print(datetime.now(UTC).isoformat())
PY
)"
  end_epoch="$(python3 - <<'PY'
import time
print(time.time())
PY
)"
  duration_sec="$(python3 - "$start_epoch" "$end_epoch" <<'PY'
import sys
start = float(sys.argv[1])
end = float(sys.argv[2])
print(round(end - start, 3))
PY
)"

  if [[ "$required" == "true" && "$rc" -ne 0 ]]; then
    required_failures=$((required_failures + 1))
  fi

  python3 - "$id" "$cmd" "$cwd" "$start_iso" "$end_iso" "$duration_sec" "$rc" "$log_path" "$required" "$timeout_sec" >>"$MATRIX_NDJSON" <<'PY'
import json
import sys

entry = {
    "id": sys.argv[1],
    "command": sys.argv[2],
    "cwd": sys.argv[3],
    "start_utc": sys.argv[4],
    "end_utc": sys.argv[5],
    "duration_sec": float(sys.argv[6]),
    "rc": int(sys.argv[7]),
    "log": sys.argv[8],
    "required": sys.argv[9] == "true",
    "timeout_sec": int(sys.argv[10]),
}
print(json.dumps(entry, ensure_ascii=True))
PY

  return 0
}

python3 - "$RUN_ID" "$ARTIFACT_ROOT" "$META_DIR/run_info.txt" <<'PY'
import json
import sys
from datetime import UTC, datetime

payload = {
    "run_id": sys.argv[1],
    "generated_at_utc": datetime.now(UTC).isoformat(),
    "artifact_root": sys.argv[2],
    "confidence_model": "LOCAL_ONLY",
    "scope": "full production readiness (local/repo only)",
    "blocking_threshold": "unresolved High/Critical OR failed mandatory control",
}

with open(sys.argv[3], "w", encoding="utf-8") as handle:
    handle.write(json.dumps(payload, indent=2, ensure_ascii=True) + "\n")
PY

python3 - "$REPORTS_DIR/baseline_references.json" "$ROOT_DIR" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[2])
payload = {
    "prior_no_go": str(root / "docs/security/reports/phase500-prod-deep-audit-2026-02-21.md"),
    "prior_gap_closure": str(root / "docs/security/reports/deep-gap-round5-2026-02-21.md"),
}

with open(sys.argv[1], "w", encoding="utf-8") as handle:
    handle.write(json.dumps(payload, indent=2, ensure_ascii=True) + "\n")
PY

POSTGRES_PORT="${POSTGRES_PORT:-$(pick_free_port 55432 55999)}"
FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT:-$(pick_free_port 28081 28999)}"
POSTGRES_CONTAINER="riskhub-audit-pg-${RUN_ID//[^0-9]/}"
TAG_DEPLOY="audit-${RUN_ID//:/}"
TAG_UPGRADE="${TAG_DEPLOY}-u1"

cat >"$TMP_DIR/lifecycle_config.json" <<EOF
{
  "postgres_container": "$POSTGRES_CONTAINER",
  "postgres_port": $POSTGRES_PORT,
  "frontend_host_port": $FRONTEND_HOST_PORT,
  "tag_deploy": "$TAG_DEPLOY",
  "tag_upgrade": "$TAG_UPGRADE"
}
EOF

cat >"$TMP_DIR/backend_valid.env" <<EOF
DEBUG=false
MOCK_AUTH_ENABLED=false
AUTH_MODE=microsoft_sso
SECRET_KEY=phase500-local-test-key-phase500-local-test
DATABASE_URL=postgresql+asyncpg://riskhub:riskhub@postgres.example.com:5432/riskhub
CORS_ORIGINS=["https://riskhub.example.com"]
ALLOWED_HOSTS=["riskhub.example.com"]
REDIS_PASSWORD=riskhub_test_password
REDIS_URL=
ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000
ENTRA_CLIENT_ID=11111111-1111-1111-1111-111111111111
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_ROLE=admin
BOOTSTRAP_ADMIN_ACCESS_SCOPE=global
BOOTSTRAP_CRO_EMAIL=cro@example.com
BOOTSTRAP_CRO_ACCESS_SCOPE=global
EOF

cat >"$TMP_DIR/backend.env" <<EOF
DEBUG=false
MOCK_AUTH_ENABLED=false
AUTH_MODE=microsoft_sso
SECRET_KEY=phase500-local-test-key-phase500-local-test
DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_audit@host.docker.internal:${POSTGRES_PORT}/riskhub
CORS_ORIGINS=["https://riskhub.example.com"]
ALLOWED_HOSTS=["riskhub.example.com"]
REDIS_PASSWORD=riskhub_audit_redis_password
REDIS_URL=
ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000
ENTRA_CLIENT_ID=11111111-1111-1111-1111-111111111111
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_ROLE=admin
BOOTSTRAP_ADMIN_ACCESS_SCOPE=global
BOOTSTRAP_CRO_EMAIL=cro@example.com
BOOTSTRAP_CRO_ACCESS_SCOPE=global
EOF

cat >"$TMP_DIR/frontend.env" <<EOF
FRONTEND_HOST_PORT=${FRONTEND_HOST_PORT}
FRONTEND_CONTAINER_PORT=80
SERVER_NAME=riskhub.example.com
EOF

cat >"$TMP_DIR/frontend_invalid_host.env" <<EOF
FRONTEND_HOST_PORT=70000
FRONTEND_CONTAINER_PORT=80
SERVER_NAME=riskhub.example.com
EOF

cat >"$TMP_DIR/frontend_invalid_container.env" <<EOF
FRONTEND_HOST_PORT=${FRONTEND_HOST_PORT}
FRONTEND_CONTAINER_PORT=abc
SERVER_NAME=riskhub.example.com
EOF

cp "$TMP_DIR/backend_valid.env" "$TMP_DIR/setup_backend.env"
cp "$TMP_DIR/frontend.env" "$TMP_DIR/setup_frontend.env"

mkdir -p "$TMP_DIR/setup_tmp"
python3 - "$TMP_DIR/setup_tmp" "$TMP_DIR/setup_tmp_dirs_before.json" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
payload = sorted([p.name for p in root.glob("riskhub-setup.*")])
Path(sys.argv[2]).write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
PY

run_cmd "meta_git_head" true 120 "$ROOT_DIR" "git rev-parse HEAD > '$META_DIR/git_head.txt'"
run_cmd "meta_git_status_short" true 120 "$ROOT_DIR" "git status --short --branch > '$META_DIR/git_status_short.txt'"
run_cmd "meta_git_status_porcelain" true 120 "$ROOT_DIR" "git status --porcelain=v1 > '$META_DIR/git_status_porcelain.txt'"
run_cmd "meta_docker_version" true 120 "$ROOT_DIR" "docker version > '$META_DIR/docker_version.txt'"
run_cmd "meta_docker_info" true 120 "$ROOT_DIR" "docker info > '$META_DIR/docker_info.txt'"
run_cmd "meta_python_version" true 120 "$ROOT_DIR" "python3 --version > '$META_DIR/python_version.txt'"
run_cmd "meta_node_version" true 120 "$ROOT_DIR" "node --version > '$META_DIR/node_version.txt'"
run_cmd "meta_npm_version" true 120 "$ROOT_DIR" "npm --version > '$META_DIR/npm_version.txt'"
run_cmd "meta_uname" true 120 "$ROOT_DIR" "uname -a > '$META_DIR/uname.txt'"

run_cmd "p2_verify_prod_install_scripts" true 3600 "$ROOT_DIR" "make -f scripts/Makefile verify-prod-install-scripts"
run_cmd "p2_security_contract_probe" true 1200 "$ROOT_DIR" "make -f scripts/Makefile security-contract-probe"
run_cmd "p2_security_gap_round5" true 1800 "$ROOT_DIR" "make -f scripts/Makefile security-gap-round5"
run_cmd "p2_prod_guard_pytests" true 1200 "$ROOT_DIR" "cd backend && ./venv/bin/pytest ../tests/backend/pytest/test_production_hardening.py ../tests/backend/pytest/test_security_headers.py ../tests/backend/pytest/test_phase500_script_contracts.py ../tests/backend/pytest/test_phase500_script_runtime_contracts.py -q"
run_cmd "p2_setup_dryrun_exit" true 600 "$ROOT_DIR" "TMPDIR='$TMP_DIR/setup_tmp' scripts/prod/setup.sh --yes --dry-run --action exit --backend-env '$TMP_DIR/setup_backend.env' --frontend-env '$TMP_DIR/setup_frontend.env' --public-url https://riskhub.example.com --database-url postgresql+asyncpg://riskhub:riskhub@postgres.example.com:5432/riskhub --entra-tenant-id 00000000-0000-0000-0000-000000000000 --entra-client-id 11111111-1111-1111-1111-111111111111 --bootstrap-admin-email admin@example.com --bootstrap-cro-email cro@example.com --tag audit-dryrun"
run_cmd "p2_preflight_invalid_host_range" false 300 "$ROOT_DIR" "scripts/prod/preflight.sh --backend-env '$TMP_DIR/backend_valid.env' --frontend-env '$TMP_DIR/frontend_invalid_host.env' --yes"
run_cmd "p2_preflight_invalid_container_port" false 300 "$ROOT_DIR" "scripts/prod/preflight.sh --backend-env '$TMP_DIR/backend_valid.env' --frontend-env '$TMP_DIR/frontend_invalid_container.env' --yes"

python3 - "$TMP_DIR/setup_tmp" "$TMP_DIR/setup_tmp_dirs_after.json" "$TMP_DIR/setup_tmp_dirs_new.json" "$TMP_DIR/setup_tmp_dirs_before.json" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
after_path = Path(sys.argv[2])
new_path = Path(sys.argv[3])
before_path = Path(sys.argv[4])

before = json.loads(before_path.read_text(encoding="utf-8"))
after = sorted([p.name for p in root.glob("riskhub-setup.*")])
new = sorted(list(set(after) - set(before)))

after_path.write_text(json.dumps(after, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
new_path.write_text(json.dumps(new, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
PY

for cleanup_id in \
  "riskhub-frontend" \
  "riskhub-backend" \
  "riskhub-backend-scheduler" \
  "riskhub-redis" \
  "$POSTGRES_CONTAINER"; do
  run_cmd "p3_cleanup_${cleanup_id}" false 120 "$ROOT_DIR" "docker rm -f ${cleanup_id}"
done

run_cmd "p3_start_postgres" true 300 "$ROOT_DIR" "docker run -d --name $POSTGRES_CONTAINER -e POSTGRES_USER=riskhub -e POSTGRES_PASSWORD=riskhub_audit -e POSTGRES_DB=riskhub -p ${POSTGRES_PORT}:5432 postgres:16"
run_cmd "p3_wait_postgres" true 120 "$ROOT_DIR" "bash -lc \"for i in {1..60}; do docker exec $POSTGRES_CONTAINER pg_isready -U riskhub >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1\""

run_cmd "p3_preflight_strict" true 600 "$ROOT_DIR" "scripts/prod/preflight.sh --backend-env '$TMP_DIR/backend.env' --frontend-env '$TMP_DIR/frontend.env' --yes"
run_cmd "p3_deploy" true 3600 "$ROOT_DIR" "scripts/prod/deploy.sh --backend-env '$TMP_DIR/backend.env' --frontend-env '$TMP_DIR/frontend.env' --tag $TAG_DEPLOY --yes"
run_cmd "p3_verify_runtime" true 300 "$ROOT_DIR" "scripts/prod/verify_runtime.sh"
run_cmd "p3_smoke_after_deploy" true 600 "$ROOT_DIR" "scripts/prod/smoke_test.sh --frontend-env '$TMP_DIR/frontend.env' --backend-env '$TMP_DIR/backend.env'"
run_cmd "p3_upgrade" true 3600 "$ROOT_DIR" "scripts/prod/upgrade.sh --backend-env '$TMP_DIR/backend.env' --frontend-env '$TMP_DIR/frontend.env' --tag $TAG_UPGRADE --yes"
run_cmd "p3_rollback" true 1800 "$ROOT_DIR" "scripts/prod/rollback.sh --backend-env '$TMP_DIR/backend.env' --frontend-env '$TMP_DIR/frontend.env' --i-understand-db-wont-downgrade --yes"
run_cmd "p3_smoke_after_rollback" true 600 "$ROOT_DIR" "scripts/prod/smoke_test.sh --frontend-env '$TMP_DIR/frontend.env' --backend-env '$TMP_DIR/backend.env'"
run_cmd "p3_backend_docs_code" true 120 "$ROOT_DIR" "docker exec riskhub-backend curl -sS -H 'Host: riskhub.example.com' -o /dev/null -w \"%{http_code}\" http://localhost:8000/docs"
run_cmd "p3_backend_openapi_code" true 120 "$ROOT_DIR" "docker exec riskhub-backend curl -sS -H 'Host: riskhub.example.com' -o /dev/null -w \"%{http_code}\" http://localhost:8000/openapi.json"
run_cmd "p3_scheduler_ps" true 120 "$ROOT_DIR" "docker exec riskhub-backend-scheduler sh -lc \"ps -eo pid,comm,args | grep uvicorn | grep -v grep\""
run_cmd "p3_frontend_uid" true 120 "$ROOT_DIR" "docker exec riskhub-frontend id -u"
run_cmd "p3_postgres_logs" false 120 "$ROOT_DIR" "docker logs $POSTGRES_CONTAINER"
run_cmd "p3_remove_postgres" false 120 "$ROOT_DIR" "docker rm -f $POSTGRES_CONTAINER"

run_cmd "p4_bandit_high_gate" true 1200 "$ROOT_DIR" "cd backend && ./venv/bin/bandit --ini .bandit -r app -f txt --severity-level high"
run_cmd "p4_pip_audit" true 1200 "$ROOT_DIR" "cd backend && ./venv/bin/python -m pip_audit -r requirements.txt"
run_cmd "p4_npm_audit_high" true 1200 "$ROOT_DIR" "cd frontend && npm audit --audit-level=high"
run_cmd "p4_trivy_backend" true 1800 "$ROOT_DIR" "docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v '$REPORTS_DIR':/out aquasec/trivy:0.57.1 image --severity HIGH,CRITICAL --format json -o /out/trivy-backend.json riskhub-backend:$TAG_UPGRADE"
run_cmd "p4_trivy_frontend" true 1800 "$ROOT_DIR" "docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v '$REPORTS_DIR':/out aquasec/trivy:0.57.1 image --severity HIGH,CRITICAL --format json -o /out/trivy-frontend.json riskhub-frontend:$TAG_UPGRADE"
run_cmd "p4_syft_backend" true 1800 "$ROOT_DIR" "docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v '$REPORTS_DIR':/out anchore/syft:latest riskhub-backend:$TAG_UPGRADE -o json=/out/sbom-backend.json"
run_cmd "p4_grype_backend" true 1800 "$ROOT_DIR" "docker run --rm -v '$ROOT_DIR':/repo -w /repo anchore/grype:latest sbom:/repo/tests/results/prod/prod-readiness-audit-$RUN_ID/reports/sbom-backend.json --config /repo/backend/security/grype-ignore.yaml -o json=/repo/tests/results/prod/prod-readiness-audit-$RUN_ID/reports/grype-backend.json"
run_cmd "p4_gitleaks_parse_gate" true 600 "$ROOT_DIR" "docker run --rm -v '$ROOT_DIR':/repo -w /repo --entrypoint /bin/sh zricethezav/gitleaks:v8.18.2 -lc 'mkdir -p /tmp/gitleaks-empty && gitleaks detect --source /tmp/gitleaks-empty --no-git --config .gitleaks.toml --report-format json --report-path /tmp/gitleaks-parse.json --exit-code 0'"
run_cmd "p4_gitleaks_scan" true 1200 "$ROOT_DIR" "docker run --rm -v '$ROOT_DIR':/repo -w /repo --entrypoint /bin/sh zricethezav/gitleaks:v8.18.2 -lc 'gitleaks detect --source /repo --config .gitleaks.toml --report-format json --report-path /repo/tests/results/prod/prod-readiness-audit-$RUN_ID/reports/gitleaks-report.json --exit-code 1'"

for cleanup_id in \
  "riskhub-frontend" \
  "riskhub-backend" \
  "riskhub-backend-scheduler" \
  "riskhub-redis"; do
  run_cmd "cleanup_final_${cleanup_id}" false 120 "$ROOT_DIR" "docker rm -f ${cleanup_id}"
done

python3 - "$MATRIX_NDJSON" "$MATRIX_JSON" <<'PY'
import json
import sys
from pathlib import Path

ndjson_path = Path(sys.argv[1])
out_path = Path(sys.argv[2])
rows = []
if ndjson_path.exists():
    for line in ndjson_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
out_path.write_text(json.dumps(rows, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
PY

python3 - "$ROOT_DIR" "$RUN_ID" "$ARTIFACT_ROOT" "$REPORT_PATH" "$MATRIX_JSON" "$required_failures" "$TMP_DIR" "$REPORTS_DIR" <<'PY'
from __future__ import annotations

import json
import re
import sys
from datetime import UTC, datetime
from pathlib import Path

root = Path(sys.argv[1])
run_id = sys.argv[2]
artifact_root = Path(sys.argv[3])
report_path = Path(sys.argv[4])
matrix_path = Path(sys.argv[5])
required_failures = int(sys.argv[6])
tmp_dir = Path(sys.argv[7])
reports_dir = Path(sys.argv[8])
logs_dir = artifact_root / "logs"

matrix = json.loads(matrix_path.read_text(encoding="utf-8"))
rc_by_id = {row["id"]: int(row["rc"]) for row in matrix}

def rc(command_id: str) -> int:
    return int(rc_by_id.get(command_id, 127))

def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")

def write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

def parse_first_http_code(path: Path) -> int | None:
    text = read_text(path)
    match = re.search(r"\b([1-5][0-9][0-9])\b", text)
    return int(match.group(1)) if match else None

def parse_frontend_uid(path: Path) -> int | None:
    text = read_text(path).strip()
    if not text:
        return None
    first_line = text.splitlines()[0].strip()
    if first_line.isdigit():
        return int(first_line)
    return None

def trivy_high_critical_count(path: Path) -> int:
    if not path.exists():
        return 999
    payload = json.loads(path.read_text(encoding="utf-8"))
    total = 0
    for result in payload.get("Results", []):
        for vuln in result.get("Vulnerabilities") or []:
            if str(vuln.get("Severity", "")).upper() in {"HIGH", "CRITICAL"}:
                total += 1
    return total

def grype_high_critical_count(path: Path) -> int:
    if not path.exists():
        return 999
    payload = json.loads(path.read_text(encoding="utf-8"))
    total = 0
    for match in payload.get("matches", []):
        severity = str(match.get("vulnerability", {}).get("severity", "")).upper()
        if severity in {"HIGH", "CRITICAL"}:
            total += 1
    return total

def gitleaks_count(path: Path) -> int:
    if not path.exists():
        return 999
    payload = json.loads(path.read_text(encoding="utf-8"))
    return len(payload) if isinstance(payload, list) else 999

probe_log = read_text(logs_dir / "p2_security_contract_probe.log")
probe_match = re.findall(r"/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/contract-drift-remediation-[^ ]+/protocol/probe-results\.json", probe_log)
if probe_match:
    probe_results_path = Path(probe_match[-1])
else:
    probe_candidates = sorted(
        root.glob("tests/results/security/contract-drift-remediation-*/protocol/probe-results.json"),
        key=lambda p: p.stat().st_mtime,
    )
    probe_results_path = probe_candidates[-1] if probe_candidates else Path("")

probe_unresolved = 999
probe_security_defects = 999
if probe_results_path and probe_results_path.exists():
    probe_payload = json.loads(probe_results_path.read_text(encoding="utf-8"))
    summary = probe_payload.get("summary", {})
    probe_unresolved = int(summary.get("unresolved_contract_drift_count", 999))
    probe_security_defects = int(summary.get("security_defect_count", 999))

docs_code = parse_first_http_code(logs_dir / "p3_backend_docs_code.log")
openapi_code = parse_first_http_code(logs_dir / "p3_backend_openapi_code.log")
frontend_uid = parse_frontend_uid(logs_dir / "p3_frontend_uid.log")

setup_tmp_dirs_new_path = tmp_dir / "setup_tmp_dirs_new.json"
setup_tmp_dirs_new = []
if setup_tmp_dirs_new_path.exists():
    setup_tmp_dirs_new = json.loads(setup_tmp_dirs_new_path.read_text(encoding="utf-8"))

deploy_log_text = read_text(logs_dir / "p3_deploy.log")
bootstrap_ok = "DB bootstrap: OK" in deploy_log_text
bootstrap_fail_patterns = [
    "ModuleNotFoundError: No module named 'app'",
    "Seeding RBAC roles/permissions (canonical contract)...",
    "DB bootstrap: OK",
]
bootstrap_explicit_error = "ModuleNotFoundError: No module named 'app'" in deploy_log_text

ph500_001_status = "fixed" if bootstrap_ok and not bootstrap_explicit_error else "reopened"
ph500_002_status = "fixed" if frontend_uid is not None and frontend_uid != 0 else "reopened"
ph500_003_status = "fixed" if rc("p2_setup_dryrun_exit") == 0 and not setup_tmp_dirs_new else "reopened"
ph500_004_status = "fixed" if rc("p2_preflight_invalid_host_range") != 0 and rc("p2_preflight_invalid_container_port") != 0 else "reopened"

prior_runtime = [
    {
        "id": "PH500-DA-001",
        "severity": "P0",
        "status": ph500_001_status,
        "evidence": [str(logs_dir / "p3_deploy.log")],
    },
    {
        "id": "PH500-DA-002",
        "severity": "P1",
        "status": ph500_002_status,
        "evidence": [str(logs_dir / "p3_frontend_uid.log"), str(root / "frontend/Dockerfile")],
    },
    {
        "id": "PH500-DA-003",
        "severity": "P1",
        "status": ph500_003_status,
        "evidence": [str(logs_dir / "p2_setup_dryrun_exit.log"), str(setup_tmp_dirs_new_path)],
    },
    {
        "id": "PH500-DA-004",
        "severity": "P1",
        "status": ph500_004_status,
        "evidence": [
            str(logs_dir / "p2_preflight_invalid_host_range.log"),
            str(logs_dir / "p2_preflight_invalid_container_port.log"),
        ],
    },
]
write_json(reports_dir / "prior-blocker-revalidation-runtime.json", prior_runtime)

bootstrap_db_text = read_text(root / "scripts/prod/bootstrap_db.sh")
frontend_dockerfile_text = read_text(root / "frontend/Dockerfile")
setup_text = read_text(root / "scripts/prod/setup.sh")
preflight_lib_text = read_text(root / "scripts/prod/lib/preflight.sh")
main_text = read_text(root / "backend/app/main.py")

static_checks = [
    (
        "bootstrap module invocations",
        all(
            token in bootstrap_db_text
            for token in [
                "python -m scripts.seed_roles_permissions",
                "python -m scripts.seed_departments",
                "python -m scripts.bootstrap_sso_user",
            ]
        ),
    ),
    ("frontend non-root user", "USER riskhub" in frontend_dockerfile_text),
    ("setup dry-run temp cleanup", "setup_tmp_dir" in setup_text and "trap cleanup EXIT" in setup_text),
    (
        "frontend host/container port validation",
        "FRONTEND_HOST_PORT must be between 1 and 65535" in preflight_lib_text
        and "FRONTEND_CONTAINER_PORT must be numeric" in preflight_lib_text,
    ),
    ("docs/openapi disabled in production", 'docs_url="/docs" if settings.debug else None' in main_text),
]

anchors_path = reports_dir / "static-control-anchors.txt"
anchors_lines = ["# Static Control Anchors"]
for label, passed in static_checks:
    anchors_lines.append(f"- {label}: {'PASS' if passed else 'FAIL'}")
anchors_path.write_text("\n".join(anchors_lines) + "\n", encoding="utf-8")

prior_static = [
    {"id": "PH500-DA-001", "severity": "P0", "status": "fixed" if static_checks[0][1] else "reopened", "evidence": [str(root / "scripts/prod/bootstrap_db.sh")]},
    {"id": "PH500-DA-002", "severity": "P1", "status": "fixed" if static_checks[1][1] else "reopened", "evidence": [str(root / "frontend/Dockerfile")]},
    {"id": "PH500-DA-003", "severity": "P1", "status": "fixed" if static_checks[2][1] else "reopened", "evidence": [str(root / "scripts/prod/setup.sh")]},
    {"id": "PH500-DA-004", "severity": "P1", "status": "fixed" if static_checks[3][1] else "reopened", "evidence": [str(root / "scripts/prod/lib/preflight.sh")]},
]
write_json(reports_dir / "prior-blocker-revalidation-static.json", prior_static)

lifecycle_statuses = {
    "p3_preflight_strict": rc("p3_preflight_strict"),
    "p3_deploy": rc("p3_deploy"),
    "p3_verify_runtime": rc("p3_verify_runtime"),
    "p3_smoke_after_deploy": rc("p3_smoke_after_deploy"),
    "p3_upgrade": rc("p3_upgrade"),
    "p3_rollback": rc("p3_rollback"),
    "p3_smoke_after_rollback": rc("p3_smoke_after_rollback"),
}
(reports_dir / "lifecycle-rc.txt").write_text(
    "\n".join(f"{k}: {v}" for k, v in lifecycle_statuses.items()) + "\n",
    encoding="utf-8",
)

trivy_backend_count = trivy_high_critical_count(reports_dir / "trivy-backend.json")
trivy_frontend_count = trivy_high_critical_count(reports_dir / "trivy-frontend.json")
grype_backend_count = grype_high_critical_count(reports_dir / "grype-backend.json")
gitleaks_findings_count = gitleaks_count(reports_dir / "gitleaks-report.json")

supply_counts = {
    "trivy_backend_high_critical": trivy_backend_count,
    "trivy_frontend_high_critical": trivy_frontend_count,
    "grype_backend_high_critical": grype_backend_count,
    "gitleaks_findings": gitleaks_findings_count,
}
write_json(reports_dir / "supply-chain-counts.json", supply_counts)

mc_06_pass = rc("p2_preflight_invalid_host_range") != 0 and rc("p2_preflight_invalid_container_port") != 0
mc_07_pass = rc("p2_setup_dryrun_exit") == 0 and not setup_tmp_dirs_new
mc_08_pass = frontend_uid is not None and frontend_uid != 0
mc_09_pass = all(value == 0 for value in lifecycle_statuses.values())
mc_10_pass = docs_code == 404 and openapi_code == 404
mc_11_pass = probe_unresolved == 0 and probe_security_defects == 0
mc_12_pass = (
    trivy_backend_count == 0
    and trivy_frontend_count == 0
    and grype_backend_count == 0
    and gitleaks_findings_count == 0
)

mandatory_controls = [
    {"id": "MC-01", "description": "Production settings fail-closed tests", "severity": "High", "status": "PASS" if rc("p2_prod_guard_pytests") == 0 else "FAIL", "note": f"pytest rc={rc('p2_prod_guard_pytests')}", "evidence": [str(logs_dir / "p2_prod_guard_pytests.log")]},
    {"id": "MC-02", "description": "Dev auth boundary non-discoverable/non-usable", "severity": "Medium", "status": "PASS" if rc("p2_security_gap_round5") == 0 else "FAIL", "note": f"gap-round5 rc={rc('p2_security_gap_round5')}", "evidence": [str(logs_dir / "p2_security_gap_round5.log")]},
    {"id": "MC-03", "description": "Redis fail-closed on sensitive prefixes", "severity": "High", "status": "PASS" if rc("p2_security_gap_round5") == 0 else "FAIL", "note": f"gap-round5 rc={rc('p2_security_gap_round5')}", "evidence": [str(logs_dir / "p2_security_gap_round5.log")]},
    {"id": "MC-04", "description": "Protocol parser abuse rejection", "severity": "Medium", "status": "PASS" if rc("p2_security_gap_round5") == 0 else "FAIL", "note": f"gap-round5 rc={rc('p2_security_gap_round5')}", "evidence": [str(logs_dir / "p2_security_gap_round5.log")]},
    {"id": "MC-05", "description": "Outbound SSRF/egress guards", "severity": "High", "status": "PASS" if rc("p2_security_gap_round5") == 0 else "FAIL", "note": f"gap-round5 rc={rc('p2_security_gap_round5')}", "evidence": [str(logs_dir / "p2_security_gap_round5.log")]},
    {"id": "MC-06", "description": "Preflight rejects invalid host/container frontend ports", "severity": "High", "status": "PASS" if mc_06_pass else "FAIL", "note": f"host_rc={rc('p2_preflight_invalid_host_range')} container_rc={rc('p2_preflight_invalid_container_port')}", "evidence": [str(logs_dir / "p2_preflight_invalid_host_range.log"), str(logs_dir / "p2_preflight_invalid_container_port.log")]},
    {"id": "MC-07", "description": "setup.sh dry-run leaves no temp secret residue", "severity": "High", "status": "PASS" if mc_07_pass else "FAIL", "note": f"new_tmp_dirs={setup_tmp_dirs_new}", "evidence": [str(logs_dir / "p2_setup_dryrun_exit.log"), str(tmp_dir / 'setup_tmp_dirs_new.json')]},
    {"id": "MC-08", "description": "Frontend runtime executes as non-root UID", "severity": "High", "status": "PASS" if mc_08_pass else "FAIL", "note": f"uid={frontend_uid}", "evidence": [str(logs_dir / "p3_frontend_uid.log")]},
    {"id": "MC-09", "description": "Lifecycle deploy/upgrade/rollback and smoke", "severity": "High", "status": "PASS" if mc_09_pass else "FAIL", "note": str(lifecycle_statuses), "evidence": [str(logs_dir / "p3_preflight_strict.log"), str(logs_dir / "p3_deploy.log"), str(logs_dir / "p3_verify_runtime.log"), str(logs_dir / "p3_smoke_after_deploy.log"), str(logs_dir / "p3_upgrade.log"), str(logs_dir / "p3_rollback.log"), str(logs_dir / "p3_smoke_after_rollback.log")]},
    {"id": "MC-10", "description": "Prod runtime disables /docs and /openapi.json", "severity": "Medium", "status": "PASS" if mc_10_pass else "FAIL", "note": f"docs_code={docs_code} openapi_code={openapi_code}", "evidence": [str(logs_dir / "p3_backend_docs_code.log"), str(logs_dir / "p3_backend_openapi_code.log")]},
    {"id": "MC-11", "description": "Protocol contract probe unresolved drift/defect == 0", "severity": "High", "status": "PASS" if mc_11_pass else "FAIL", "note": f"probe_unresolved={probe_unresolved} probe_security_defects={probe_security_defects}", "evidence": [str(logs_dir / "p2_security_contract_probe.log"), str(probe_results_path) if probe_results_path else "not found"]},
    {"id": "MC-12", "description": "Supply-chain gates report zero unresolved High/Critical", "severity": "High", "status": "PASS" if mc_12_pass else "FAIL", "note": json.dumps(supply_counts), "evidence": [str(logs_dir / "p4_bandit_high_gate.log"), str(logs_dir / "p4_pip_audit.log"), str(logs_dir / "p4_npm_audit_high.log"), str(logs_dir / "p4_trivy_backend.log"), str(logs_dir / "p4_trivy_frontend.log"), str(logs_dir / "p4_grype_backend.log"), str(logs_dir / "p4_gitleaks_scan.log"), str(reports_dir / "supply-chain-counts.json")]},
]

findings: list[dict[str, object]] = []
if not mc_09_pass:
    findings.append({
        "id": "MC-09",
        "severity": "High",
        "owner_lane": "platform/security",
        "risk_statement": "Lifecycle deploy/upgrade/rollback and smoke",
        "status": "open",
        "evidence": mandatory_controls[8]["evidence"],
        "fix_plan": "Implement control remediation and rerun listed verification tests.",
        "verification_test": mandatory_controls[8]["evidence"],
        "target_date": "2026-02-29",
        "note": str(lifecycle_statuses),
    })
if not mc_10_pass:
    findings.append({
        "id": "MC-10",
        "severity": "Medium",
        "owner_lane": "platform/security",
        "risk_statement": "Prod runtime disables /docs and /openapi.json",
        "status": "open",
        "evidence": mandatory_controls[9]["evidence"],
        "fix_plan": "Implement control remediation and rerun listed verification tests.",
        "verification_test": mandatory_controls[9]["evidence"],
        "target_date": "2026-02-29",
    })
if not mc_11_pass:
    findings.append({
        "id": "MC-11",
        "severity": "High",
        "owner_lane": "platform/security",
        "risk_statement": "Protocol contract probe unresolved drift/defect == 0",
        "status": "open",
        "evidence": mandatory_controls[10]["evidence"],
        "fix_plan": "Implement control remediation and rerun listed verification tests.",
        "verification_test": mandatory_controls[10]["evidence"],
        "target_date": "2026-02-29",
    })
if ph500_001_status != "fixed":
    findings.append({
        "id": "PH500-DA-001",
        "severity": "High",
        "owner_lane": "scripts/prod",
        "risk_statement": "Prior Phase500 blocker PH500-DA-001 remains unresolved",
        "status": "open",
        "evidence": [str(logs_dir / "p3_deploy.log")],
        "fix_plan": "Apply blocker-specific patch and rerun lifecycle + runtime checks.",
        "verification_test": [str(logs_dir / "p3_deploy.log")],
        "target_date": "2026-02-29",
    })
if gitleaks_findings_count > 0:
    findings.append({
        "id": "SC-GL-001",
        "severity": "High",
        "owner_lane": "repo-security",
        "risk_statement": "Gitleaks reported potential secrets in repository",
        "status": "open",
        "evidence": [str(reports_dir / "gitleaks-report.json")],
        "fix_plan": "Investigate/rotate/remove secret material and rerun gitleaks scan.",
        "verification_test": [str(logs_dir / "p4_gitleaks_scan.log")],
        "target_date": "2026-02-29",
    })

mandatory_fail_count = sum(1 for item in mandatory_controls if item["status"] == "FAIL")
open_high_critical_count = sum(
    1
    for item in findings
    if str(item.get("status", "")).lower() == "open" and str(item.get("severity", "")).lower() in {"high", "critical"}
)
open_medium_count = sum(
    1
    for item in findings
    if str(item.get("status", "")).lower() == "open" and str(item.get("severity", "")).lower() == "medium"
)

if open_high_critical_count > 0 or mandatory_fail_count > 0 or required_failures > 0:
    decision = "NO-GO"
elif open_medium_count > 0:
    decision = "CONDITIONAL"
else:
    decision = "PASS"

findings_payload = {
    "run_id": run_id,
    "generated_at_utc": datetime.now(UTC).isoformat(),
    "decision": decision,
    "confidence": "LOCAL_ONLY",
    "findings": findings,
    "mandatory_controls": mandatory_controls,
    "open_high_critical_count": open_high_critical_count,
}
write_json(reports_dir / "findings.json", findings_payload)

def score_status(ids: list[str]) -> tuple[str, int]:
    statuses = [item["status"] for item in mandatory_controls if item["id"] in ids]
    if statuses and all(status == "PASS" for status in statuses):
        return "PASS", 5
    if any(status == "PASS" for status in statuses):
        return "PARTIAL", 3
    return "FAIL", 1

access_status, access_score = score_status(["MC-01", "MC-02", "MC-03", "MC-04", "MC-05", "MC-11"])
change_status, change_score = score_status(["MC-06", "MC-07", "MC-12"])
monitoring_status, monitoring_score = score_status(["MC-10", "MC-11"])
availability_status, availability_score = score_status(["MC-08", "MC-09"])

scorecard = [
    {
        "domain": "Access Control",
        "soc2_mapping": "CC6",
        "status": access_status,
        "score_0_to_5": access_score,
        "evidence": [str(reports_dir / "findings.json"), str(reports_dir / "doc-runtime-parity.md")],
        "notes": "Authentication, authorization, and fail-closed controls",
    },
    {
        "domain": "Change Management / SDLC",
        "soc2_mapping": "CC8",
        "status": change_status,
        "score_0_to_5": change_score,
        "evidence": [str(reports_dir / "findings.json"), str(reports_dir / "doc-runtime-parity.md")],
        "notes": "Deployment script integrity and safe rollout behavior",
    },
    {
        "domain": "Monitoring / Incident Response",
        "soc2_mapping": "CC7",
        "status": monitoring_status,
        "score_0_to_5": monitoring_score,
        "evidence": [str(reports_dir / "findings.json"), str(reports_dir / "doc-runtime-parity.md")],
        "notes": "Protocol/runtime observability and response guardrails",
    },
    {
        "domain": "Availability / Recovery",
        "soc2_mapping": "A1",
        "status": availability_status,
        "score_0_to_5": availability_score,
        "evidence": [str(reports_dir / "findings.json"), str(reports_dir / "doc-runtime-parity.md")],
        "notes": "Lifecycle availability and rollback/recovery posture",
    },
]
write_json(reports_dir / "scorecard.json", scorecard)

parity_lines = [
    "# Doc/Runtime Parity",
    "",
    f"- Source checklist: {root / 'docs/deployment/security-checklist.md'}",
    f"- Source install manual: {root / 'docs/deployment/installation-manual.md'}",
    f"- Source migration runbook: {root / 'docs/deployment/migrations.md'}",
    f"- Source security policy: {root / 'docs/security/SECURITY.md'}",
    "",
    "## Observed controls",
    f"- Lifecycle matrix: {reports_dir / 'lifecycle-rc.txt'}",
    f"- Static anchors: {reports_dir / 'static-control-anchors.txt'}",
    f"- Supply-chain counts: {reports_dir / 'supply-chain-counts.json'}",
]
(reports_dir / "doc-runtime-parity.md").write_text("\n".join(parity_lines) + "\n", encoding="utf-8")

summary_payload = {
    "run_id": run_id,
    "decision": decision,
    "artifact_root": str(artifact_root),
    "report": str(report_path),
    "open_high_critical_count": open_high_critical_count,
    "required_failures": required_failures,
}
write_json(artifact_root / "SUMMARY.json", summary_payload)

result_lines = [
    f"# Production Readiness Deep Audit ({datetime.now(UTC).date().isoformat()})",
    "",
    "## Result",
    f"- Decision: **{decision}**",
    "- Confidence: **LOCAL_ONLY**",
    f"- Run ID: `{run_id}`",
    f"- Artifact root: `{artifact_root}`",
    f"- Open High/Critical findings: `{open_high_critical_count}`",
    f"- Required command failures: `{required_failures}`",
    "",
    "### SOC 2 Scorecard",
]
for item in scorecard:
    result_lines.append(
        f"- {item['domain']} ({item['soc2_mapping']}): **{item['status']}** ({item['score_0_to_5']}/5)"
    )

if findings:
    result_lines.extend(["", "### Prioritized Remediation Backlog"])
    for finding in findings:
        result_lines.append(f"- `{finding['id']}` [{finding['severity']}] owner=`{finding['owner_lane']}` target=`{finding['target_date']}`")
        result_lines.append(f"  risk: {finding['risk_statement']}")
        result_lines.append(f"  fix: {finding['fix_plan']}")
        result_lines.append(f"  verification: {finding['verification_test']}")

evidence_lines = [
    "",
    "## Evidence map",
    f"- Command matrix: `{reports_dir / 'command-matrix.json'}`",
    f"- Findings: `{reports_dir / 'findings.json'}`",
    f"- Scorecard: `{reports_dir / 'scorecard.json'}`",
    f"- Static anchors: `{reports_dir / 'static-control-anchors.txt'}`",
    f"- Prior blocker static revalidation: `{reports_dir / 'prior-blocker-revalidation-static.json'}`",
    f"- Prior blocker runtime revalidation: `{reports_dir / 'prior-blocker-revalidation-runtime.json'}`",
    f"- Lifecycle summary: `{reports_dir / 'lifecycle-rc.txt'}`",
    f"- Parity analysis: `{reports_dir / 'doc-runtime-parity.md'}`",
    f"- Supply-chain counts: `{reports_dir / 'supply-chain-counts.json'}`",
    f"- Trivy backend: `{reports_dir / 'trivy-backend.json'}`",
    f"- Trivy frontend: `{reports_dir / 'trivy-frontend.json'}`",
    f"- Syft SBOM backend: `{reports_dir / 'sbom-backend.json'}`",
    f"- Grype backend: `{reports_dir / 'grype-backend.json'}`",
    f"- Gitleaks report: `{reports_dir / 'gitleaks-report.json'}`",
]

notes_lines = [
    "",
    "## Notes/limitations",
    "- Local-only evidence model: no staging/prod runtime verification was executed.",
    "- Lifecycle validation used synthetic external-Postgres simulation via Docker and may not reflect tenant-specific infrastructure constraints.",
    "- Existing local developer services may influence environment timing/health behavior; all command outputs are linked for reproducibility.",
]

report_path.write_text("\n".join(result_lines + evidence_lines + notes_lines) + "\n", encoding="utf-8")

phase500_report = root / "docs/security/reports/phase500-prod-deep-audit-2026-02-21.md"
if phase500_report.exists() and all(item["status"] == "fixed" for item in prior_runtime):
    supersession = f"> Supersession note ({datetime.now(UTC).date().isoformat()}): Prior blockers PH500-DA-001..004 revalidated as fixed in `{report_path}`."
    existing = phase500_report.read_text(encoding="utf-8")
    if supersession not in existing:
        phase500_report.write_text(supersession + "\n\n" + existing, encoding="utf-8")
PY

log "Production readiness local audit complete: $ARTIFACT_ROOT"
log "Report: $REPORT_PATH"
