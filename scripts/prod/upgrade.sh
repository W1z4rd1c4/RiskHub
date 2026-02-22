#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

tag=""
workers=""
publish_backend=""
check_db=true

usage() {
  cat <<EOF
Usage: scripts/prod/upgrade.sh --backend-env PATH --frontend-env PATH --tag TAG [options]

Builds new images locally, runs migrations/bootstrap, and replaces containers.
Records previous image refs via docker labels for rollback.

Options:
  --backend-env PATH         Path to backend.env
  --frontend-env PATH        Path to frontend.env
  --tag TAG                  New image tag to build/deploy
  --workers N                Backend API worker count (default: 4)
  --publish-backend SPEC     Optional backend publish (API only)
  --no-check-db              Skip DB connectivity check (not recommended)
  --dry-run                  Print commands without executing
  --yes                      Non-interactive confirmation
  --verbose                  More logging
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
    --tag)
      tag="${2:-}"
      shift 2
      ;;
    --workers)
      workers="${2:-}"
      shift 2
      ;;
    --publish-backend)
      publish_backend="${2:-}"
      shift 2
      ;;
    --no-check-db)
      check_db=false
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

if [[ -z "$BACKEND_ENV" ]]; then
  die "Missing --backend-env"
fi
if [[ -z "$FRONTEND_ENV" ]]; then
  die "Missing --frontend-env"
fi
if [[ -z "$tag" ]]; then
  die "Missing --tag"
fi

docker_require_running

if ! container_exists "$BACKEND_CONTAINER"; then
  die "Backend container not found: $BACKEND_CONTAINER (use deploy.sh for first install)"
fi
if ! container_exists "$SCHEDULER_CONTAINER"; then
  die "Scheduler container not found: $SCHEDULER_CONTAINER (use deploy.sh for first install)"
fi
if ! container_exists "$FRONTEND_CONTAINER"; then
  die "Frontend container not found: $FRONTEND_CONTAINER (use deploy.sh for first install)"
fi

confirm_or_die "Upgrade RiskHub Phase 500 (build images, run migrations/bootstrap, replace containers)?"
YES=true

child_flags=()
if [[ "$DRY_RUN" == "true" ]]; then child_flags+=(--dry-run); fi
if [[ "$YES" == "true" ]]; then child_flags+=(--yes); fi
if [[ "$VERBOSE" == "true" ]]; then child_flags+=(--verbose); fi

prev_backend_image="$(container_image "$BACKEND_CONTAINER")"
prev_scheduler_image="$(container_image "$SCHEDULER_CONTAINER")"
prev_frontend_image="$(container_image "$FRONTEND_CONTAINER")"

backend_image="riskhub-backend:${tag}"
frontend_image="riskhub-frontend:${tag}"

common_args=(--backend-env "$BACKEND_ENV" --frontend-env "$FRONTEND_ENV")
if [[ "$DRY_RUN" == "true" ]]; then common_args+=(--dry-run); fi
if [[ "$YES" == "true" ]]; then common_args+=(--yes); fi
if [[ "$VERBOSE" == "true" ]]; then common_args+=(--verbose); fi

log "Preflight (basic)"
run "${SCRIPT_DIR}/preflight.sh" "${common_args[@]}" --allow-frontend-port-in-use

log "Building backend image: $backend_image"
run docker build -t "$backend_image" "${REPO_ROOT}/backend"

if [[ "$check_db" == "true" ]]; then
  log "Preflight (DB check)"
  run "${SCRIPT_DIR}/preflight.sh" "${common_args[@]}" --allow-frontend-port-in-use --backend-image "$backend_image" --check-db
fi

log "Ensuring redis container"
run "${SCRIPT_DIR}/install_redis.sh" --backend-env "$BACKEND_ENV" "${child_flags[@]}"

log "Running migrations"
run "${SCRIPT_DIR}/run_migrations.sh" --backend-env "$BACKEND_ENV" --backend-image "$backend_image" "${child_flags[@]}"

log "Bootstrapping DB (RBAC + departments + initial privileged users (admin + CRO))"
run "${SCRIPT_DIR}/bootstrap_db.sh" --backend-env "$BACKEND_ENV" --backend-image "$backend_image" "${child_flags[@]}"

backend_args=(--backend-env "$BACKEND_ENV" --backend-image "$backend_image" --instance api --previous-image "$prev_backend_image")
if [[ -n "$workers" ]]; then backend_args+=(--workers "$workers"); fi
if [[ -n "$publish_backend" ]]; then backend_args+=(--publish-backend "$publish_backend"); fi
if [[ "$DRY_RUN" == "true" ]]; then backend_args+=(--dry-run); fi
if [[ "$YES" == "true" ]]; then backend_args+=(--yes); fi
if [[ "$VERBOSE" == "true" ]]; then backend_args+=(--verbose); fi

log "Upgrading backend API"
run "${SCRIPT_DIR}/install_backend.sh" "${backend_args[@]}"

log "Upgrading backend scheduler"
run "${SCRIPT_DIR}/install_backend.sh" --backend-env "$BACKEND_ENV" --backend-image "$backend_image" --instance scheduler --previous-image "$prev_scheduler_image" "${child_flags[@]}"

log "Building frontend image: $frontend_image"
run docker build -t "$frontend_image" "${REPO_ROOT}/frontend"

log "Upgrading frontend"
run "${SCRIPT_DIR}/install_frontend.sh" --frontend-env "$FRONTEND_ENV" --frontend-image "$frontend_image" --previous-image "$prev_frontend_image" "${child_flags[@]}"

log "Smoke test"
run "${SCRIPT_DIR}/smoke_test.sh" --frontend-env "$FRONTEND_ENV" --backend-env "$BACKEND_ENV" "${child_flags[@]}"

log "Upgrade: OK"
