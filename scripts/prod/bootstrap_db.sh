#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/prod/lib/preflight.sh
source "${SCRIPT_DIR}/lib/preflight.sh"

backend_image=""
bootstrap_email=""
bootstrap_role=""
bootstrap_scope=""
bootstrap_department=""

usage() {
  cat <<EOF
Usage: scripts/prod/bootstrap_db.sh --backend-env PATH --backend-image IMAGE [options]

Runs RBAC/departments seeding and bootstraps an initial admin/CRO user by email.

Options:
  --backend-env PATH         Path to backend.env
  --backend-image IMAGE      Backend image ref (e.g. riskhub-backend:1.0.0)
  --email EMAIL              Override BOOTSTRAP_ADMIN_EMAIL
  --role ROLE                Override BOOTSTRAP_ADMIN_ROLE (admin|cro)
  --access-scope SCOPE       Override BOOTSTRAP_ADMIN_ACCESS_SCOPE (global|department|manager)
  --department DEPT          Optional department code or name
  --dry-run                  Print commands without executing them
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
    --backend-image)
      backend_image="${2:-}"
      shift 2
      ;;
    --email)
      bootstrap_email="${2:-}"
      shift 2
      ;;
    --role)
      bootstrap_role="${2:-}"
      shift 2
      ;;
    --access-scope)
      bootstrap_scope="${2:-}"
      shift 2
      ;;
    --department)
      bootstrap_department="${2:-}"
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

if [[ -z "$backend_image" ]]; then
  die "Missing --backend-image"
fi

if [[ -z "$bootstrap_email" ]]; then
  bootstrap_email="$(envfile_get "$BACKEND_ENV" "BOOTSTRAP_ADMIN_EMAIL" || true)"
fi
if [[ -z "$bootstrap_role" ]]; then
  bootstrap_role="$(envfile_get "$BACKEND_ENV" "BOOTSTRAP_ADMIN_ROLE" || true)"
fi
if [[ -z "$bootstrap_scope" ]]; then
  bootstrap_scope="$(envfile_get "$BACKEND_ENV" "BOOTSTRAP_ADMIN_ACCESS_SCOPE" || true)"
fi

if [[ -z "$bootstrap_email" || -z "$bootstrap_role" || -z "$bootstrap_scope" ]]; then
  die "Missing bootstrap admin config (BOOTSTRAP_ADMIN_EMAIL/ROLE/ACCESS_SCOPE) in backend env or flags."
fi

confirm_or_die "Run DB bootstrap (RBAC + departments + initial admin) against external PostgreSQL?"

log "Seeding RBAC roles/permissions (canonical contract)..."
run docker run --rm --env-file "$BACKEND_ENV" "$backend_image" python scripts/seed_roles_permissions.py

log "Seeding departments..."
run docker run --rm --env-file "$BACKEND_ENV" "$backend_image" python scripts/seed_departments.py

log "Bootstrapping initial SSO user by email (idempotent upsert)..."
bootstrap_args=(python scripts/bootstrap_sso_user.py --email "$bootstrap_email" --role "$bootstrap_role" --access-scope "$bootstrap_scope")
if [[ -n "$bootstrap_department" ]]; then
  bootstrap_args+=(--department "$bootstrap_department")
fi
run docker run --rm --env-file "$BACKEND_ENV" "$backend_image" "${bootstrap_args[@]}"

log "DB bootstrap: OK"
