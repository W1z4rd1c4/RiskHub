#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

service="all"
follow=false
tail_lines="200"

usage() {
  cat <<EOF
Usage: scripts/prod/logs.sh [options]

Options:
  --service all|redis|backend|scheduler|frontend   Which logs to show (default: all)
  --follow                                        Follow logs
  --tail N                                        Tail lines (default: $tail_lines)
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
    --service)
      service="${2:-}"
      shift 2
      ;;
    --follow)
      follow=true
      shift
      ;;
    --tail)
      tail_lines="${2:-}"
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

declare -a follow_args=()
if [[ "$follow" == "true" ]]; then
  follow_args=(-f)
fi

case "$service" in
  redis) target="$REDIS_CONTAINER" ;;
  backend) target="$BACKEND_CONTAINER" ;;
  scheduler) target="$SCHEDULER_CONTAINER" ;;
  frontend) target="$FRONTEND_CONTAINER" ;;
  all) target="" ;;
  *) die "Invalid --service (use --help)" ;;
esac

if [[ -n "$target" ]]; then
  if [[ ${#follow_args[@]} -gt 0 ]]; then
    exec docker logs "${follow_args[@]}" --tail "$tail_lines" "$target"
  fi
  exec docker logs --tail "$tail_lines" "$target"
fi

for c in "$REDIS_CONTAINER" "$BACKEND_CONTAINER" "$SCHEDULER_CONTAINER" "$FRONTEND_CONTAINER"; do
  if container_exists "$c"; then
    printf '\n== %s ==\n' "$c"
    docker logs --tail "$tail_lines" "$c" || true
  fi
done
