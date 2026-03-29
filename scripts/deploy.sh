#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"
# shellcheck source=scripts/deploy/lib/docker.sh
source "${SCRIPT_DIR}/deploy/lib/docker.sh"
# shellcheck source=scripts/deploy/lib/linux.sh
source "${SCRIPT_DIR}/deploy/lib/linux.sh"

command_name="${1:-}"
if [[ -n "$command_name" ]]; then
  shift
fi

requested_help=false
if [[ "$command_name" == "-h" || "$command_name" == "--help" || "$command_name" == "help" ]]; then
  command_name=""
  requested_help=true
fi

TARGET=""
CONFIG_PATH="$DEFAULT_CONFIG_PATH"
VERSION=""
BACKEND_IMAGE=""
BACKEND_DB_IMAGE=""
FRONTEND_IMAGE=""
REDIS_IMAGE=""
BUNDLE_PATH=""
SERVICE="all"
FOLLOW=false
TAIL_LINES="200"

usage() {
  cat <<EOF
Usage: ./scripts/deploy.sh <install|upgrade|doctor|logs|rollback> --target docker|linux [options]

Common options:
  --target docker|linux
  --config PATH               Non-secret config path (default: ${DEFAULT_CONFIG_PATH})
  --secret-dir PATH           Secret directory path (default: ${DEFAULT_SECRET_DIR})
  --dry-run
  --yes
  --verbose

Release options:
  --version VERSION           Docker release version (used to derive default GHCR image refs)
  --backend-image IMAGE       Explicit backend image ref for docker install/upgrade
  --backend-db-image IMAGE    Explicit backend DB-task image ref for docker install/upgrade
  --frontend-image IMAGE      Explicit frontend image ref for docker install/upgrade
  --redis-image IMAGE         Explicit redis image ref for docker install/upgrade
  --bundle PATH               Linux release bundle path for linux install/upgrade

Command-specific options:
  install        [--version VERSION|--backend-image IMAGE --backend-db-image IMAGE --frontend-image IMAGE --redis-image IMAGE|--bundle PATH]
  doctor         validates config, status, and runtime health for the selected target
  logs           [--service all|backend|scheduler|frontend|redis] [--tail N] [--follow]
  rollback       [--service all|backend|frontend]   (docker only)

Removed commands now fail with migration guidance:
  init, secrets-init, secrets-edit, secrets-check, preflight, deploy, status, smoke
EOF
}

[[ -n "$command_name" ]] || {
  usage
  if [[ "$requested_help" == "true" ]]; then
    exit 0
  fi
  die "Missing command"
}

removed_command_message() {
  local command="$1"
  case "$command" in
    init|deploy)
      printf "Command '%s' was removed. Manage config and secret files directly from the shipped templates, then run './scripts/deploy.sh install'.\n" "$command"
      ;;
    secrets-init|secrets-edit|secrets-check)
      printf "Command '%s' was removed. Manage '/etc/riskhub/riskhub.env' and '/etc/riskhub/secrets/*' directly, then run './scripts/deploy.sh doctor' to validate the deployment.\n" "$command"
      ;;
    preflight|status|smoke)
      printf "Command '%s' was removed. Use './scripts/deploy.sh doctor' for validation, status, and runtime health checks.\n" "$command"
      ;;
    *)
      printf "Command '%s' was removed from the public deployment interface.\n" "$command"
      ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --config)
      CONFIG_PATH="${2:-}"
      shift 2
      ;;
    --secret-dir)
      SECRET_DIR="${2:-}"
      shift 2
      ;;
    --version)
      VERSION="${2:-}"
      shift 2
      ;;
    --backend-image)
      BACKEND_IMAGE="${2:-}"
      shift 2
      ;;
    --backend-db-image)
      BACKEND_DB_IMAGE="${2:-}"
      shift 2
      ;;
    --frontend-image)
      FRONTEND_IMAGE="${2:-}"
      shift 2
      ;;
    --redis-image)
      REDIS_IMAGE="${2:-}"
      shift 2
      ;;
    --bundle)
      BUNDLE_PATH="${2:-}"
      shift 2
      ;;
    --service)
      SERVICE="${2:-}"
      shift 2
      ;;
    --follow)
      FOLLOW=true
      shift
      ;;
    --tail)
      TAIL_LINES="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --yes)
      YES=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      die "Unknown argument: $1"
      ;;
  esac
done

case "$command_name" in
  init|secrets-init|secrets-edit|secrets-check|preflight|deploy|status|smoke)
    die "$(removed_command_message "$command_name")"
    ;;
esac

[[ "$TARGET" == "docker" || "$TARGET" == "linux" ]] || die "--target must be docker or linux"

secret_editor_file() {
  local name="$1"
  local path
  path="$(secret_path "$name")"
  if [[ -f "$path" ]]; then
    cat "$path"
  else
    secret_placeholder "$name"
  fi
}

deploy_secrets_init() {
  local force="$1"
  ensure_secret_dir_scaffold
  local name path
  for name in database_url secret_key entra_client_secret entra_client_certificate_private_key redis_password; do
    path="$(secret_path "$name")"
    if [[ -e "$path" && "$force" != "true" ]]; then
      die "Secret file already exists: ${path} (use --force to overwrite)"
    fi
    write_secret_file "$name" "$(secret_placeholder "$name")"$'\n'
  done
  log "Wrote secret placeholders under: ${SECRET_DIR}"
}

deploy_init() {
  local config_path="$1"
  local force="$2"
  local example="${SCRIPT_DIR}/deploy/templates/riskhub.env.example"
  require_file "$example"
  if [[ -f "$config_path" && "$force" != "true" ]]; then
    die "Config already exists: ${config_path} (use --force to overwrite)"
  fi
  copy_file "$example" "$config_path" 600
  deploy_secrets_init "$force"
  ensure_runtime_dir_scaffold
  log "Wrote config template: ${config_path}"
}

secrets_edit() {
  local editor="${VISUAL:-${EDITOR:-}}"
  [[ -n "$editor" ]] || die "Set \$EDITOR or \$VISUAL before running secrets-edit"

  if [[ "$DRY_RUN" == "true" ]]; then
    local dry_run_file
    dry_run_file="$(secret_edit_parent_dir)/.riskhub-secrets-edit.XXXXXX/riskhub-secrets-edit.XXXXXX"
    printf '+ %s %q\n' "$editor" "$dry_run_file"
    return 0
  fi

  local edit_workspace=""
  local tmp_file=""
  trap 'cleanup_secret_edit_workspace "$edit_workspace"; trap - RETURN' RETURN

  edit_workspace="$(make_secret_edit_workspace)"
  tmp_file="$(mktemp "${edit_workspace}/riskhub-secrets-edit.XXXXXX")"
  chmod 600 "$tmp_file"

  cat >"$tmp_file" <<EOF
DATABASE_URL=$(secret_editor_file database_url)
SECRET_KEY=$(secret_editor_file secret_key)
ENTRA_CLIENT_SECRET=$(secret_editor_file entra_client_secret)
REDIS_PASSWORD=$(secret_editor_file redis_password)
EOF

  bash -lc "$editor \"\$1\"" _ "$tmp_file"

  local database_url secret_key entra_client_secret redis_password
  database_url="$(grep -E '^DATABASE_URL=' "$tmp_file" | tail -n 1 | cut -d= -f2- || true)"
  secret_key="$(grep -E '^SECRET_KEY=' "$tmp_file" | tail -n 1 | cut -d= -f2- || true)"
  entra_client_secret="$(grep -E '^ENTRA_CLIENT_SECRET=' "$tmp_file" | tail -n 1 | cut -d= -f2- || true)"
  redis_password="$(grep -E '^REDIS_PASSWORD=' "$tmp_file" | tail -n 1 | cut -d= -f2- || true)"

  [[ -n "$database_url" ]] || die "DATABASE_URL is required in secrets-edit"
  [[ -n "$secret_key" ]] || die "SECRET_KEY is required in secrets-edit"
  [[ -n "$entra_client_secret" ]] || die "ENTRA_CLIENT_SECRET is required in secrets-edit"
  [[ -n "$redis_password" ]] || die "REDIS_PASSWORD is required in secrets-edit"

  write_secret_file database_url "${database_url}"$'\n'
  write_secret_file secret_key "${secret_key}"$'\n'
  write_secret_file entra_client_secret "${entra_client_secret}"$'\n'
  write_secret_file redis_password "${redis_password}"$'\n'
  log "Updated secret files under: ${SECRET_DIR}"
}

check_secret_file_mode() {
  local path="$1"
  python3 - <<'PY' "$path"
import stat
import sys
from pathlib import Path

target = Path(sys.argv[1])
mode = stat.S_IMODE(target.stat().st_mode)
if mode & 0o007:
    raise SystemExit("world access is not allowed")
if mode & 0o222:
    raise SystemExit("secret files must not be writable at rest")
PY
}

check_secret_dir_mode() {
  local path="$1"
  python3 - <<'PY' "$path"
import stat
import sys
from pathlib import Path

target = Path(sys.argv[1])
mode = stat.S_IMODE(target.stat().st_mode)
if mode & 0o007:
    raise SystemExit("world access is not allowed")
if mode & 0o022:
    raise SystemExit("secret directory must not be group/world writable")
PY
}

warn_if_secret_ownership_is_not_root_riskhub() {
  local path="$1"
  local stat_json
  stat_json="$(path_stat_json "$path")"
  local uid gid
  uid="$(python3 - <<'PY' "$stat_json"
import json
import sys
print(json.loads(sys.argv[1])["uid"])
PY
)"
  gid="$(python3 - <<'PY' "$stat_json"
import json
import sys
print(json.loads(sys.argv[1])["gid"])
PY
)"
  if [[ "$uid" != "0" || "$gid" != "$LINUX_GID" ]]; then
    warn "Secret path ${path} is not owned by root:${LINUX_GROUP} (${uid}:${gid}). This is acceptable in local tests, but production should use root:${LINUX_GROUP}."
  fi
}

secrets_check() {
  [[ -d "$SECRET_DIR" ]] || die "Missing secret directory: ${SECRET_DIR}"
  check_secret_dir_mode "$SECRET_DIR" || die "Secret directory permissions are too open: ${SECRET_DIR}"
  warn_if_secret_ownership_is_not_root_riskhub "$SECRET_DIR"

  local database_url_path secret_key_path entra_client_secret_path entra_client_certificate_private_key_path redis_password_path
  database_url_path="$(secret_path database_url)"
  secret_key_path="$(secret_path secret_key)"
  entra_client_secret_path="$(secret_path entra_client_secret)"
  entra_client_certificate_private_key_path="$(secret_path entra_client_certificate_private_key)"
  redis_password_path="$(secret_path redis_password)"

  local path
  for path in "$database_url_path" "$secret_key_path" "$redis_password_path"; do
    require_file "$path"
    check_secret_file_mode "$path" || die "Secret file permissions are too open: ${path}"
    warn_if_secret_ownership_is_not_root_riskhub "$path"
  done
  if [[ -f "$entra_client_secret_path" ]]; then
    check_secret_file_mode "$entra_client_secret_path" || die "Secret file permissions are too open: ${entra_client_secret_path}"
    warn_if_secret_ownership_is_not_root_riskhub "$entra_client_secret_path"
  fi
  if [[ -f "$entra_client_certificate_private_key_path" ]]; then
    check_secret_file_mode "$entra_client_certificate_private_key_path" || die "Secret file permissions are too open: ${entra_client_certificate_private_key_path}"
    warn_if_secret_ownership_is_not_root_riskhub "$entra_client_certificate_private_key_path"
  fi

  local database_url secret_key redis_password
  database_url="$(cat "$database_url_path")"
  secret_key="$(cat "$secret_key_path")"
  redis_password="$(cat "$redis_password_path")"

  [[ "${database_url%$'\n'}" != "$(secret_placeholder database_url)" ]] || die "database_url still contains the placeholder value"
  [[ "${secret_key%$'\n'}" != "$(secret_placeholder secret_key)" ]] || die "secret_key still contains the placeholder value"
  [[ "${redis_password%$'\n'}" != "$(secret_placeholder redis_password)" ]] || die "redis_password still contains the placeholder value"

  database_url="${database_url%$'\n'}"
  [[ "$database_url" != "postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub" ]] || die "database_url must not use the default placeholder URL"
  if [[ "$database_url" == *"@db:"* ]]; then
    die "database_url must not target docker-compose hostname 'db'"
  fi
  [[ ${#secret_key} -ge 32 ]] || die "secret_key must be at least 32 characters long"
  [[ -n "${redis_password%$'\n'}" ]] || die "redis_password must not be empty"
}

case "$command_name" in
  install)
    require_file "$CONFIG_PATH"
    secrets_check
    if [[ "$TARGET" == "docker" ]]; then
      docker_deploy_or_upgrade "deploy" "$CONFIG_PATH" "$VERSION" "$BACKEND_IMAGE" "$BACKEND_DB_IMAGE" "$FRONTEND_IMAGE" "$REDIS_IMAGE"
    else
      [[ -n "$BUNDLE_PATH" ]] || die "--bundle is required for linux install"
      linux_deploy_or_upgrade "deploy" "$CONFIG_PATH" "$BUNDLE_PATH"
    fi
    ;;
  upgrade)
    require_file "$CONFIG_PATH"
    secrets_check
    if [[ "$TARGET" == "docker" ]]; then
      docker_deploy_or_upgrade "upgrade" "$CONFIG_PATH" "$VERSION" "$BACKEND_IMAGE" "$BACKEND_DB_IMAGE" "$FRONTEND_IMAGE" "$REDIS_IMAGE"
    else
      [[ -n "$BUNDLE_PATH" ]] || die "--bundle is required for linux upgrade"
      linux_deploy_or_upgrade "upgrade" "$CONFIG_PATH" "$BUNDLE_PATH"
    fi
    ;;
  doctor)
    require_file "$CONFIG_PATH"
    secrets_check
    if [[ "$TARGET" == "docker" ]]; then
      docker_preflight "$CONFIG_PATH" "true"
      docker_status
      docker_smoke "$CONFIG_PATH"
    else
      linux_preflight "$CONFIG_PATH" "true"
      linux_status
      linux_smoke "$CONFIG_PATH"
    fi
    ;;
  logs)
    if [[ "$TARGET" == "docker" ]]; then
      docker_logs "$SERVICE" "$FOLLOW" "$TAIL_LINES"
    else
      linux_logs "$SERVICE" "$FOLLOW" "$TAIL_LINES"
    fi
    ;;
  rollback)
    require_file "$CONFIG_PATH"
    secrets_check
    if [[ "$TARGET" == "docker" ]]; then
      docker_rollback "$CONFIG_PATH" "$SERVICE"
    else
      linux_rollback "$CONFIG_PATH"
    fi
    ;;
  *)
    usage
    die "Unknown command: ${command_name}"
    ;;
esac
