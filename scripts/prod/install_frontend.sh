#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/prod/lib/preflight.sh
source "${SCRIPT_DIR}/lib/preflight.sh"

frontend_image=""
previous_image=""

usage() {
  cat <<EOF
Usage: scripts/prod/install_frontend.sh --frontend-env PATH --frontend-image IMAGE [options]

Installs the frontend nginx container that serves the SPA and proxies /api to backend via docker alias 'backend'.

Options:
  --frontend-env PATH       Path to frontend.env (reads FRONTEND_HOST_PORT)
  --frontend-image IMAGE    Frontend image ref (e.g. riskhub-frontend:1.0.0)
  --previous-image IMAGE    Optional label value recorded for rollback (com.riskhub.previous_image)
  --dry-run                 Print commands without executing
  --yes                     Non-interactive confirmation
  --verbose                 More logging
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
    --frontend-image)
      frontend_image="${2:-}"
      shift 2
      ;;
    --previous-image)
      previous_image="${2:-}"
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

docker_require_running

if [[ -z "$FRONTEND_ENV" ]]; then
  die "Missing --frontend-env"
fi

# Replacement flows (upgrade/rollback) can legitimately see the frontend host port in use.
allow_port_in_use="false"
if [[ -n "$previous_image" ]] && container_exists "$FRONTEND_CONTAINER"; then
  allow_port_in_use="true"
fi
preflight_frontend_env "$FRONTEND_ENV" "$allow_port_in_use"

if [[ -z "$frontend_image" ]]; then
  die "Missing --frontend-image"
fi

network_subnet="$(envfile_get "$FRONTEND_ENV" "DOCKER_NETWORK_SUBNET" || true)"
ensure_network "$NETWORK_NAME" "$network_subnet"

host_port="$(envfile_get "$FRONTEND_ENV" "FRONTEND_HOST_PORT" || true)"
container_port="$(envfile_get "$FRONTEND_ENV" "FRONTEND_CONTAINER_PORT" || true)"
if [[ -z "$container_port" ]]; then
  container_port="80"
fi

rm_container_if_exists "$FRONTEND_CONTAINER"

label_args=(
  --label "com.riskhub.managed_by=scripts/prod"
  --label "com.riskhub.role=frontend"
)
if [[ -n "$previous_image" ]]; then
  label_args+=(--label "com.riskhub.previous_image=${previous_image}")
fi

log "Installing frontend container: $FRONTEND_CONTAINER (host_port=$host_port container_port=$container_port)"
run docker run -d \
  --name "$FRONTEND_CONTAINER" \
  --restart unless-stopped \
  --security-opt no-new-privileges \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \
  "${label_args[@]}" \
  --network "$NETWORK_NAME" \
  -p "${host_port}:${container_port}" \
  "$frontend_image"

log "Frontend install: OK"
