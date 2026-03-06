#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/prod/lib/preflight.sh
source "${SCRIPT_DIR}/lib/preflight.sh"

backend_image=""

usage() {
  cat <<EOF
Usage: scripts/prod/run_migrations.sh --backend-env PATH --backend-image IMAGE [options]

Runs Alembic migrations against the external PostgreSQL database (no DB container).

Options:
  --backend-env PATH     Path to backend.env
  --backend-image IMAGE  Backend image ref (e.g. riskhub-backend:1.0.0)
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
    --backend-image)
      backend_image="${2:-}"
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

if [[ -z "$backend_image" ]]; then
  die "Missing --backend-image"
fi
require_dir "$SECRET_DIR"
require_dir "$RUNTIME_DIR"

log "Migration reminder: DB rollbacks are forward-fix/backup-driven (no automatic downgrade)."
confirm_or_die "Run alembic migrations against external PostgreSQL?"

log "Running migrations: alembic upgrade head"
run docker run --rm \
  -v "${SECRET_DIR}:${SECRET_DIR}:ro" \
  -v "${RUNTIME_DIR}:${RUNTIME_DIR}:ro" \
  --env-file "$BACKEND_ENV" "$backend_image" alembic upgrade head
log "Migrations: OK"
