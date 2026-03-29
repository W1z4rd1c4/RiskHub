#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/prod/lib/preflight.sh
source "${SCRIPT_DIR}/lib/preflight.sh"

replace=false
redis_image=""

usage() {
  cat <<EOF
Usage: scripts/prod/install_redis.sh --backend-env PATH --redis-image IMAGE [options]

Installs/ensures the Phase 500 Redis container (required for production mode).

Options:
  --backend-env PATH   Path to backend.env (validates the rendered runtime contract)
  --redis-image IMAGE  Redis wrapper image ref (for example ghcr.io/<owner>/riskhub-redis:v1.2.3)
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
    --redis-image)
      redis_image="${2:-}"
      shift 2
      ;;
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
if [[ -z "$redis_image" ]]; then
  die "Missing --redis-image"
fi

ensure_network "$NETWORK_NAME"
ensure_volume "$REDIS_DATA_VOLUME"
prepare_volume_ownership "$REDIS_DATA_VOLUME" "$redis_image" "/data" "10001:10001"
require_dir "$SECRET_DIR"

if container_exists "$REDIS_CONTAINER"; then
  if [[ "$replace" != "true" ]]; then
    log "Redis container already exists: $REDIS_CONTAINER (use --replace to recreate)"
    exit 0
  fi
  rm_container_if_exists "$REDIS_CONTAINER"
fi

log "Installing redis container: $REDIS_CONTAINER"
run_redacted \
  "docker run -d --name $REDIS_CONTAINER -e RISKHUB_REDIS_PASSWORD_FILE=${SECRET_DIR}/redis_password ... $redis_image" \
  docker run -d \
  --name "$REDIS_CONTAINER" \
  --restart unless-stopped \
  --security-opt no-new-privileges \
  --network "$NETWORK_NAME" \
  --network-alias redis \
  -e "RISKHUB_REDIS_PASSWORD_FILE=${SECRET_DIR}/redis_password" \
  -v "${SECRET_DIR}:${SECRET_DIR}:ro" \
  -v "${REDIS_DATA_VOLUME}:/data" \
  "$redis_image"

log "Redis install: OK"
