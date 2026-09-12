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
FORCE=false
SERVICE="all"
FOLLOW=false
TAIL_LINES="200"
IDENTITY_CHOICE=""
MFA_POLICY=""
DEEP=false

usage() {
  cat <<EOF
Usage: ./scripts/deploy.sh <init|secrets-init|secrets-edit|secrets-check|preflight|deploy|upgrade|status|diagnose|logs|smoke|rollback> --target docker|linux [options]

Guided public installer:
  ./scripts/install.sh production --target docker|linux
  ./scripts/install.sh upgrade --target docker|linux
  ./scripts/install.sh status --mode production --target docker|linux
  ./scripts/install.sh logs --mode production --target docker|linux
  ./scripts/install.sh doctor --mode production --target docker|linux

Common options:
  --target docker|linux
  --config PATH               Non-secret config path (default: ${DEFAULT_CONFIG_PATH})
  --secret-dir PATH           Secret directory path (default: ${DEFAULT_SECRET_DIR})
  --user-management entra|custom  Initial configuration choice; existing profiles cannot be switched
  --mfa-policy required|optional  Native policy for initial configuration (default: required)
  --dry-run
  --yes
  --verbose

Release options:
  --version VERSION           Reserved for digest-manifest based Docker releases
  --backend-image IMAGE       Immutable backend image ref for docker deploy/upgrade
  --backend-db-image IMAGE    Immutable backend DB-task image ref for docker deploy/upgrade
  --frontend-image IMAGE      Immutable frontend image ref for docker deploy/upgrade
  --redis-image IMAGE         Immutable redis image ref for docker deploy/upgrade
  --bundle PATH               Linux release bundle path for linux deploy/upgrade

Command-specific options:
  init           [--force]
  diagnose       [--deep] (read-only JSON; deep probes SMTP without sending mail)
  secrets-init   [--force]
  logs           [--service all|backend|scheduler|frontend|redis] [--tail N] [--follow]
  rollback       [--service all|backend|frontend]   (docker only)
EOF
}

[[ -n "$command_name" ]] || {
  usage
  if [[ "$requested_help" == "true" ]]; then
    exit 0
  fi
  die "Missing command"
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
    --user-management)
      IDENTITY_CHOICE="${2:-}"
      shift 2
      ;;
    --mfa-policy)
      MFA_POLICY="${2:-}"
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
    --force)
      FORCE=true
      shift
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
    --deep)
      DEEP=true
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

[[ "$TARGET" == "docker" || "$TARGET" == "linux" ]] || die "--target must be docker or linux"
if [[ ! -f "$CONFIG_PATH" && -f "$LINUX_BACKEND_ENV" && ( "$command_name" == "init" || "$command_name" == "secrets-init" ) ]]; then
  die "Installed runtime exists but operator config is missing; restore recorded configuration before initialization"
fi
if [[ -f "$CONFIG_PATH" ]]; then
  existing_choice="$(python3 "$RENDERER" identity-choice --config "$CONFIG_PATH")"
  [[ -z "$IDENTITY_CHOICE" || "$IDENTITY_CHOICE" == "$existing_choice" ]] || die "--user-management conflicts with installed config; identity switching is unsupported"
  IDENTITY_CHOICE="$existing_choice"
fi
IDENTITY_CHOICE="${IDENTITY_CHOICE:-entra}"
[[ "$IDENTITY_CHOICE" == "entra" || "$IDENTITY_CHOICE" == "custom" ]] || die "--user-management must be entra or custom"
[[ -z "$MFA_POLICY" || "$IDENTITY_CHOICE" == "custom" ]] || die "--mfa-policy applies only to custom identity"
[[ -z "$MFA_POLICY" || "$command_name" == "init" ]] || die "--mfa-policy configures init only; edit the recorded LOCAL_MFA_POLICY for an existing installation"
MFA_POLICY="${MFA_POLICY:-required}"
[[ "$MFA_POLICY" == "required" || "$MFA_POLICY" == "optional" ]] || die "--mfa-policy must be required or optional"

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
  local names=(database_url secret_key redis_password)
  if [[ "$IDENTITY_CHOICE" == "entra" ]]; then
    names+=(entra_client_secret entra_client_certificate_private_key)
  fi
  for name in "${names[@]}"; do
    path="$(secret_path "$name")"
    if [[ -e "$path" && "$force" != "true" ]]; then
      continue
    fi
    write_secret_file "$name" "$(secret_placeholder "$name")"$'\n'
  done
  if [[ "$IDENTITY_CHOICE" == "custom" ]]; then
    local new_native_files=()
    for name in local_auth_keyring local_recovery_approvers local_smtp_password; do
      path="$(secret_path "$name")"
      [[ ! -L "$path" ]] || die "Native security scaffold refuses symlinks; reconcile the protected file"
      if [[ ! -e "$path" ]]; then
        new_native_files+=("$name")
      else
        [[ -f "$path" ]] || die "Native security scaffold requires regular files"
      fi
    done
    if should_use_privileged_ownership "$SECRET_DIR"; then
      run_privileged python3 "$RENDERER" init-local-secrets --secret-dir "$SECRET_DIR"
    else
      run python3 "$RENDERER" init-local-secrets --secret-dir "$SECRET_DIR"
    fi
    for name in ${new_native_files[@]+"${new_native_files[@]}"}; do
      path="$(secret_path "$name")"
      if should_use_privileged_ownership "$path"; then
        ensure_linux_user
        run_privileged chown "${LINUX_USER}:${LINUX_GROUP}" "$path"
        run_privileged chmod 400 "$path"
      else
        run chmod 400 "$path"
      fi
    done
  fi
  log "Wrote secret placeholders under: ${SECRET_DIR}"
}

deploy_init() {
  local config_path="$1"
  local force="$2"
  local example="${SCRIPT_DIR}/deploy/templates/riskhub.env.example"
  if [[ "$IDENTITY_CHOICE" == "custom" ]]; then
    example="${SCRIPT_DIR}/deploy/templates/riskhub-native.env.example"
  fi
  require_file "$example"
  if [[ -f "$config_path" && "$force" != "true" ]]; then
    die "Config already exists: ${config_path} (use --force to overwrite)"
  fi
  copy_file "$example" "$config_path" 600
  if [[ "$IDENTITY_CHOICE" == "custom" ]]; then
    run python3 -c 'from pathlib import Path; import sys; p=Path(sys.argv[1]); p.write_text(p.read_text().replace("LOCAL_MFA_POLICY=required", "LOCAL_MFA_POLICY=" + sys.argv[2]))' "$config_path" "$MFA_POLICY"
  fi
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
REDIS_PASSWORD=$(secret_editor_file redis_password)
EOF
  if [[ "$IDENTITY_CHOICE" == "entra" ]]; then
    printf 'ENTRA_CLIENT_SECRET=%s\n' "$(secret_editor_file entra_client_secret)" >>"$tmp_file"
  fi

  bash -lc "$editor \"\$1\"" _ "$tmp_file"

  local database_url secret_key entra_client_secret redis_password
  database_url="$(grep -E '^DATABASE_URL=' "$tmp_file" | tail -n 1 | cut -d= -f2- || true)"
  secret_key="$(grep -E '^SECRET_KEY=' "$tmp_file" | tail -n 1 | cut -d= -f2- || true)"
  entra_client_secret="$(grep -E '^ENTRA_CLIENT_SECRET=' "$tmp_file" | tail -n 1 | cut -d= -f2- || true)"
  redis_password="$(grep -E '^REDIS_PASSWORD=' "$tmp_file" | tail -n 1 | cut -d= -f2- || true)"

  [[ -n "$database_url" ]] || die "DATABASE_URL is required in secrets-edit"
  [[ -n "$secret_key" ]] || die "SECRET_KEY is required in secrets-edit"
  [[ "$IDENTITY_CHOICE" == "custom" || -n "$entra_client_secret" ]] || die "ENTRA_CLIENT_SECRET is required in secrets-edit"
  [[ -n "$redis_password" ]] || die "REDIS_PASSWORD is required in secrets-edit"

  write_secret_file database_url "${database_url}"$'\n'
  write_secret_file secret_key "${secret_key}"$'\n'
  if [[ "$IDENTITY_CHOICE" == "entra" ]]; then
    write_secret_file entra_client_secret "${entra_client_secret}"$'\n'
  fi
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
  if [[ "$IDENTITY_CHOICE" == "entra" && -f "$entra_client_secret_path" ]]; then
    check_secret_file_mode "$entra_client_secret_path" || die "Secret file permissions are too open: ${entra_client_secret_path}"
    warn_if_secret_ownership_is_not_root_riskhub "$entra_client_secret_path"
  fi
  if [[ "$IDENTITY_CHOICE" == "entra" && -f "$entra_client_certificate_private_key_path" ]]; then
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
  if [[ "$IDENTITY_CHOICE" == "custom" ]]; then
    python3 "$RENDERER" show-json --config "$CONFIG_PATH" --target "$TARGET" --secret-dir "$SECRET_DIR" --runtime-dir "$RUNTIME_DIR" >/dev/null
  fi
}

case "$command_name" in
  init)
    deploy_init "$CONFIG_PATH" "$FORCE"
    ;;
  secrets-init)
    deploy_secrets_init "$FORCE"
    ;;
  secrets-edit)
    secrets_edit
    ;;
  secrets-check)
    secrets_check
    ;;
  preflight)
    require_file "$CONFIG_PATH"
    secrets_check
    if [[ "$TARGET" == "docker" ]]; then
      docker_preflight "$CONFIG_PATH" "false"
    else
      linux_preflight "$CONFIG_PATH" "false"
    fi
    ;;
  deploy)
    require_file "$CONFIG_PATH"
    python3 "$RENDERER" validate-transition --config "$CONFIG_PATH" --installed "$LINUX_BACKEND_ENV"
    python3 "$RENDERER" admit-release --config "$CONFIG_PATH"
    secrets_check
    if [[ "$TARGET" == "docker" ]]; then
      docker_deploy_or_upgrade "deploy" "$CONFIG_PATH" "$VERSION" "$BACKEND_IMAGE" "$BACKEND_DB_IMAGE" "$FRONTEND_IMAGE" "$REDIS_IMAGE"
    else
      [[ -n "$BUNDLE_PATH" ]] || die "--bundle is required for linux deploy"
      linux_deploy_or_upgrade "deploy" "$CONFIG_PATH" "$BUNDLE_PATH"
    fi
    ;;
  upgrade)
    require_file "$CONFIG_PATH"
    python3 "$RENDERER" validate-transition --config "$CONFIG_PATH" --installed "$LINUX_BACKEND_ENV"
    python3 "$RENDERER" admit-release --config "$CONFIG_PATH"
    secrets_check
    if [[ "$TARGET" == "docker" ]]; then
      docker_deploy_or_upgrade "upgrade" "$CONFIG_PATH" "$VERSION" "$BACKEND_IMAGE" "$BACKEND_DB_IMAGE" "$FRONTEND_IMAGE" "$REDIS_IMAGE"
    else
      [[ -n "$BUNDLE_PATH" ]] || die "--bundle is required for linux upgrade"
      linux_deploy_or_upgrade "upgrade" "$CONFIG_PATH" "$BUNDLE_PATH"
    fi
    ;;
  status)
    if [[ "$TARGET" == "docker" ]]; then
      docker_status
    else
      linux_status
    fi
    ;;
  diagnose)
    probe_args=()
    probe_flag=""
    [[ "$DEEP" != "true" ]] || probe_args+=(--probe-mail)
    [[ "$DEEP" != "true" ]] || probe_flag="--probe-mail"
    if [[ "$TARGET" == "docker" ]]; then
      run docker exec riskhub-backend python -m app.services.identity_diagnostics ${probe_args[@]+"${probe_args[@]}"}
    else
      [[ -L "$LINUX_CURRENT_LINK" ]] || die "Installed Linux release is unavailable"
      release_dir="$(readlink "$LINUX_CURRENT_LINK")"
      linux_run_release_command "${release_dir}/backend" "Read installed identity diagnostics" \
        "$(printf '%q' "${release_dir}/venv/bin/python") -m app.services.identity_diagnostics ${probe_flag}"
    fi
    ;;
  logs)
    if [[ "$TARGET" == "docker" ]]; then
      docker_logs "$SERVICE" "$FOLLOW" "$TAIL_LINES"
    else
      linux_logs "$SERVICE" "$FOLLOW" "$TAIL_LINES"
    fi
    ;;
  smoke)
    require_file "$CONFIG_PATH"
    secrets_check
    if [[ "$TARGET" == "docker" ]]; then
      docker_smoke "$CONFIG_PATH"
    else
      linux_smoke "$CONFIG_PATH"
    fi
    ;;
  rollback)
    require_file "$CONFIG_PATH"
    python3 "$RENDERER" validate-transition --config "$CONFIG_PATH" --installed "$LINUX_BACKEND_ENV"
    if [[ "$IDENTITY_CHOICE" == "custom" && "$TARGET" == "docker" ]]; then
      die "Native Docker rollback requires a complete compatible release; use upgrade with all four pinned artifacts so candidate identity preflight runs before replacement"
    fi
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
