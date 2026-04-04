#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

DEFAULT_CONFIG_PATH="${RISKHUB_DEFAULT_CONFIG_PATH:-/etc/riskhub/riskhub.env}"
DEFAULT_SECRET_DIR="${RISKHUB_DEFAULT_SECRET_DIR:-/etc/riskhub/secrets}"

DRY_RUN=false
YES=false
VERBOSE=false

timestamp() {
  date +"%Y-%m-%dT%H:%M:%S%z"
}

log() {
  printf '%s %s\n' "$(timestamp)" "$*"
}

warn() {
  printf '%s WARN: %s\n' "$(timestamp)" "$*" >&2
}

die() {
  printf '%s ERROR: %s\n' "$(timestamp)" "$*" >&2
  exit 1
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || die "Missing required command: $cmd"
}

parse_shared_flag() {
  case "$1" in
    --dry-run)
      DRY_RUN=true
      return 0
      ;;
    --yes)
      YES=true
      return 0
      ;;
    --verbose)
      VERBOSE=true
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '+' >&2
    local arg
    for arg in "$@"; do
      printf ' %q' "$arg" >&2
    done
    printf '\n' >&2
    return 0
  fi
  "$@"
}

show_help() {
  cat <<EOF
Usage: ./scripts/install.sh <demo|dev|production|verify> [options]

Public first-run installer for RiskHub.

Commands:
  demo                         Docker-backed demo/onboarding install
  dev                          Local contributor install/startup
  production --target TARGET   Guided production install wrapper (docker|linux)
  verify --mode MODE           Verify an existing install (demo|dev|production)

Shared options:
  --dry-run                    Print commands without executing them
  --yes                        Non-interactive mode where supported
  --verbose                    More logging

Examples:
  ./scripts/install.sh demo
  ./scripts/install.sh demo --reset test
  ./scripts/install.sh dev
  ./scripts/install.sh dev --backend
  ./scripts/install.sh production --target docker --version v1.2.3
  ./scripts/install.sh production --target linux --bundle ./riskhub-linux-v1.2.3.tar.gz
  ./scripts/install.sh verify --mode production --target docker

Advanced/manual entrypoints remain available:
  ./scripts/compose.sh
  ./scripts/dev.sh
  ./scripts/deploy.sh
EOF
}

prompt_value() {
  local prompt="$1"
  local default_value="${2:-}"
  if [[ "$YES" == "true" || ! -t 0 ]]; then
    die "Missing required input in non-interactive mode: ${prompt}"
  fi
  local value=""
  while [[ -z "$value" ]]; do
    if [[ -n "$default_value" ]]; then
      read -r -p "${prompt} [${default_value}]: " value
      value="${value:-$default_value}"
    else
      read -r -p "${prompt}: " value
    fi
    if [[ -z "$value" ]]; then
      warn "Value cannot be empty."
    fi
  done
  printf '%s' "$value"
}

envfile_get() {
  local path="$1"
  local key="$2"
  python3 - "$path" "$key" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
key = sys.argv[2]
if not path.exists():
    raise SystemExit(0)
for raw in path.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    current_key, current_value = line.split("=", 1)
    if current_key == key:
        print(current_value)
        raise SystemExit(0)
PY
}

write_envfile_value() {
  local path="$1"
  local key="$2"
  local value="$3"
  local tmp_file=""
  tmp_file="$(mktemp "${TMPDIR:-/tmp}/riskhub-install-env.XXXXXX")"
  python3 - "$path" "$key" "$value" >"$tmp_file" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
lines = path.read_text(encoding="utf-8").splitlines()
updated = False
output = []
for line in lines:
    stripped = line.strip()
    if stripped and not stripped.startswith("#") and "=" in line:
        current_key, _ = line.split("=", 1)
        if current_key == key:
            output.append(f"{key}={value}")
            updated = True
            continue
    output.append(line)
if not updated:
    output.append(f"{key}={value}")
sys.stdout.write("\n".join(output) + "\n")
PY

  if [[ -w "$path" ]]; then
    cp "$tmp_file" "$path"
    chmod 600 "$path" || true
  else
    require_cmd sudo
    sudo cp "$tmp_file" "$path"
    sudo chmod 600 "$path"
  fi
  rm -f "$tmp_file"
}

config_placeholder_for_key() {
  local key="$1"
  case "$key" in
    PUBLIC_URL) printf '%s' "https://riskhub.example.com" ;;
    ENTRA_TENANT_ID) printf '%s' "00000000-0000-0000-0000-000000000000" ;;
    ENTRA_CLIENT_ID) printf '%s' "11111111-1111-1111-1111-111111111111" ;;
    BOOTSTRAP_ADMIN_EMAIL) printf '%s' "admin@example.com" ;;
    BOOTSTRAP_CRO_EMAIL) printf '%s' "cro@example.com" ;;
    *) printf '%s' "" ;;
  esac
}

config_prompt_for_key() {
  local key="$1"
  case "$key" in
    PUBLIC_URL) printf '%s' "Public RiskHub URL" ;;
    ENTRA_TENANT_ID) printf '%s' "Microsoft Entra tenant ID" ;;
    ENTRA_CLIENT_ID) printf '%s' "Microsoft Entra client ID" ;;
    BOOTSTRAP_ADMIN_EMAIL) printf '%s' "Bootstrap admin email" ;;
    BOOTSTRAP_CRO_EMAIL) printf '%s' "Bootstrap CRO email" ;;
    *) printf '%s' "$key" ;;
  esac
}

config_value_is_placeholder() {
  local key="$1"
  local value="$2"
  local placeholder=""
  placeholder="$(config_placeholder_for_key "$key")"
  [[ -z "$value" || "$value" == "$placeholder" ]]
}

secret_placeholder_for_name() {
  local name="$1"
  case "$name" in
    database_url) printf '%s' "CHANGE_ME_DATABASE_URL" ;;
    secret_key) printf '%s' "CHANGE_ME_SECRET_KEY_AT_LEAST_32_CHARACTERS" ;;
    entra_client_secret) printf '%s' "CHANGE_ME_ENTRA_CLIENT_SECRET" ;;
    entra_client_certificate_private_key) printf '%s' "CHANGE_ME_ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY" ;;
    redis_password) printf '%s' "CHANGE_ME_REDIS_PASSWORD" ;;
    *) printf '%s' "" ;;
  esac
}

trimmed_file_value() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    return 0
  fi
  python3 - "$path" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
print(path.read_text(encoding="utf-8").strip())
PY
}

secret_value_is_placeholder() {
  local secret_dir="$1"
  local name="$2"
  local path="${secret_dir}/${name}"
  local value=""
  value="$(trimmed_file_value "$path")"
  [[ -z "$value" || "$value" == "$(secret_placeholder_for_name "$name")" ]]
}

have_editor() {
  [[ -n "${VISUAL:-}" || -n "${EDITOR:-}" ]]
}

ensure_demo_prereqs() {
  if [[ "$DRY_RUN" == "true" ]]; then
    return 0
  fi
  require_cmd docker
  require_cmd curl
}

ensure_dev_prereqs() {
  if [[ "$DRY_RUN" == "true" ]]; then
    return 0
  fi
  require_cmd docker
  require_cmd python3
  require_cmd curl
}

ensure_production_config_ready() {
  local config_path="$1"
  local key current_value prompt placeholder replacement
  for key in PUBLIC_URL ENTRA_TENANT_ID ENTRA_CLIENT_ID BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_CRO_EMAIL; do
    current_value="$(envfile_get "$config_path" "$key")"
    if config_value_is_placeholder "$key" "$current_value"; then
      prompt="$(config_prompt_for_key "$key")"
      placeholder="$(config_placeholder_for_key "$key")"
      replacement="$(prompt_value "$prompt" "$placeholder")"
      if config_value_is_placeholder "$key" "$replacement"; then
        die "${key} must be changed from the template placeholder."
      fi
      write_envfile_value "$config_path" "$key" "$replacement"
    fi
  done
}

ensure_production_release_input() {
  local target="$1"
  local version_ref="$2"
  local bundle_ref="$3"

  if [[ "$target" == "docker" ]]; then
    if [[ -n "${!version_ref}" ]]; then
      return 0
    fi
    local backend_image_ref="$4"
    local backend_db_image_ref="$5"
    local frontend_image_ref="$6"
    local redis_image_ref="$7"
    if [[ -n "${!backend_image_ref}" && -n "${!backend_db_image_ref}" && -n "${!frontend_image_ref}" && -n "${!redis_image_ref}" ]]; then
      return 0
    fi
    if [[ "$DRY_RUN" == "true" || "$YES" == "true" || ! -t 0 ]]; then
      die "Production docker install requires --version or all image refs."
    fi
    printf -v "$version_ref" '%s' "$(prompt_value "Docker release version" "v1.2.3")"
    return 0
  fi

  if [[ -n "${!bundle_ref}" ]]; then
    return 0
  fi
  if [[ "$DRY_RUN" == "true" || "$YES" == "true" || ! -t 0 ]]; then
    die "Production linux install requires --bundle PATH."
  fi
  printf -v "$bundle_ref" '%s' "$(prompt_value "Linux release bundle path" "./riskhub-linux-v1.2.3.tar.gz")"
}

production_scaffold_missing() {
  local config_path="$1"
  local secret_dir="$2"
  [[ ! -f "$config_path" || ! -d "$secret_dir" || ! -f "${secret_dir}/database_url" || ! -f "${secret_dir}/secret_key" || ! -f "${secret_dir}/redis_password" ]]
}

ensure_production_secrets_ready() {
  local target="$1"
  local secret_dir="$2"
  local config_path="$3"
  local thumbprint=""
  thumbprint="$(envfile_get "$config_path" "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT")"
  local certificate_mode="false"
  if [[ -n "$thumbprint" ]]; then
    certificate_mode="true"
  fi

  local needs_edit="false"
  local secret_name=""
  for secret_name in database_url secret_key redis_password; do
    if secret_value_is_placeholder "$secret_dir" "$secret_name"; then
      needs_edit="true"
    fi
  done
  if [[ "$certificate_mode" != "true" ]] && secret_value_is_placeholder "$secret_dir" "entra_client_secret"; then
    needs_edit="true"
  fi

  if [[ "$needs_edit" == "true" ]]; then
    have_editor || die "Set \$EDITOR or \$VISUAL before guided production secret editing."
    run "${REPO_ROOT}/scripts/deploy.sh" secrets-edit --target "$target" --secret-dir "$secret_dir"
  fi

  for secret_name in database_url secret_key redis_password; do
    if secret_value_is_placeholder "$secret_dir" "$secret_name"; then
      die "${secret_name} still contains the placeholder value."
    fi
  done

  if [[ "$certificate_mode" == "true" ]]; then
    if secret_value_is_placeholder "$secret_dir" "entra_client_certificate_private_key"; then
      die "Certificate mode is selected, but ${secret_dir}/entra_client_certificate_private_key still contains the placeholder value."
    fi
  else
    if secret_value_is_placeholder "$secret_dir" "entra_client_secret"; then
      die "Client-secret mode is selected, but ${secret_dir}/entra_client_secret still contains the placeholder value."
    fi
  fi
}

verify_demo() {
  if [[ "$DRY_RUN" == "true" ]]; then
    run curl -fsS "http://localhost/login"
    run curl -fsS "http://localhost/api/v1/auth/config"
    return 0
  fi
  curl -fsS "http://localhost/login" >/dev/null
  curl -fsS "http://localhost/api/v1/auth/config" >/dev/null
}

verify_dev() {
  if [[ "$DRY_RUN" == "true" ]]; then
    run curl -fsS "http://localhost:5173/login"
    run curl -fsS "http://localhost:8000/api/v1/health"
    run curl -fsS "http://localhost:8000/api/v1/auth/config"
    return 0
  fi
  curl -fsS "http://localhost:5173/login" >/dev/null
  curl -fsS "http://localhost:8000/api/v1/health" >/dev/null
  curl -fsS "http://localhost:8000/api/v1/auth/config" >/dev/null
}

summary_demo() {
  cat <<EOF

=== RiskHub Install Summary ===
Mode: demo
Command: ./scripts/install.sh demo
App URL: http://localhost/login
Verify:
  ./scripts/install.sh verify --mode demo
Logs:
  ./scripts/compose.sh logs
Next:
  Sign in with the demo login picker at http://localhost/login
  Use ./scripts/install.sh demo --reset test for deterministic demo data
EOF
}

summary_dev() {
  cat <<EOF

=== RiskHub Install Summary ===
Mode: dev
Command: ./scripts/install.sh dev
Frontend URL: http://localhost:5173/login
Backend URL: http://localhost:8000
Verify:
  ./scripts/install.sh verify --mode dev
Logs:
  Backend: ${REPO_ROOT}/.dev-backend.log
  Frontend: ${REPO_ROOT}/.dev-frontend.log
Next:
  Use ./scripts/install.sh dev --backend for backend-only iteration
  Set AUTH_MODE=password MOCK_AUTH_ENABLED=false to disable demo auth locally
EOF
}

summary_production() {
  local target="$1"
  local config_path="$2"
  local secret_dir="$3"
  cat <<EOF

=== RiskHub Install Summary ===
Mode: production
Command: ./scripts/install.sh production --target ${target}
Manual prerequisites:
  External PostgreSQL is required
  A public RiskHub URL and Microsoft Entra app credentials are required
Verify:
  ./scripts/install.sh verify --mode production --target ${target} --config ${config_path} --secret-dir ${secret_dir}
Logs:
  ./scripts/deploy.sh logs --target ${target} --service all --tail 200
Rollback:
  ./scripts/deploy.sh rollback --target ${target} --config ${config_path} --secret-dir ${secret_dir}
Next:
  Re-run the production command with --version or explicit image/bundle inputs for upgrades
  Keep certificate mode manual unless ENTRA_CLIENT_CERTIFICATE_THUMBPRINT and its PEM secret are fully populated
EOF
}

run_demo() {
  ensure_demo_prereqs
  local reset_dataset=""
  local no_build=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run|--yes|--verbose)
        parse_shared_flag "$1"
        shift
        ;;
      --reset)
        reset_dataset="${2:-}"
        shift 2
        ;;
      --no-build)
        no_build=true
        shift
        ;;
      *)
        die "Unknown demo option: $1"
        ;;
    esac
  done

  local args=()
  if [[ -n "$reset_dataset" ]]; then
    args=(reset --dataset "$reset_dataset")
  else
    args=(up)
  fi
  if [[ "$no_build" == "true" ]]; then
    args+=(--no-build)
  fi
  if [[ "$DRY_RUN" == "true" ]]; then
    args+=(--dry-run)
  fi
  if [[ "$VERBOSE" == "true" ]]; then
    args+=(--verbose)
  fi

  run "${REPO_ROOT}/scripts/compose.sh" "${args[@]}"
  verify_demo
  summary_demo
}

run_dev() {
  ensure_dev_prereqs
  local args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run|--yes|--verbose)
        parse_shared_flag "$1"
        shift
        ;;
      --backend|--daemon)
        args+=("$1")
        shift
        ;;
      *)
        die "Unknown dev option: $1"
        ;;
    esac
  done

  if [[ "$DRY_RUN" == "true" ]]; then
    run "${REPO_ROOT}/scripts/dev.sh" "${args[@]}"
  else
    "${REPO_ROOT}/scripts/dev.sh" "${args[@]}"
  fi
  verify_dev
  summary_dev
}

run_production() {
  local target=""
  local config_path="$DEFAULT_CONFIG_PATH"
  local secret_dir="$DEFAULT_SECRET_DIR"
  local version=""
  local backend_image=""
  local backend_db_image=""
  local frontend_image=""
  local redis_image=""
  local bundle=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run|--yes|--verbose)
        parse_shared_flag "$1"
        shift
        ;;
      --target)
        target="${2:-}"
        shift 2
        ;;
      --config)
        config_path="${2:-}"
        shift 2
        ;;
      --secret-dir)
        secret_dir="${2:-}"
        shift 2
        ;;
      --version)
        version="${2:-}"
        shift 2
        ;;
      --backend-image)
        backend_image="${2:-}"
        shift 2
        ;;
      --backend-db-image)
        backend_db_image="${2:-}"
        shift 2
        ;;
      --frontend-image)
        frontend_image="${2:-}"
        shift 2
        ;;
      --redis-image)
        redis_image="${2:-}"
        shift 2
        ;;
      --bundle)
        bundle="${2:-}"
        shift 2
        ;;
      *)
        die "Unknown production option: $1"
        ;;
    esac
  done

  [[ "$target" == "docker" || "$target" == "linux" ]] || die "Production install requires --target docker|linux."
  ensure_production_release_input "$target" version bundle backend_image backend_db_image frontend_image redis_image

  local needs_config_init="false"
  local needs_secret_init="false"
  if [[ ! -f "$config_path" ]]; then
    needs_config_init="true"
  fi
  if [[ ! -d "$secret_dir" || ! -f "${secret_dir}/database_url" || ! -f "${secret_dir}/secret_key" || ! -f "${secret_dir}/redis_password" ]]; then
    needs_secret_init="true"
  fi

  if [[ "$needs_config_init" == "true" ]]; then
    log "Production config scaffold is missing. Initializing it first."
    run "${REPO_ROOT}/scripts/deploy.sh" init --target "$target" --config "$config_path" --secret-dir "$secret_dir"
  fi
  if [[ "$needs_secret_init" == "true" && "$needs_config_init" != "true" ]]; then
    log "Production secret scaffold is missing. Initializing it first."
    run "${REPO_ROOT}/scripts/deploy.sh" secrets-init --target "$target" --secret-dir "$secret_dir"
  fi
  if [[ "$DRY_RUN" == "true" && ("$needs_config_init" == "true" || "$needs_secret_init" == "true") ]]; then
    summary_production "$target" "$config_path" "$secret_dir"
    return 0
  fi

  if [[ "$DRY_RUN" != "true" ]]; then
    ensure_production_config_ready "$config_path"
    ensure_production_secrets_ready "$target" "$secret_dir" "$config_path"
  fi

  local common_args=(--target "$target" --config "$config_path" --secret-dir "$secret_dir")
  if [[ "$YES" == "true" ]]; then common_args+=(--yes); fi
  if [[ "$DRY_RUN" == "true" ]]; then common_args+=(--dry-run); fi
  if [[ "$VERBOSE" == "true" ]]; then common_args+=(--verbose); fi

  local release_args=()
  if [[ "$target" == "docker" ]]; then
    if [[ -n "$version" ]]; then
      release_args+=(--version "$version")
    else
      release_args+=(
        --backend-image "$backend_image"
        --backend-db-image "$backend_db_image"
        --frontend-image "$frontend_image"
        --redis-image "$redis_image"
      )
    fi
  else
    release_args+=(--bundle "$bundle")
  fi

  run "${REPO_ROOT}/scripts/deploy.sh" preflight "${common_args[@]}"
  run "${REPO_ROOT}/scripts/deploy.sh" deploy "${common_args[@]}" "${release_args[@]}"
  run "${REPO_ROOT}/scripts/deploy.sh" status --target "$target"
  run "${REPO_ROOT}/scripts/deploy.sh" smoke "${common_args[@]}"
  summary_production "$target" "$config_path" "$secret_dir"
}

run_verify() {
  local mode=""
  local target=""
  local config_path="$DEFAULT_CONFIG_PATH"
  local secret_dir="$DEFAULT_SECRET_DIR"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run|--yes|--verbose)
        parse_shared_flag "$1"
        shift
        ;;
      --mode)
        mode="${2:-}"
        shift 2
        ;;
      --target)
        target="${2:-}"
        shift 2
        ;;
      --config)
        config_path="${2:-}"
        shift 2
        ;;
      --secret-dir)
        secret_dir="${2:-}"
        shift 2
        ;;
      *)
        die "Unknown verify option: $1"
        ;;
    esac
  done

  case "$mode" in
    demo)
      ensure_demo_prereqs
      verify_demo
      summary_demo
      ;;
    dev)
      ensure_dev_prereqs
      verify_dev
      summary_dev
      ;;
    production)
      [[ "$target" == "docker" || "$target" == "linux" ]] || die "Production verify requires --target docker|linux."
      local common_args=(--target "$target" --config "$config_path" --secret-dir "$secret_dir")
      if [[ "$YES" == "true" ]]; then common_args+=(--yes); fi
      if [[ "$DRY_RUN" == "true" ]]; then common_args+=(--dry-run); fi
      if [[ "$VERBOSE" == "true" ]]; then common_args+=(--verbose); fi
      run "${REPO_ROOT}/scripts/deploy.sh" status --target "$target"
      run "${REPO_ROOT}/scripts/deploy.sh" smoke "${common_args[@]}"
      summary_production "$target" "$config_path" "$secret_dir"
      ;;
    *)
      die "Verify requires --mode demo|dev|production."
      ;;
  esac
}

COMMAND="${1:-}"
if [[ -z "$COMMAND" || "$COMMAND" == "-h" || "$COMMAND" == "--help" || "$COMMAND" == "help" ]]; then
  show_help
  exit 0
fi
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
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
    *)
      break
      ;;
  esac
done

case "$COMMAND" in
  demo)
    run_demo "$@"
    ;;
  dev)
    run_dev "$@"
    ;;
  production)
    run_production "$@"
    ;;
  verify)
    run_verify "$@"
    ;;
  *)
    show_help
    die "Unknown command: $COMMAND"
    ;;
esac
