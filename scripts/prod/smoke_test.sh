#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/prod/lib/preflight.sh
source "${SCRIPT_DIR}/lib/preflight.sh"

retries=30
sleep_seconds=2
host_header=""

reliability_runtime_check_python() {
  cat <<'PY'
import asyncio
import json
import os
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

REQUIRED_TABLES = {"scheduler_job_runs", "app_outbox_events"}


async def main() -> None:
    db_url = Path(os.environ["DATABASE_URL_FILE"]).read_text(encoding="utf-8").strip()
    engine = create_async_engine(db_url)
    try:
        async with engine.connect() as conn:
            table_names = set(
                (
                    await conn.execute(
                        text(
                            "SELECT tablename FROM pg_tables "
                            "WHERE schemaname = 'public' "
                            "AND tablename IN ('scheduler_job_runs', 'app_outbox_events')"
                        )
                    )
                ).scalars()
            )
            missing_tables = sorted(REQUIRED_TABLES - table_names)
            scheduler_runtime_rows = 0
            dead_letter_count = 0
            if not missing_tables:
                scheduler_runtime_rows = int(
                    (
                        await conn.execute(
                            text(
                                "SELECT COUNT(*) FROM scheduler_job_runs "
                                "WHERE job_name = '__scheduler_runtime__' AND status = 'running'"
                            )
                        )
                    ).scalar_one()
                )
                dead_letter_count = int(
                    (
                        await conn.execute(
                            text("SELECT COUNT(*) FROM app_outbox_events WHERE status = 'dead_letter'")
                        )
                    ).scalar_one()
                )
    finally:
        await engine.dispose()

    payload = {
        "missing_tables": missing_tables,
        "scheduler_runtime_rows": scheduler_runtime_rows,
        "dead_letter_count": dead_letter_count,
    }
    if missing_tables or scheduler_runtime_rows != 1 or dead_letter_count != 0:
        raise SystemExit(json.dumps(payload, sort_keys=True))
    print(json.dumps(payload, sort_keys=True))


asyncio.run(main())
PY
}

usage() {
  cat <<EOF
Usage: scripts/prod/smoke_test.sh --frontend-env PATH [options]

Validates a Phase 500 deployment:
- frontend root responds
- backend health is reachable via frontend /api proxy
- backend docs are disabled in production (checked inside backend container)
- reliability runtime checks confirm scheduler ownership, outbox health, and required tables

Options:
  --frontend-env PATH     Path to frontend.env
  --backend-env PATH      Optional path to backend.env (used for ALLOWED_HOSTS fallback)
  --host-header HOST      Optional explicit Host header override for smoke requests
  --retries N             Retry count (default: $retries)
  --sleep SECONDS         Sleep between retries (default: $sleep_seconds)
  --dry-run               Print commands without executing
  --verbose               More logging
EOF
}

parse_common_flags "$@"
if [[ ${#REMAINING_ARGS[@]} -gt 0 ]]; then
  set -- "${REMAINING_ARGS[@]}"
else
  set --
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host-header)
      host_header="${2:-}"
      shift 2
      ;;
    --retries)
      retries="${2:-}"
      shift 2
      ;;
    --sleep)
      sleep_seconds="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1 (use --help)"
      ;;
  esac
done

require_cmd curl
docker_require_running

if [[ -z "$FRONTEND_ENV" ]]; then
  die "Missing --frontend-env"
fi
if [[ -n "$BACKEND_ENV" ]]; then
  require_file "$BACKEND_ENV"
fi
# Smoke checks validate an active deployment, so the frontend port is expected to be in use.
preflight_frontend_env "$FRONTEND_ENV" "true"

host_port="$(envfile_get "$FRONTEND_ENV" "FRONTEND_HOST_PORT" || true)"
if [[ -z "$host_port" ]]; then
  die "FRONTEND_HOST_PORT missing in frontend env"
fi

normalize_host_value() {
  local raw="$1"
  local normalized
  normalized="$(printf '%s' "$raw" | tr -d '\r\n' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/^"//; s/"$//')"
  normalized="${normalized#http://}"
  normalized="${normalized#https://}"
  normalized="${normalized%%/*}"
  printf '%s' "$normalized"
}

extract_first_allowed_host() {
  local allowed_hosts_raw="$1"
  local first_entry
  first_entry="$(
    printf '%s' "$allowed_hosts_raw" \
      | tr -d '\r\n' \
      | sed -E 's/^[[:space:]]*\[//; s/\][[:space:]]*$//' \
      | awk -F',' '{print $1}'
  )"
  normalize_host_value "$first_entry"
}

resolved_host=""
host_source=""
if [[ -n "$host_header" ]]; then
  resolved_host="$(normalize_host_value "$host_header")"
  host_source="cli --host-header"
fi

if [[ -z "$resolved_host" ]]; then
  server_name="$(envfile_get "$FRONTEND_ENV" "SERVER_NAME" || true)"
  server_name="$(normalize_host_value "$server_name")"
  if [[ -n "$server_name" ]]; then
    resolved_host="$server_name"
    host_source="frontend.env SERVER_NAME"
  fi
fi

if [[ -z "$resolved_host" && -n "$BACKEND_ENV" ]]; then
  allowed_hosts="$(envfile_get "$BACKEND_ENV" "ALLOWED_HOSTS" || true)"
  first_allowed_host="$(extract_first_allowed_host "$allowed_hosts")"
  if [[ -n "$first_allowed_host" ]]; then
    resolved_host="$first_allowed_host"
    host_source="backend.env ALLOWED_HOSTS[0]"
  fi
fi

if [[ -z "$resolved_host" ]]; then
  die "Unable to resolve Host header. Provide --host-header, set SERVER_NAME in frontend env, or pass --backend-env with ALLOWED_HOSTS."
fi

if [[ "$VERBOSE" == "true" ]]; then
  log "Smoke Host header resolved: ${resolved_host} (source: ${host_source})"
fi

if [[ "$DRY_RUN" == "true" ]]; then
  printf '+ curl -f -H "Host: %s" http://localhost:%s/\\n' "$resolved_host" "$host_port"
  printf '+ curl -f -H "Host: %s" http://localhost:%s/api/v1/health\\n' "$resolved_host" "$host_port"
  printf '+ docker exec %s curl -sS -H "Host: %s" -o /dev/null -w \"%%{http_code}\" http://localhost:8000/docs\\n' "$BACKEND_CONTAINER" "$resolved_host"
  printf '+ docker exec %s curl -sS -H "Host: %s" -o /dev/null -w \"%%{http_code}\" http://localhost:8000/openapi.json\\n' "$BACKEND_CONTAINER" "$resolved_host"
  printf "+ docker exec -i %s python - <<'PY'\\n" "$BACKEND_CONTAINER"
  reliability_runtime_check_python
  printf 'PY\\n'
  exit 0
fi

body_excerpt() {
  local raw="$1"
  local compact
  compact="$(printf '%s' "$raw" | tr '\r\n' ' ' | sed -E 's/[[:space:]]+/ /g')"
  printf '%.200s' "$compact"
}

attempt=1
last_frontend_status=""
last_frontend_body=""
last_health_status=""
last_health_body=""
while [[ "$attempt" -le "$retries" ]]; do
  if [[ "$VERBOSE" == "true" ]]; then
    log "Smoke attempt $attempt/$retries"
  fi

  frontend_probe="$(curl -sS -H "Host: ${resolved_host}" -w $'\n%{http_code}' "http://localhost:${host_port}/" 2>/dev/null || true)"
  last_frontend_status="$(printf '%s' "$frontend_probe" | tail -n 1 | tr -d '\r')"
  last_frontend_body="$(printf '%s' "$frontend_probe" | sed '$d')"

  health_probe="$(curl -sS -H "Host: ${resolved_host}" -w $'\n%{http_code}' "http://localhost:${host_port}/api/v1/health" 2>/dev/null || true)"
  last_health_status="$(printf '%s' "$health_probe" | tail -n 1 | tr -d '\r')"
  last_health_body="$(printf '%s' "$health_probe" | sed '$d')"

  if [[ "$VERBOSE" == "true" ]]; then
    log "Smoke attempt statuses: root=${last_frontend_status:-n/a} health=${last_health_status:-n/a}"
  fi

  if [[ "$last_frontend_status" =~ ^[23][0-9][0-9]$ ]] && [[ "$last_health_status" == "200" ]]; then
    if [[ "$last_health_body" == *"\"status\":\"healthy\""* ]] && [[ "$last_health_body" == *"\"database\":\"connected\""* ]]; then
      break
    fi
  fi

  attempt=$((attempt + 1))
  sleep "$sleep_seconds"
done

if [[ "$attempt" -gt "$retries" ]]; then
  die "Smoke failed: frontend or /api/v1/health did not become ready (host=${resolved_host} root_status=${last_frontend_status:-n/a} root_body='$(body_excerpt "$last_frontend_body")' health_status=${last_health_status:-n/a} health_body='$(body_excerpt "$last_health_body")')"
fi

log "Smoke: frontend OK and backend health OK via /api proxy"

# Backend docs disabled check (backend not published; validate in-container).
if ! container_exists "$BACKEND_CONTAINER"; then
  die "Backend container not found: $BACKEND_CONTAINER"
fi

docs_code="$(docker exec "$BACKEND_CONTAINER" curl -sS -H "Host: ${resolved_host}" -o /dev/null -w "%{http_code}" http://localhost:8000/docs 2>/dev/null || true)"
if [[ "$docs_code" != "404" ]]; then
  die "Expected backend /docs to be disabled in production (404), got: $docs_code"
fi

openapi_code="$(docker exec "$BACKEND_CONTAINER" curl -sS -H "Host: ${resolved_host}" -o /dev/null -w "%{http_code}" http://localhost:8000/openapi.json 2>/dev/null || true)"
if [[ "$openapi_code" != "404" ]]; then
  die "Expected backend /openapi.json to be disabled in production (404), got: $openapi_code"
fi

log "Smoke: backend /docs and /openapi.json disabled (production mode)"

reliability_report="$(
  docker exec -i "$BACKEND_CONTAINER" python - <<'PY'
import asyncio
import json
import os
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

REQUIRED_TABLES = {"scheduler_job_runs", "app_outbox_events"}


async def main() -> None:
    db_url = Path(os.environ["DATABASE_URL_FILE"]).read_text(encoding="utf-8").strip()
    engine = create_async_engine(db_url)
    try:
        async with engine.connect() as conn:
            table_names = set(
                (
                    await conn.execute(
                        text(
                            "SELECT tablename FROM pg_tables "
                            "WHERE schemaname = 'public' "
                            "AND tablename IN ('scheduler_job_runs', 'app_outbox_events')"
                        )
                    )
                ).scalars()
            )
            missing_tables = sorted(REQUIRED_TABLES - table_names)
            scheduler_runtime_rows = 0
            dead_letter_count = 0
            if not missing_tables:
                scheduler_runtime_rows = int(
                    (
                        await conn.execute(
                            text(
                                "SELECT COUNT(*) FROM scheduler_job_runs "
                                "WHERE job_name = '__scheduler_runtime__' AND status = 'running'"
                            )
                        )
                    ).scalar_one()
                )
                dead_letter_count = int(
                    (
                        await conn.execute(
                            text("SELECT COUNT(*) FROM app_outbox_events WHERE status = 'dead_letter'")
                        )
                    ).scalar_one()
                )
    finally:
        await engine.dispose()

    payload = {
        "missing_tables": missing_tables,
        "scheduler_runtime_rows": scheduler_runtime_rows,
        "dead_letter_count": dead_letter_count,
    }
    if missing_tables or scheduler_runtime_rows != 1 or dead_letter_count != 0:
        raise SystemExit(json.dumps(payload, sort_keys=True))
    print(json.dumps(payload, sort_keys=True))


asyncio.run(main())
PY
)" || die "Reliability runtime check failed: ${reliability_report:-no output}"

log "Smoke: reliability runtime OK ${reliability_report}"

log "Smoke test: PASS"
