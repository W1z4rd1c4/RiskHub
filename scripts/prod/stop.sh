#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

remove=false

usage() {
  cat <<EOF
Usage: scripts/prod/stop.sh [options]

Stops Phase 500 containers. Does not remove volumes by default.

Options:
  --rm       Remove containers after stopping
  --dry-run  Print commands without executing
  --yes      Non-interactive confirmation
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
    --rm)
      remove=true
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

confirm_or_die "Stop Phase 500 containers?"

for c in "$FRONTEND_CONTAINER" "$BACKEND_CONTAINER" "$SCHEDULER_CONTAINER" "$REDIS_CONTAINER"; do
  if container_exists "$c"; then
    run docker stop "$c" >/dev/null
    log "Stopped: $c"
    if [[ "$remove" == "true" ]]; then
      run docker rm "$c" >/dev/null
      log "Removed: $c"
    fi
  fi
done

log "Stop: OK"
