#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/prod/lib/preflight.sh
source "${SCRIPT_DIR}/lib/preflight.sh"

replace=false

usage() {
  cat <<EOF
Usage: scripts/prod/install_redis.sh --backend-env PATH [options]

Installs/ensures the Phase 500 Redis container (required for production mode).

Options:
  --backend-env PATH   Path to backend.env (reads REDIS_PASSWORD)
  --replace            Force recreate container even if it exists
  --dry-run            Print commands without executing
  --yes                Non-interactive confirmation
  --verbose            More logging
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
    --replace)
      replace=true
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

if [[ -z "$BACKEND_ENV" ]]; then
  die "Missing --backend-env"
fi
preflight_backend_env "$BACKEND_ENV"

ensure_network "$NETWORK_NAME"
ensure_volume "$REDIS_DATA_VOLUME"

if container_exists "$REDIS_CONTAINER"; then
  if [[ "$replace" != "true" ]]; then
    log "Redis container already exists: $REDIS_CONTAINER (use --replace to recreate)"
    exit 0
  fi
  rm_container_if_exists "$REDIS_CONTAINER"
fi

redis_password="$(envfile_get "$BACKEND_ENV" "REDIS_PASSWORD" || true)"
if [[ -z "$redis_password" ]]; then
  die "REDIS_PASSWORD is required in backend env"
fi

log "Installing redis container: $REDIS_CONTAINER"
run_redacted \
  "docker run -d --name $REDIS_CONTAINER ... redis-server --requirepass ***" \
  docker run -d \
  --name "$REDIS_CONTAINER" \
  --restart unless-stopped \
  --security-opt no-new-privileges \
  --network "$NETWORK_NAME" \
  --network-alias redis \
  -v "${REDIS_DATA_VOLUME}:/data" \
  redis:7-alpine \
  redis-server --appendonly yes --requirepass "$redis_password"

log "Redis install: OK"
