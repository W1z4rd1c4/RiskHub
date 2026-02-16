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
Usage: scripts/prod/deploy.sh --backend-env PATH --frontend-env PATH --tag TAG [options]

Builds images locally and deploys Phase 500 containers (external PostgreSQL + redis container).

Options:
  --backend-env PATH         Path to backend.env
  --frontend-env PATH        Path to frontend.env
  --tag TAG                  Image tag to build/deploy (e.g. 1.0.0)
  --workers N                Backend API worker count (default: 4)
  --publish-backend SPEC     Optional backend publish (API only), e.g. 127.0.0.1:8000:8000
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

confirm_or_die "Deploy RiskHub Phase 500 (build images, run migrations/bootstrap, replace containers)?"
# Avoid re-prompting in child scripts once deploy is confirmed.
YES=true

child_flags=()
if [[ "$DRY_RUN" == "true" ]]; then child_flags+=(--dry-run); fi
if [[ "$YES" == "true" ]]; then child_flags+=(--yes); fi
if [[ "$VERBOSE" == "true" ]]; then child_flags+=(--verbose); fi

common_args=(--backend-env "$BACKEND_ENV" --frontend-env "$FRONTEND_ENV")
if [[ "$DRY_RUN" == "true" ]]; then common_args+=(--dry-run); fi
if [[ "$YES" == "true" ]]; then common_args+=(--yes); fi
if [[ "$VERBOSE" == "true" ]]; then common_args+=(--verbose); fi

backend_image="riskhub-backend:${tag}"
frontend_image="riskhub-frontend:${tag}"

log "Preflight (basic)"
run "${SCRIPT_DIR}/preflight.sh" "${common_args[@]}"

log "Building backend image: $backend_image"
run docker build -t "$backend_image" "${REPO_ROOT}/backend"

if [[ "$check_db" == "true" ]]; then
  log "Preflight (DB check)"
  run "${SCRIPT_DIR}/preflight.sh" "${common_args[@]}" --backend-image "$backend_image" --check-db
fi

log "Installing redis (required)"
run "${SCRIPT_DIR}/install_redis.sh" --backend-env "$BACKEND_ENV" "${child_flags[@]}"

log "Running migrations"
run "${SCRIPT_DIR}/run_migrations.sh" --backend-env "$BACKEND_ENV" --backend-image "$backend_image" "${child_flags[@]}"

log "Bootstrapping DB (RBAC + departments + initial privileged users (admin + CRO))"
run "${SCRIPT_DIR}/bootstrap_db.sh" --backend-env "$BACKEND_ENV" --backend-image "$backend_image" "${child_flags[@]}"

backend_args=(--backend-env "$BACKEND_ENV" --backend-image "$backend_image" --instance api)
if [[ -n "$workers" ]]; then backend_args+=(--workers "$workers"); fi
if [[ -n "$publish_backend" ]]; then backend_args+=(--publish-backend "$publish_backend"); fi
if [[ "$DRY_RUN" == "true" ]]; then backend_args+=(--dry-run); fi
if [[ "$YES" == "true" ]]; then backend_args+=(--yes); fi
if [[ "$VERBOSE" == "true" ]]; then backend_args+=(--verbose); fi

log "Installing backend API"
run "${SCRIPT_DIR}/install_backend.sh" "${backend_args[@]}"

log "Installing backend scheduler (single worker)"
run "${SCRIPT_DIR}/install_backend.sh" --backend-env "$BACKEND_ENV" --backend-image "$backend_image" --instance scheduler "${child_flags[@]}"

log "Building frontend image: $frontend_image"
run docker build -t "$frontend_image" "${REPO_ROOT}/frontend"

log "Installing frontend"
run "${SCRIPT_DIR}/install_frontend.sh" --frontend-env "$FRONTEND_ENV" --frontend-image "$frontend_image" "${child_flags[@]}"

log "Smoke test"
run "${SCRIPT_DIR}/smoke_test.sh" --frontend-env "$FRONTEND_ENV" "${child_flags[@]}"

log "Deploy: OK"
