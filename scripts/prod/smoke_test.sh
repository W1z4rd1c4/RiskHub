#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/prod/lib/preflight.sh
source "${SCRIPT_DIR}/lib/preflight.sh"

retries=30
sleep_seconds=2

usage() {
  cat <<EOF
Usage: scripts/prod/smoke_test.sh --frontend-env PATH [options]

Validates a Phase 500 deployment:
- frontend root responds
- backend health is reachable via frontend /api proxy
- backend docs are disabled in production (checked inside backend container)

Options:
  --frontend-env PATH     Path to frontend.env
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
preflight_frontend_env "$FRONTEND_ENV"

host_port="$(envfile_get "$FRONTEND_ENV" "FRONTEND_HOST_PORT" || true)"
if [[ -z "$host_port" ]]; then
  die "FRONTEND_HOST_PORT missing in frontend env"
fi

if [[ "$DRY_RUN" == "true" ]]; then
  printf '+ curl -f http://localhost:%s/\\n' "$host_port"
  printf '+ curl -f http://localhost:%s/api/v1/health\\n' "$host_port"
  printf '+ docker exec %s curl -sS -o /dev/null -w \"%%{http_code}\" http://localhost:8000/docs\\n' "$BACKEND_CONTAINER"
  printf '+ docker exec %s curl -sS -o /dev/null -w \"%%{http_code}\" http://localhost:8000/openapi.json\\n' "$BACKEND_CONTAINER"
  exit 0
fi

attempt=1
while [[ "$attempt" -le "$retries" ]]; do
  if [[ "$VERBOSE" == "true" ]]; then
    log "Smoke attempt $attempt/$retries"
  fi

  if curl -fsS "http://localhost:${host_port}/" >/dev/null 2>&1; then
    health_json="$(curl -fsS "http://localhost:${host_port}/api/v1/health" 2>/dev/null || true)"
    if [[ -n "$health_json" ]] && [[ "$health_json" == *"\"status\":\"healthy\""* ]] && [[ "$health_json" == *"\"database\":\"connected\""* ]]; then
      break
    fi
  fi

  attempt=$((attempt + 1))
  sleep "$sleep_seconds"
done

if [[ "$attempt" -gt "$retries" ]]; then
  die "Smoke failed: frontend or /api/v1/health did not become ready"
fi

log "Smoke: frontend OK and backend health OK via /api proxy"

# Backend docs disabled check (backend not published; validate in-container).
if ! container_exists "$BACKEND_CONTAINER"; then
  die "Backend container not found: $BACKEND_CONTAINER"
fi

docs_code="$(docker exec "$BACKEND_CONTAINER" curl -sS -o /dev/null -w "%{http_code}" http://localhost:8000/docs 2>/dev/null || true)"
if [[ "$docs_code" != "404" ]]; then
  die "Expected backend /docs to be disabled in production (404), got: $docs_code"
fi

openapi_code="$(docker exec "$BACKEND_CONTAINER" curl -sS -o /dev/null -w "%{http_code}" http://localhost:8000/openapi.json 2>/dev/null || true)"
if [[ "$openapi_code" != "404" ]]; then
  die "Expected backend /openapi.json to be disabled in production (404), got: $openapi_code"
fi

log "Smoke: backend /docs and /openapi.json disabled (production mode)"

log "Smoke test: PASS"
