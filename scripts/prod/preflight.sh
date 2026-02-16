#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/prod/lib/preflight.sh
source "${SCRIPT_DIR}/lib/preflight.sh"

backend_image=""
check_db=false
check_only=false

usage() {
  cat <<EOF
Usage: scripts/prod/preflight.sh --backend-env PATH --frontend-env PATH [options]

Options:
  --backend-env PATH       Path to backend.env
  --frontend-env PATH      Path to frontend.env
  --backend-image IMAGE    Backend image ref to use for --check-db (e.g. riskhub-backend:1.0.0)
  --check-db               Run SELECT 1 against external PostgreSQL using an ephemeral backend container
  --check-only             Alias for --check-db=false (skip DB check)
  --dry-run                Print commands without executing them
  --yes                    Non-interactive mode (no prompts)
  --verbose                More logging
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
    --backend-image)
      backend_image="${2:-}"
      shift 2
      ;;
    --check-db)
      check_db=true
      shift
      ;;
    --check-only)
      check_only=true
      shift
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

docker_require_running
require_cmd curl

if [[ -z "$BACKEND_ENV" ]]; then
  die "Missing --backend-env"
fi
if [[ -z "$FRONTEND_ENV" ]]; then
  die "Missing --frontend-env"
fi

log "Preflight: validating configuration and host readiness"
preflight_backend_env "$BACKEND_ENV"
preflight_frontend_env "$FRONTEND_ENV"

if [[ "$check_only" == "true" ]]; then
  check_db=false
fi

if [[ "$check_db" == "true" ]]; then
  preflight_check_db_connectivity "$BACKEND_ENV" "$backend_image"
fi

log "Preflight: OK"
