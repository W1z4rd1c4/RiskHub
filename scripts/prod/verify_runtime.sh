#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

usage() {
  cat <<EOF
Usage: scripts/prod/verify_runtime.sh [options]

Read-only diagnostics for Phase 500 deployments.

Options:
  --verbose   More logging
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

log "Containers:"
run docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | grep -E "(${REDIS_CONTAINER}|${BACKEND_CONTAINER}|${SCHEDULER_CONTAINER}|${FRONTEND_CONTAINER})" || true

log "Network attachment (riskhub-network):"
run docker network inspect "$NETWORK_NAME" --format '{{json .Containers}}' || true

log "Images (current):"
for c in "$REDIS_CONTAINER" "$BACKEND_CONTAINER" "$SCHEDULER_CONTAINER" "$FRONTEND_CONTAINER"; do
  if container_exists "$c"; then
    img="$(container_image "$c")"
    prev="$(container_label "$c" "com.riskhub.previous_image")"
    log "  $c image=$img previous_image=${prev:-}"
  fi
done
