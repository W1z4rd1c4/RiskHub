#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

ack=false
service="all" # all|backend|frontend

usage() {
  cat <<EOF
Usage: scripts/prod/rollback.sh --i-understand-db-wont-downgrade [options]

Rolls back containers only using the com.riskhub.previous_image labels.
Does NOT downgrade the database. Use forward-fix migrations + backups/PITR.

Options:
  --service all|backend|frontend   What to rollback (default: all)
  --i-understand-db-wont-downgrade Required acknowledgement
  --dry-run                        Print commands without executing
  --yes                            Non-interactive confirmation
  --verbose                        More logging
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
    --i-understand-db-wont-downgrade)
      ack=true
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

if [[ "$ack" != "true" ]]; then
  die "Refusing to rollback without --i-understand-db-wont-downgrade"
fi

if [[ "$service" != "all" && "$service" != "backend" && "$service" != "frontend" ]]; then
  die "Invalid --service (expected all|backend|frontend)"
fi

docker_require_running

confirm_or_die "Rollback containers to their recorded previous images? (DB will NOT be downgraded)"
child_flags=(--yes)
if [[ "$DRY_RUN" == "true" ]]; then child_flags+=(--dry-run); fi
if [[ "$VERBOSE" == "true" ]]; then child_flags+=(--verbose); fi

rollback_backend() {
  local curr prev

  if container_exists "$BACKEND_CONTAINER"; then
    curr="$(container_image "$BACKEND_CONTAINER")"
    prev="$(container_label "$BACKEND_CONTAINER" "com.riskhub.previous_image")"
    if [[ -z "$prev" ]]; then
      die "No previous image recorded for $BACKEND_CONTAINER"
    fi
    run "${SCRIPT_DIR}/install_backend.sh" --backend-env "$BACKEND_ENV" --backend-image "$prev" --instance api --previous-image "$curr" "${child_flags[@]}"
  fi

  if container_exists "$SCHEDULER_CONTAINER"; then
    curr="$(container_image "$SCHEDULER_CONTAINER")"
    prev="$(container_label "$SCHEDULER_CONTAINER" "com.riskhub.previous_image")"
    if [[ -z "$prev" ]]; then
      die "No previous image recorded for $SCHEDULER_CONTAINER"
    fi
    run "${SCRIPT_DIR}/install_backend.sh" --backend-env "$BACKEND_ENV" --backend-image "$prev" --instance scheduler --previous-image "$curr" "${child_flags[@]}"
  fi
}

rollback_frontend() {
  local curr prev
  if ! container_exists "$FRONTEND_CONTAINER"; then
    die "Frontend container not found: $FRONTEND_CONTAINER"
  fi
  curr="$(container_image "$FRONTEND_CONTAINER")"
  prev="$(container_label "$FRONTEND_CONTAINER" "com.riskhub.previous_image")"
  if [[ -z "$prev" ]]; then
    die "No previous image recorded for $FRONTEND_CONTAINER"
  fi
  run "${SCRIPT_DIR}/install_frontend.sh" --frontend-env "$FRONTEND_ENV" --frontend-image "$prev" --previous-image "$curr" "${child_flags[@]}"
}

if [[ -z "$BACKEND_ENV" && ( "$service" == "all" || "$service" == "backend" ) ]]; then
  die "Missing --backend-env for backend rollback"
fi
if [[ -z "$FRONTEND_ENV" && ( "$service" == "all" || "$service" == "frontend" ) ]]; then
  die "Missing --frontend-env for frontend rollback"
fi

if [[ "$service" == "all" || "$service" == "backend" ]]; then
  rollback_backend
fi
if [[ "$service" == "all" || "$service" == "frontend" ]]; then
  rollback_frontend
fi

log "Rollback: OK (containers only; DB untouched)"
