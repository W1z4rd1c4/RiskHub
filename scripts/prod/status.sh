#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

usage() {
  cat <<EOF
Usage: scripts/prod/status.sh

Shows container and image status for Phase 500.
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

printf '%s\n' "NAME	IMAGE	STATUS	HEALTH"
for c in "$REDIS_CONTAINER" "$BACKEND_CONTAINER" "$SCHEDULER_CONTAINER" "$FRONTEND_CONTAINER"; do
  if container_exists "$c"; then
    img="$(container_image "$c")"
    status="$(docker inspect --format '{{.State.Status}}' "$c" 2>/dev/null || true)"
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}' "$c" 2>/dev/null || true)"
    printf '%s\t%s\t%s\t%s\n' "$c" "$img" "$status" "$health"
  else
    printf '%s\t%s\t%s\t%s\n' "$c" "-" "missing" "-"
  fi
done
