#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../../.." && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${REPO_ROOT}/scripts/prod/lib/common.sh"
# shellcheck source=scripts/prod/lib/preflight.sh
source "${REPO_ROOT}/scripts/prod/lib/preflight.sh"

DEFAULT_BACKEND_ENV="${RUNTIME_DIR}/backend.env"

backend_db_image=""
backend_image_alias=""
tag=""

usage() {
  cat <<EOF_USAGE
Usage: backend/scripts/runtime/db/prod.sh [options]

Runs production DB lifecycle update (external PostgreSQL):
- preflight backend env + DB connectivity check
- alembic migrations
- DB bootstrap (RBAC/departments/bootstrap users)

Options:
  --backend-env PATH   Default: ${DEFAULT_BACKEND_ENV}
  --backend-db-image IMG
                       Existing backend DB image to use for DB tasks
  --backend-image IMG  Compatibility alias for --backend-db-image
  --tag TAG            If backend image is omitted, build riskhub-backend-db:TAG
  --dry-run            Print actions only
  --yes                Non-interactive confirmation
  --verbose            More logging
  -h, --help           Show help
EOF_USAGE
}

parse_common_flags "$@"
if [[ ${#REMAINING_ARGS[@]} -gt 0 ]]; then
  set -- "${REMAINING_ARGS[@]}"
else
  set --
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-db-image)
      backend_db_image="${2:-}"
      shift 2
      ;;
    --backend-image)
      backend_image_alias="${2:-}"
      shift 2
      ;;
    --tag)
      tag="${2:-}"
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

if [[ -z "$BACKEND_ENV" ]]; then
  BACKEND_ENV="${DEFAULT_BACKEND_ENV}"
fi

if [[ -n "$backend_db_image" && -n "$backend_image_alias" && "$backend_db_image" != "$backend_image_alias" ]]; then
  die "--backend-db-image and --backend-image must match when both are provided"
fi
if [[ -z "$backend_db_image" ]]; then
  backend_db_image="$backend_image_alias"
fi

if [[ -z "$backend_db_image" && -z "$tag" ]]; then
  die "Provide --backend-db-image, or provide --tag so the script can build an image."
fi

docker_require_running
preflight_backend_env "$BACKEND_ENV"

if [[ -z "$backend_db_image" ]]; then
  backend_db_image="riskhub-backend-db:${tag}"
  log "Building backend DB image for DB lifecycle: ${backend_db_image}"
  run docker build --target dbtasks -t "$backend_db_image" "${REPO_ROOT}/backend"
fi

log "Preflight DB connectivity check"
preflight_check_db_connectivity "$BACKEND_ENV" "$backend_db_image"

child_flags=()
if [[ "$DRY_RUN" == "true" ]]; then child_flags+=(--dry-run); fi
if [[ "$YES" == "true" ]]; then child_flags+=(--yes); fi
if [[ "$VERBOSE" == "true" ]]; then child_flags+=(--verbose); fi

migration_args=(--backend-env "$BACKEND_ENV" --backend-db-image "$backend_db_image")
bootstrap_args=(--backend-env "$BACKEND_ENV" --backend-db-image "$backend_db_image")
if [[ ${#child_flags[@]} -gt 0 ]]; then
  migration_args+=("${child_flags[@]}")
  bootstrap_args+=("${child_flags[@]}")
fi

log "Running production migrations"
run "${REPO_ROOT}/scripts/prod/run_migrations.sh" "${migration_args[@]}"

log "Running production DB bootstrap"
run "${REPO_ROOT}/scripts/prod/bootstrap_db.sh" "${bootstrap_args[@]}"

log "DB prod lifecycle: OK"
