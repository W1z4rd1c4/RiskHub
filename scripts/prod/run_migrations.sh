#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/prod/lib/preflight.sh
source "${SCRIPT_DIR}/lib/preflight.sh"

backend_db_image=""
backend_image_alias=""

usage() {
  cat <<EOF
Usage: scripts/prod/run_migrations.sh --backend-env PATH --backend-db-image IMAGE [options]

Runs Alembic migrations against the external PostgreSQL database (no DB container).

Options:
  --backend-env PATH     Path to backend.env
  --backend-db-image IMAGE
                        Preferred backend DB image ref (e.g. riskhub-backend-db:1.0.0)
  --backend-image IMAGE  Compatibility alias for --backend-db-image
  --dry-run              Print commands without executing
  --yes                  Required for non-interactive production runs
  --verbose              More logging
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
    --backend-db-image)
      backend_db_image="${2:-}"
      shift 2
      ;;
    --backend-image)
      backend_image_alias="${2:-}"
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

if [[ -z "$BACKEND_ENV" ]]; then
  die "Missing --backend-env"
fi
preflight_backend_env "$BACKEND_ENV"
if [[ "$DRY_RUN" != "true" ]]; then
  require_file "$(envfile_get "$BACKEND_ENV" "REDIS_URL_FILE")"
fi

if [[ -n "$backend_db_image" && -n "$backend_image_alias" && "$backend_db_image" != "$backend_image_alias" ]]; then
  die "--backend-db-image and --backend-image must match when both are provided"
fi
if [[ -z "$backend_db_image" ]]; then
  backend_db_image="$backend_image_alias"
fi

if [[ -z "$backend_db_image" ]]; then
  die "Missing --backend-db-image"
fi
require_dir "$SECRET_DIR"
require_dir "$RUNTIME_DIR"

log "Migration reminder: DB rollbacks are forward-fix/backup-driven (no automatic downgrade)."
confirm_or_die "Run alembic migrations against external PostgreSQL?"

log "Running migrations: alembic upgrade head"
run docker run --rm \
  -v "${SECRET_DIR}:${SECRET_DIR}:ro" \
  -v "${RUNTIME_DIR}:${RUNTIME_DIR}:ro" \
  --env-file "$BACKEND_ENV" "$backend_db_image" alembic upgrade head
log "Migrations: OK"
