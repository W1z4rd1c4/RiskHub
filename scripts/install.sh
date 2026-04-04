#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

DEFAULT_CONFIG_PATH="${RISKHUB_DEFAULT_CONFIG_PATH:-/etc/riskhub/riskhub.env}"
DEFAULT_SECRET_DIR="${RISKHUB_DEFAULT_SECRET_DIR:-/etc/riskhub/secrets}"
DEFAULT_RUNTIME_DIR="${RISKHUB_RUNTIME_DIR:-/etc/riskhub/runtime}"
DEFAULT_LINUX_ROOT="${RISKHUB_LINUX_ROOT:-/opt/riskhub}"
DEFAULT_LINUX_CURRENT_LINK="${DEFAULT_LINUX_ROOT}/current"
# shellcheck disable=SC2034 # Reserved for future lifecycle parity with deploy/lib/common.sh.
DEFAULT_LINUX_PREVIOUS_LINK="${DEFAULT_LINUX_ROOT}/previous"
DEFAULT_LINUX_BACKEND_SERVICE="${RISKHUB_LINUX_BACKEND_SERVICE:-riskhub-backend}"
DEFAULT_LINUX_SCHEDULER_SERVICE="${RISKHUB_LINUX_SCHEDULER_SERVICE:-riskhub-scheduler}"
DEFAULT_LINUX_REDIS_SERVICE="${RISKHUB_LINUX_REDIS_SERVICE:-riskhub-redis}"

COMPOSE_SCRIPT="${RISKHUB_INSTALL_COMPOSE_SCRIPT:-${REPO_ROOT}/scripts/compose.sh}"
DEV_SCRIPT="${RISKHUB_INSTALL_DEV_SCRIPT:-${REPO_ROOT}/scripts/dev.sh}"
DEPLOY_SCRIPT="${RISKHUB_INSTALL_DEPLOY_SCRIPT:-${REPO_ROOT}/scripts/deploy.sh}"
INSTALL_STATE_BASENAME="install-state.json"

DRY_RUN=false
YES=false
VERBOSE=false

timestamp() {
  date +"%Y-%m-%dT%H:%M:%S%z"
}

timestamp_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
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

command_exists() {
  command -v "$1" >/dev/null 2>&1
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

run_privileged() {
  if [[ "$EUID" -eq 0 ]]; then
    run "$@"
    return 0
  fi
  require_cmd sudo
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '+ sudo' >&2
    local arg
    for arg in "$@"; do
      printf ' %q' "$arg" >&2
    done
    printf '\n' >&2
    return 0
  fi
  sudo "$@"
}

path_requires_privileged_write() {
  local path="$1"
  local parent
  parent="$(dirname "$path")"
  if [[ -e "$path" ]]; then
    [[ ! -w "$path" && ! -w "$parent" ]]
    return $?
  fi
  [[ ! -w "$parent" ]]
}

ensure_dir() {
  local path="$1"
  if [[ -d "$path" || -w "$(dirname "$path")" ]]; then
    run mkdir -p "$path"
  else
    run_privileged mkdir -p "$path"
  fi
}

copy_file_auto() {
  local src="$1"
  local dest="$2"
  local mode="${3:-644}"
  ensure_dir "$(dirname "$dest")"
  if path_requires_privileged_write "$dest"; then
    run_privileged cp "$src" "$dest"
    run_privileged chmod "$mode" "$dest"
  else
    run cp "$src" "$dest"
    run chmod "$mode" "$dest"
  fi
}

write_file_content() {
  local dest="$1"
  local content="$2"
  local mode="${3:-644}"
  ensure_dir "$(dirname "$dest")"
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '+ write content to %q (mode %s)\n' "$dest" "$mode" >&2
    return 0
  fi
  local tmp_file
  tmp_file="$(mktemp "${TMPDIR:-/tmp}/riskhub-install.XXXXXX")"
  printf '%s' "$content" >"$tmp_file"
  copy_file_auto "$tmp_file" "$dest" "$mode"
  rm -f "$tmp_file"
}

runtime_dir_path() {
  printf '%s\n' "$DEFAULT_RUNTIME_DIR"
}

install_state_path() {
  local runtime_dir="${1:-$(runtime_dir_path)}"
  printf '%s/%s\n' "$runtime_dir" "$INSTALL_STATE_BASENAME"
}

backup_root_path() {
  local runtime_dir="${1:-$(runtime_dir_path)}"
  printf '%s/backups\n' "$runtime_dir"
}

show_help() {
  cat <<EOF
Usage: ./scripts/install.sh <demo|dev|production|verify|status|logs|doctor|upgrade> [options]

Public first-run and lifecycle installer for RiskHub.

Commands:
  demo                         Docker-backed demo/onboarding install
  dev                          Local contributor install/startup
  production --target TARGET   Guided production install wrapper (docker|linux)
  upgrade --target TARGET      Guided production upgrade wrapper (docker|linux)
  verify --mode MODE           Verify an existing install (demo|dev|production)
  status --mode MODE           Report runtime status (demo|dev|production)
  logs --mode MODE             Stream runtime logs (demo|dev|production)
  doctor --mode MODE           Diagnose or repair runtime issues (demo|dev|production)

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
  ./scripts/install.sh upgrade --target docker --version v1.2.4
  ./scripts/install.sh status --mode production --target docker --json
  ./scripts/install.sh logs --mode dev --tail 200 --follow
  ./scripts/install.sh doctor --mode production --target linux --repair

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

  if path_requires_privileged_write "$path"; then
    copy_file_auto "$tmp_file" "$path" 600
  else
    cp "$tmp_file" "$path"
    chmod 600 "$path" || true
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

file_exists() {
  [[ -e "$1" ]]
}

required_secret_missing() {
  local secret_dir="$1"
  local secret_name="$2"
  [[ ! -f "${secret_dir}/${secret_name}" ]]
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
    run "${DEPLOY_SCRIPT}" secrets-edit --target "$target" --secret-dir "$secret_dir"
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

docker_daemon_ready() {
  command_exists docker && docker info >/dev/null 2>&1
}

docker_container_state() {
  local container="$1"
  if ! docker_daemon_ready; then
    printf '%s\n' "unavailable"
    return 0
  fi
  if ! docker inspect "$container" >/dev/null 2>&1; then
    printf '%s\n' "missing"
    return 0
  fi
  local running
  running="$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null || true)"
  if [[ "$running" == "true" ]]; then
    printf '%s\n' "running"
  else
    printf '%s\n' "stopped"
  fi
}

docker_container_image() {
  local container="$1"
  if ! docker_daemon_ready; then
    return 0
  fi
  docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null || true
}

curl_ok() {
  local url="$1"
  if ! command_exists curl; then
    return 1
  fi
  curl -fsS "$url" >/dev/null 2>&1
}

port_listening() {
  local port="$1"
  if command_exists lsof; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  if command_exists ss; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "(:|\\])${port}$"
    return $?
  fi
  return 1
}

node_major_from_binary() {
  local node_binary="$1"
  "$node_binary" -p "process.versions.node.split('.')[0]" 2>/dev/null || true
}

find_valid_node24_bin_dir() {
  local candidate_dirs=(
    "${NODE24_BIN:-}"
    "/opt/homebrew/opt/node@24/bin"
    "/usr/local/opt/node@24/bin"
  )

  if command_exists brew; then
    local brew_prefix
    brew_prefix="$(brew --prefix node@24 2>/dev/null || true)"
    if [[ -n "$brew_prefix" ]]; then
      candidate_dirs+=("${brew_prefix}/bin")
    fi
  fi

  local nvm_candidate
  nvm_candidate="$(find "$HOME/.nvm/versions/node" -maxdepth 2 -type d -name 'v24*' 2>/dev/null | sort | head -n 1 || true)"
  if [[ -n "$nvm_candidate" ]]; then
    candidate_dirs+=("${nvm_candidate}/bin")
  fi

  local candidate_dir
  for candidate_dir in "${candidate_dirs[@]}"; do
    if [[ -x "${candidate_dir}/node" && -x "${candidate_dir}/npm" ]]; then
      local major
      major="$(node_major_from_binary "${candidate_dir}/node")"
      if [[ "$major" == "24" ]]; then
        printf '%s\n' "$candidate_dir"
        return 0
      fi
    fi
  done

  return 1
}

current_node_major() {
  if ! command_exists node; then
    return 0
  fi
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || true
}

resolved_dev_node_status_json() {
  local current_major
  current_major="$(current_node_major)"
  local valid_dir=""
  valid_dir="$(find_valid_node24_bin_dir || true)"
  python3 - "$current_major" "$valid_dir" <<'PY'
import json
import sys

current_major = sys.argv[1]
valid_dir = sys.argv[2]
payload = {
    "current_major": current_major or None,
    "resolved_node24_dir": valid_dir or None,
    "valid": current_major == "24" or bool(valid_dir),
}
print(json.dumps(payload, sort_keys=True))
PY
}

bundle_version_guess() {
  local bundle_path="$1"
  python3 - "$bundle_path" <<'PY'
import re
import sys
from pathlib import Path

name = Path(sys.argv[1]).name
match = re.match(r"riskhub-linux-(.+)\.tar\.gz$", name)
print(match.group(1) if match else "")
PY
}

production_public_url() {
  local config_path="$1"
  envfile_get "$config_path" "PUBLIC_URL"
}

production_frontend_bind_port() {
  local config_path="$1"
  local bind_port=""
  bind_port="$(envfile_get "$config_path" "FRONTEND_BIND_PORT")"
  printf '%s\n' "${bind_port:-80}"
}

linux_current_release_version() {
  if [[ ! -L "$DEFAULT_LINUX_CURRENT_LINK" ]]; then
    return 0
  fi
  local target
  target="$(readlink "$DEFAULT_LINUX_CURRENT_LINK")"
  basename "$target"
}

docker_live_release_source_json() {
  local backend_image=""
  local frontend_image=""
  local redis_image=""
  backend_image="$(docker_container_image "riskhub-backend")"
  frontend_image="$(docker_container_image "riskhub-frontend")"
  redis_image="$(docker_container_image "riskhub-redis")"
  if [[ -z "$backend_image" && -z "$frontend_image" && -z "$redis_image" ]]; then
    return 0
  fi
  python3 - "$backend_image" "$frontend_image" "$redis_image" <<'PY'
import json
import sys

backend_image, frontend_image, redis_image = sys.argv[1:4]
payload = {
    "kind": "docker_images",
    "backend_image": backend_image or None,
    "frontend_image": frontend_image or None,
    "redis_image": redis_image or None,
}
print(json.dumps(payload, sort_keys=True))
PY
}

linux_live_release_source_json() {
  local version=""
  version="$(linux_current_release_version)"
  if [[ -z "$version" ]]; then
    return 0
  fi
  python3 - "$version" <<'PY'
import json
import sys

payload = {
    "kind": "linux_release",
    "version": sys.argv[1],
}
print(json.dumps(payload, sort_keys=True))
PY
}

release_source_json_from_args() {
  local target="$1"
  local version="$2"
  local bundle="$3"
  local backend_image="$4"
  local backend_db_image="$5"
  local frontend_image="$6"
  local redis_image="$7"
  python3 - "$target" "$version" "$bundle" "$backend_image" "$backend_db_image" "$frontend_image" "$redis_image" <<'PY'
import json
import sys

target, version, bundle_path, backend_image, backend_db_image, frontend_image, redis_image = sys.argv[1:8]
if target == "docker":
    if version:
        payload = {
            "kind": "docker_version",
            "version": version,
            "backend_image": backend_image or None,
            "backend_db_image": backend_db_image or None,
            "frontend_image": frontend_image or None,
            "redis_image": redis_image or None,
        }
    else:
        payload = {
            "kind": "docker_images",
            "backend_image": backend_image or None,
            "backend_db_image": backend_db_image or None,
            "frontend_image": frontend_image or None,
            "redis_image": redis_image or None,
        }
else:
    payload = {
        "kind": "linux_bundle",
        "bundle_path": bundle_path or None,
        "version": version or None,
    }
print(json.dumps(payload, sort_keys=True))
PY
}

install_state_target() {
  local state_path="$1"
  python3 - "$state_path" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
if not path.exists():
    raise SystemExit(1)
payload = json.loads(path.read_text(encoding="utf-8"))
target = payload.get("target")
if not target:
    raise SystemExit(1)
print(target)
PY
}

install_state_field() {
  local state_path="$1"
  local field="$2"
  python3 - "$state_path" "$field" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
field = sys.argv[2]
if not path.exists():
    raise SystemExit(1)
payload = json.loads(path.read_text(encoding="utf-8"))
value = payload.get(field)
if value is None:
    raise SystemExit(1)
print(value)
PY
}

resolve_production_target() {
  local requested_target="$1"
  local runtime_dir="$2"
  if [[ -n "$requested_target" ]]; then
    printf '%s\n' "$requested_target"
    return 0
  fi
  local state_path
  state_path="$(install_state_path "$runtime_dir")"
  if [[ -f "$state_path" ]]; then
    install_state_target "$state_path"
    return 0
  fi
  if docker_daemon_ready && [[ "$(docker_container_state "riskhub-backend")" != "missing" || "$(docker_container_state "riskhub-frontend")" != "missing" ]]; then
    printf '%s\n' "docker"
    return 0
  fi
  if [[ -L "$DEFAULT_LINUX_CURRENT_LINK" ]]; then
    printf '%s\n' "linux"
    return 0
  fi
  die "Production lifecycle command requires --target docker|linux when install state cannot infer the active target."
}

write_production_install_state() {
  local target="$1"
  local config_path="$2"
  local secret_dir="$3"
  local runtime_dir="$4"
  local last_command="$5"
  local deploy_ts="$6"
  local smoke_ts="$7"
  local release_source_json="$8"
  local public_url="$9"
  local state_path
  state_path="$(install_state_path "$runtime_dir")"
  ensure_dir "$runtime_dir"
  local content
  content="$(
    python3 - "$target" "$config_path" "$secret_dir" "$runtime_dir" "$last_command" "$deploy_ts" "$smoke_ts" "$release_source_json" "$public_url" <<'PY'
import json
import sys

target, config_path, secret_dir, runtime_dir, last_command, deploy_ts, smoke_ts, release_source_json, public_url = sys.argv[1:10]
release_source = json.loads(release_source_json) if release_source_json else None

if target == "docker":
    managed_resources = {
        "docker_containers": [
            "riskhub-redis",
            "riskhub-backend",
            "riskhub-backend-scheduler",
            "riskhub-frontend",
        ]
    }
else:
    managed_resources = {
        "linux_services": [
            "riskhub-redis",
            "riskhub-backend",
            "riskhub-scheduler",
            "nginx",
        ]
    }

payload = {
    "target": target,
    "config_path": config_path,
    "secret_dir": secret_dir,
    "runtime_dir": runtime_dir,
    "current_release_source": release_source,
    "managed_resources": managed_resources,
    "public_url": public_url or None,
    "last_successful_deploy_timestamp": deploy_ts or None,
    "last_successful_smoke_timestamp": smoke_ts or None,
    "last_successful_command": last_command or None,
}
print(json.dumps(payload, indent=2, sort_keys=True))
PY
  )"
  write_file_content "$state_path" "${content}"$'\n' 640
}

backup_non_secret_production_state() {
  local config_path="$1"
  local runtime_dir="$2"
  local backup_id="$3"
  local backup_root
  backup_root="$(backup_root_path "$runtime_dir")/${backup_id}"
  ensure_dir "${backup_root}/config"
  ensure_dir "${backup_root}/runtime"
  copy_file_auto "$config_path" "${backup_root}/config/$(basename "$config_path")" 640

  local runtime_file
  for runtime_file in backend.env frontend.env metadata.env "${INSTALL_STATE_BASENAME}"; do
    if [[ -f "${runtime_dir}/${runtime_file}" ]]; then
      copy_file_auto "${runtime_dir}/${runtime_file}" "${backup_root}/runtime/${runtime_file}" 640
    fi
  done
}

production_status_json() {
  local target="$1"
  local config_path="$2"
  local secret_dir="$3"
  local runtime_dir="$4"
  local state_path
  state_path="$(install_state_path "$runtime_dir")"

  local config_exists="false"
  local secret_dir_exists="false"
  local runtime_dir_exists="false"
  [[ -f "$config_path" ]] && config_exists="true"
  [[ -d "$secret_dir" ]] && secret_dir_exists="true"
  [[ -d "$runtime_dir" ]] && runtime_dir_exists="true"

  local public_url=""
  if [[ "$config_exists" == "true" ]]; then
    public_url="$(production_public_url "$config_path")"
  fi

  local current_release_json=""
  local service_a=""
  local service_b=""
  local service_c=""
  local service_d=""

  if [[ "$target" == "docker" ]]; then
    current_release_json="$(docker_live_release_source_json)"
    service_a="$(docker_container_state "riskhub-redis")"
    service_b="$(docker_container_state "riskhub-backend")"
    service_c="$(docker_container_state "riskhub-backend-scheduler")"
    service_d="$(docker_container_state "riskhub-frontend")"
  else
    current_release_json="$(linux_live_release_source_json)"
    if command_exists systemctl; then
      service_a="$(systemctl is-active "$DEFAULT_LINUX_REDIS_SERVICE" 2>/dev/null || true)"
      service_b="$(systemctl is-active "$DEFAULT_LINUX_BACKEND_SERVICE" 2>/dev/null || true)"
      service_c="$(systemctl is-active "$DEFAULT_LINUX_SCHEDULER_SERVICE" 2>/dev/null || true)"
      service_d="$(systemctl is-active nginx 2>/dev/null || true)"
    else
      service_a="unavailable"
      service_b="unavailable"
      service_c="unavailable"
      service_d="unavailable"
    fi
  fi

  python3 - \
    "$state_path" \
    "$target" \
    "$config_path" \
    "$secret_dir" \
    "$runtime_dir" \
    "$config_exists" \
    "$secret_dir_exists" \
    "$runtime_dir_exists" \
    "$public_url" \
    "$current_release_json" \
    "$service_a" \
    "$service_b" \
    "$service_c" \
    "$service_d" <<'PY'
import json
import sys
from pathlib import Path

(
    state_path,
    target,
    config_path,
    secret_dir,
    runtime_dir,
    config_exists,
    secret_dir_exists,
    runtime_dir_exists,
    public_url,
    current_release_json,
    service_a,
    service_b,
    service_c,
    service_d,
) = sys.argv[1:15]

state_file = Path(state_path)
metadata = None
if state_file.exists():
    metadata = json.loads(state_file.read_text(encoding="utf-8"))

current_release = json.loads(current_release_json) if current_release_json else None
stale_reasons = []
if metadata:
    if metadata.get("target") != target:
        stale_reasons.append("target_mismatch")
    if metadata.get("config_path") != config_path:
        stale_reasons.append("config_path_mismatch")
    if metadata.get("secret_dir") != secret_dir:
        stale_reasons.append("secret_dir_mismatch")
    if metadata.get("runtime_dir") != runtime_dir:
        stale_reasons.append("runtime_dir_mismatch")

    meta_release = metadata.get("current_release_source") or {}
    if current_release:
        if meta_release.get("kind") == "docker_images":
            for key in ("backend_image", "frontend_image", "redis_image"):
                live_value = current_release.get(key)
                meta_value = meta_release.get(key)
                if live_value and meta_value and live_value != meta_value:
                    stale_reasons.append(f"{key}_mismatch")
        elif meta_release.get("kind") == "docker_version":
            version = meta_release.get("version")
            if version:
                for key in ("backend_image", "frontend_image", "redis_image"):
                    live_value = current_release.get(key)
                    if live_value and not live_value.endswith(f":{version}"):
                        stale_reasons.append(f"{key}_version_mismatch")
        elif meta_release.get("kind") in {"linux_bundle", "linux_release"}:
            live_version = current_release.get("version")
            meta_version = meta_release.get("version")
            if live_version and meta_version and live_version != meta_version:
                stale_reasons.append("linux_release_version_mismatch")

services = (
    {
        "redis": service_a,
        "backend": service_b,
        "scheduler": service_c,
        "frontend": service_d,
    }
    if target == "docker"
    else {
        "redis": service_a,
        "backend": service_b,
        "scheduler": service_c,
        "nginx": service_d,
    }
)

payload = {
    "mode": "production",
    "target": target,
    "installed": config_exists == "true" or secret_dir_exists == "true" or runtime_dir_exists == "true",
    "config_path": config_path,
    "secret_dir": secret_dir,
    "runtime_dir": runtime_dir,
    "public_url": public_url or (metadata or {}).get("public_url"),
    "metadata": {
        "present": metadata is not None,
        "stale": bool(stale_reasons),
        "stale_reasons": stale_reasons,
        "path": state_path,
    },
    "current_release_source": current_release or (metadata or {}).get("current_release_source"),
    "managed_resources": (metadata or {}).get("managed_resources"),
    "last_successful_deploy_timestamp": (metadata or {}).get("last_successful_deploy_timestamp"),
    "last_successful_smoke_timestamp": (metadata or {}).get("last_successful_smoke_timestamp"),
    "last_successful_command": (metadata or {}).get("last_successful_command"),
    "services": services,
}
print(json.dumps(payload, sort_keys=True))
PY
}

demo_status_json() {
  local docker_ready="false"
  local login_ok="false"
  local auth_ok="false"
  if docker_daemon_ready; then
    docker_ready="true"
  fi
  if curl_ok "http://localhost/login"; then
    login_ok="true"
  fi
  if curl_ok "http://localhost/api/v1/auth/config"; then
    auth_ok="true"
  fi

  python3 - \
    "$docker_ready" \
    "$(docker_container_state "riskhub-db")" \
    "$(docker_container_state "riskhub-redis")" \
    "$(docker_container_state "riskhub-backend")" \
    "$(docker_container_state "riskhub-frontend")" \
    "$login_ok" \
    "$auth_ok" <<'PY'
import json
import sys

docker_ready, db_state, redis_state, backend_state, frontend_state, login_ok, auth_ok = sys.argv[1:8]
payload = {
    "mode": "demo",
    "docker_ready": docker_ready == "true",
    "containers": {
        "db": db_state,
        "redis": redis_state,
        "backend": backend_state,
        "frontend": frontend_state,
    },
    "http": {
        "login": login_ok == "true",
        "auth_config": auth_ok == "true",
    },
}
print(json.dumps(payload, sort_keys=True))
PY
}

dev_status_json() {
  local db_state redis_state backend_listening frontend_listening login_ok health_ok auth_ok node_status_json backend_venv frontend_node_modules
  db_state="$(docker_container_state "riskhub-db")"
  redis_state="$(docker_container_state "riskhub-redis")"
  backend_listening="false"
  frontend_listening="false"
  login_ok="false"
  health_ok="false"
  auth_ok="false"
  backend_venv="false"
  frontend_node_modules="false"
  port_listening 8000 && backend_listening="true"
  port_listening 5173 && frontend_listening="true"
  curl_ok "http://localhost:5173/login" && login_ok="true"
  curl_ok "http://localhost:8000/api/v1/health" && health_ok="true"
  curl_ok "http://localhost:8000/api/v1/auth/config" && auth_ok="true"
  [[ -d "${REPO_ROOT}/backend/venv" ]] && backend_venv="true"
  [[ -d "${REPO_ROOT}/frontend/node_modules" ]] && frontend_node_modules="true"
  node_status_json="$(resolved_dev_node_status_json)"

  python3 - \
    "$db_state" \
    "$redis_state" \
    "$backend_listening" \
    "$frontend_listening" \
    "$login_ok" \
    "$health_ok" \
    "$auth_ok" \
    "$backend_venv" \
    "$frontend_node_modules" \
    "$node_status_json" <<'PY'
import json
import sys

(
    db_state,
    redis_state,
    backend_listening,
    frontend_listening,
    login_ok,
    health_ok,
    auth_ok,
    backend_venv,
    frontend_node_modules,
    node_status_json,
) = sys.argv[1:11]

payload = {
    "mode": "dev",
    "docker": {
        "db": db_state,
        "redis": redis_state,
    },
    "listeners": {
        "backend_8000": backend_listening == "true",
        "frontend_5173": frontend_listening == "true",
    },
    "http": {
        "login": login_ok == "true",
        "health": health_ok == "true",
        "auth_config": auth_ok == "true",
    },
    "dependencies": {
        "backend_venv": backend_venv == "true",
        "frontend_node_modules": frontend_node_modules == "true",
    },
    "node": json.loads(node_status_json),
}
print(json.dumps(payload, sort_keys=True))
PY
}

print_status_human() {
  local payload_json="$1"
  python3 - "$payload_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
mode = payload["mode"]

print("\n=== RiskHub Status ===")
print(f"Mode: {mode}")

if mode == "demo":
    print(f"Docker ready: {'yes' if payload['docker_ready'] else 'no'}")
    print("Containers:")
    for key, value in payload["containers"].items():
        print(f"  {key}: {value}")
    print("HTTP:")
    for key, value in payload["http"].items():
        print(f"  {key}: {'ok' if value else 'fail'}")
elif mode == "dev":
    print("Docker infra:")
    for key, value in payload["docker"].items():
        print(f"  {key}: {value}")
    print("Listeners:")
    for key, value in payload["listeners"].items():
        print(f"  {key}: {'listening' if value else 'missing'}")
    print("HTTP:")
    for key, value in payload["http"].items():
        print(f"  {key}: {'ok' if value else 'fail'}")
    print("Dependencies:")
    for key, value in payload["dependencies"].items():
        print(f"  {key}: {'present' if value else 'missing'}")
    node = payload["node"]
    current_major = node.get("current_major") or "missing"
    resolved = node.get("resolved_node24_dir") or "none"
    print("Node:")
    print(f"  current_major: {current_major}")
    print(f"  resolved_node24_dir: {resolved}")
    print(f"  valid: {'yes' if node.get('valid') else 'no'}")
else:
    print(f"Target: {payload['target']}")
    print(f"Installed: {'yes' if payload['installed'] else 'no'}")
    print(f"Public URL: {payload.get('public_url') or 'unknown'}")
    print(f"Config: {payload['config_path']}")
    print(f"Secrets: {payload['secret_dir']}")
    print(f"Runtime: {payload['runtime_dir']}")
    metadata = payload["metadata"]
    print("Install state:")
    print(f"  present: {'yes' if metadata['present'] else 'no'}")
    print(f"  stale: {'yes' if metadata['stale'] else 'no'}")
    if metadata["stale_reasons"]:
        print(f"  reasons: {', '.join(metadata['stale_reasons'])}")
    release = payload.get("current_release_source") or {}
    if release:
      print("Release:")
      for key in sorted(release):
          print(f"  {key}: {release[key]}")
    print("Services:")
    for key, value in payload["services"].items():
        print(f"  {key}: {value}")
    print(f"Last successful deploy: {payload.get('last_successful_deploy_timestamp') or 'unknown'}")
    print(f"Last successful smoke: {payload.get('last_successful_smoke_timestamp') or 'unknown'}")
    print(f"Last successful command: {payload.get('last_successful_command') or 'unknown'}")
PY
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
Status:
  ./scripts/install.sh status --mode demo
Logs:
  ./scripts/install.sh logs --mode demo --tail 200 --follow
Doctor:
  ./scripts/install.sh doctor --mode demo [--repair]
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
Status:
  ./scripts/install.sh status --mode dev
Logs:
  ./scripts/install.sh logs --mode dev --tail 200 --follow
Doctor:
  ./scripts/install.sh doctor --mode dev [--repair]
Next:
  Use ./scripts/install.sh dev --backend for backend-only iteration
  Set AUTH_MODE=password MOCK_AUTH_ENABLED=false to disable demo auth locally
EOF
}

summary_production_lifecycle() {
  local lifecycle_mode="$1"
  local target="$2"
  local config_path="$3"
  local secret_dir="$4"
  cat <<EOF

=== RiskHub Install Summary ===
Mode: ${lifecycle_mode}
Target: ${target}
Manual prerequisites:
  External PostgreSQL is required
  A public RiskHub URL and Microsoft Entra app credentials are required
Status:
  ./scripts/install.sh status --mode production --target ${target}
Verify:
  ./scripts/install.sh verify --mode production --target ${target} --config ${config_path} --secret-dir ${secret_dir}
Logs:
  ./scripts/install.sh logs --mode production --target ${target} --tail 200 --follow
Doctor:
  ./scripts/install.sh doctor --mode production --target ${target} [--repair]
Rollback:
  ./scripts/deploy.sh rollback --target ${target} --config ${config_path} --secret-dir ${secret_dir}
Next:
  Use ./scripts/install.sh upgrade --target ${target} for the next release change
  Back up secrets and the database through operator-managed processes before release changes
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

  run "${COMPOSE_SCRIPT}" "${args[@]}"
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
    run "${DEV_SCRIPT}" "${args[@]}"
  else
    "${DEV_SCRIPT}" "${args[@]}"
  fi
  verify_dev
  summary_dev
}

production_existing_install_detected() {
  local config_path="$1"
  local secret_dir="$2"
  local runtime_dir="$3"
  [[ -f "$config_path" && -d "$secret_dir" && -d "$runtime_dir" ]] || [[ -f "$(install_state_path "$runtime_dir")" ]]
}

run_production_action() {
  local lifecycle_command="$1"
  local deploy_action="$2"
  local target="$3"
  local config_path="$4"
  local secret_dir="$5"
  local runtime_dir="$6"
  local version="$7"
  local backend_image="$8"
  local backend_db_image="$9"
  local frontend_image="${10}"
  local redis_image="${11}"
  local bundle="${12}"

  local common_args=(--target "$target" --config "$config_path" --secret-dir "$secret_dir")
  if [[ "$YES" == "true" ]]; then common_args+=(--yes); fi
  if [[ "$DRY_RUN" == "true" ]]; then common_args+=(--dry-run); fi
  if [[ "$VERBOSE" == "true" ]]; then common_args+=(--verbose); fi

  local release_args=()
  local release_source_json=""
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
    release_source_json="$(release_source_json_from_args "$target" "$version" "" "$backend_image" "$backend_db_image" "$frontend_image" "$redis_image")"
  else
    release_args+=(--bundle "$bundle")
    local bundle_version=""
    bundle_version="$(bundle_version_guess "$bundle")"
    release_source_json="$(release_source_json_from_args "$target" "$bundle_version" "$bundle" "" "" "" "")"
  fi

  if [[ "$deploy_action" == "upgrade" ]]; then
    backup_non_secret_production_state "$config_path" "$runtime_dir" "$(date -u +"%Y%m%dT%H%M%SZ")"
  fi

  run "${DEPLOY_SCRIPT}" preflight "${common_args[@]}"
  run "${DEPLOY_SCRIPT}" "${deploy_action}" "${common_args[@]}" "${release_args[@]}"
  run "${DEPLOY_SCRIPT}" status --target "$target"
  run "${DEPLOY_SCRIPT}" smoke "${common_args[@]}"

  if [[ "$DRY_RUN" != "true" ]]; then
    local now_utc
    now_utc="$(timestamp_utc)"
    local public_url=""
    public_url="$(production_public_url "$config_path")"
    write_production_install_state \
      "$target" \
      "$config_path" \
      "$secret_dir" \
      "$runtime_dir" \
      "$lifecycle_command" \
      "$now_utc" \
      "$now_utc" \
      "$release_source_json" \
      "$public_url"
  fi
}

run_production() {
  local target=""
  local config_path="$DEFAULT_CONFIG_PATH"
  local secret_dir="$DEFAULT_SECRET_DIR"
  local runtime_dir
  runtime_dir="$(runtime_dir_path)"
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
    run "${DEPLOY_SCRIPT}" init --target "$target" --config "$config_path" --secret-dir "$secret_dir"
  fi
  if [[ "$needs_secret_init" == "true" && "$needs_config_init" != "true" ]]; then
    log "Production secret scaffold is missing. Initializing it first."
    run "${DEPLOY_SCRIPT}" secrets-init --target "$target" --secret-dir "$secret_dir"
  fi
  if [[ "$DRY_RUN" == "true" && ("$needs_config_init" == "true" || "$needs_secret_init" == "true") ]]; then
    summary_production_lifecycle "production" "$target" "$config_path" "$secret_dir"
    return 0
  fi

  if [[ "$DRY_RUN" != "true" ]]; then
    ensure_production_config_ready "$config_path"
    ensure_production_secrets_ready "$target" "$secret_dir" "$config_path"
  fi

  local deploy_action="deploy"
  if production_existing_install_detected "$config_path" "$secret_dir" "$runtime_dir"; then
    log "Existing production install detected. Re-running production in place and using the upgrade lifecycle under the hood."
    log "Prefer ./scripts/install.sh upgrade --target ${target} for normal release changes."
    deploy_action="upgrade"
  fi

  run_production_action "production" "$deploy_action" "$target" "$config_path" "$secret_dir" "$runtime_dir" "$version" "$backend_image" "$backend_db_image" "$frontend_image" "$redis_image" "$bundle"
  summary_production_lifecycle "production" "$target" "$config_path" "$secret_dir"
}

run_upgrade() {
  local target=""
  local config_path="$DEFAULT_CONFIG_PATH"
  local secret_dir="$DEFAULT_SECRET_DIR"
  local runtime_dir
  runtime_dir="$(runtime_dir_path)"
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
        die "Unknown upgrade option: $1"
        ;;
    esac
  done

  [[ "$target" == "docker" || "$target" == "linux" ]] || die "Upgrade requires --target docker|linux."
  ensure_production_release_input "$target" version bundle backend_image backend_db_image frontend_image redis_image

  if [[ ! -f "$config_path" ]]; then
    die "Upgrade requires an existing production config at ${config_path}."
  fi
  if [[ ! -d "$secret_dir" ]]; then
    die "Upgrade requires an existing secret directory at ${secret_dir}."
  fi
  ensure_production_secrets_ready "$target" "$secret_dir" "$config_path"

  local state_path
  state_path="$(install_state_path "$runtime_dir")"
  if [[ ! -f "$state_path" ]]; then
    warn "Production install state is missing at ${state_path}. Upgrade will continue and refresh metadata after successful smoke."
  fi

  run_production_action "upgrade" "upgrade" "$target" "$config_path" "$secret_dir" "$runtime_dir" "$version" "$backend_image" "$backend_db_image" "$frontend_image" "$redis_image" "$bundle"
  summary_production_lifecycle "upgrade" "$target" "$config_path" "$secret_dir"
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
      local runtime_dir
      runtime_dir="$(runtime_dir_path)"
      target="$(resolve_production_target "$target" "$runtime_dir")"
      local common_args=(--target "$target" --config "$config_path" --secret-dir "$secret_dir")
      if [[ "$YES" == "true" ]]; then common_args+=(--yes); fi
      if [[ "$DRY_RUN" == "true" ]]; then common_args+=(--dry-run); fi
      if [[ "$VERBOSE" == "true" ]]; then common_args+=(--verbose); fi
      run "${DEPLOY_SCRIPT}" status --target "$target"
      run "${DEPLOY_SCRIPT}" smoke "${common_args[@]}"
      summary_production_lifecycle "verify" "$target" "$config_path" "$secret_dir"
      ;;
    *)
      die "Verify requires --mode demo|dev|production."
      ;;
  esac
}

run_status() {
  local mode=""
  local target=""
  local config_path="$DEFAULT_CONFIG_PATH"
  local secret_dir="$DEFAULT_SECRET_DIR"
  local json=false
  local runtime_dir
  runtime_dir="$(runtime_dir_path)"

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
      --json)
        json=true
        shift
        ;;
      *)
        die "Unknown status option: $1"
        ;;
    esac
  done

  [[ -n "$mode" ]] || die "Status requires --mode demo|dev|production."

  if [[ "$DRY_RUN" == "true" ]]; then
    case "$mode" in
      demo)
        run docker inspect riskhub-db
        run docker inspect riskhub-redis
        run docker inspect riskhub-backend
        run docker inspect riskhub-frontend
        run curl -fsS "http://localhost/login"
        run curl -fsS "http://localhost/api/v1/auth/config"
        ;;
      dev)
        run docker inspect riskhub-db
        run docker inspect riskhub-redis
        run lsof -nP -iTCP:8000 -sTCP:LISTEN
        run lsof -nP -iTCP:5173 -sTCP:LISTEN
        run node -p "process.versions.node.split('.')[0]"
        run curl -fsS "http://localhost:5173/login"
        run curl -fsS "http://localhost:8000/api/v1/health"
        run curl -fsS "http://localhost:8000/api/v1/auth/config"
        ;;
      production)
        target="$(resolve_production_target "$target" "$runtime_dir")"
        run "${DEPLOY_SCRIPT}" status --target "$target"
        ;;
      *)
        die "Status requires --mode demo|dev|production."
        ;;
    esac
    return 0
  fi

  local payload_json=""
  case "$mode" in
    demo)
      payload_json="$(demo_status_json)"
      ;;
    dev)
      payload_json="$(dev_status_json)"
      ;;
    production)
      target="$(resolve_production_target "$target" "$runtime_dir")"
      payload_json="$(production_status_json "$target" "$config_path" "$secret_dir" "$runtime_dir")"
      ;;
    *)
      die "Status requires --mode demo|dev|production."
      ;;
  esac

  if [[ "$json" == "true" ]]; then
    printf '%s\n' "$payload_json"
  else
    print_status_human "$payload_json"
  fi
}

run_logs() {
  local mode=""
  local target=""
  local tail_lines="200"
  local follow=false

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
      --tail)
        tail_lines="${2:-}"
        shift 2
        ;;
      --follow)
        follow=true
        shift
        ;;
      *)
        die "Unknown logs option: $1"
        ;;
    esac
  done

  [[ -n "$mode" ]] || die "Logs requires --mode demo|dev|production."

  case "$mode" in
    demo)
      local compose_args=(logs --tail "$tail_lines")
      if [[ "$follow" == "true" ]]; then
        compose_args+=(--follow)
      fi
      run "${COMPOSE_SCRIPT}" "${compose_args[@]}"
      ;;
    dev)
      local tail_args=(-n "$tail_lines")
      if [[ "$follow" == "true" ]]; then
        tail_args+=(-f)
      fi
      run tail "${tail_args[@]}" "${REPO_ROOT}/.dev-backend.log" "${REPO_ROOT}/.dev-frontend.log"
      ;;
    production)
      local runtime_dir
      runtime_dir="$(runtime_dir_path)"
      target="$(resolve_production_target "$target" "$runtime_dir")"
      local args=(logs --target "$target" --service all --tail "$tail_lines")
      if [[ "$follow" == "true" ]]; then
        args+=(--follow)
      fi
      if [[ "$DRY_RUN" == "true" ]]; then
        args+=(--dry-run)
      fi
      if [[ "$VERBOSE" == "true" ]]; then
        args+=(--verbose)
      fi
      run "${DEPLOY_SCRIPT}" "${args[@]}"
      ;;
    *)
      die "Logs requires --mode demo|dev|production."
      ;;
  esac
}

print_doctor_human() {
  local payload_json="$1"
  python3 - "$payload_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
print("\n=== RiskHub Doctor ===")
print(f"Mode: {payload['mode']}")
if payload.get("target"):
    print(f"Target: {payload['target']}")
print(f"Repair requested: {'yes' if payload.get('repair_requested') else 'no'}")
print(f"Repair applied: {'yes' if payload.get('repair_applied') else 'no'}")
print("Findings:")
for finding in payload.get("findings", []):
    print(f"  - {finding}")
if not payload.get("findings"):
    print("  - none")
print("Actions:")
for action in payload.get("actions", []):
    print(f"  - {action}")
if not payload.get("actions"):
    print("  - none")
if payload.get("deep_check"):
    print(f"Deep check: {payload['deep_check']}")
PY
}

doctor_demo_json() {
  local repair_requested="$1"
  local repair_applied="$2"
  local deep_check="$3"
  local findings="$4"
  local actions="$5"
  python3 - "$repair_requested" "$repair_applied" "$deep_check" "$findings" "$actions" <<'PY'
import json
import sys

repair_requested, repair_applied, deep_check, findings_raw, actions_raw = sys.argv[1:6]
payload = {
    "mode": "demo",
    "repair_requested": repair_requested == "true",
    "repair_applied": repair_applied == "true",
    "deep_check": deep_check or None,
    "findings": [item for item in findings_raw.split("\n") if item],
    "actions": [item for item in actions_raw.split("\n") if item],
}
print(json.dumps(payload, sort_keys=True))
PY
}

doctor_dev_json() {
  local repair_requested="$1"
  local repair_applied="$2"
  local deep_check="$3"
  local findings="$4"
  local actions="$5"
  python3 - "$repair_requested" "$repair_applied" "$deep_check" "$findings" "$actions" <<'PY'
import json
import sys

repair_requested, repair_applied, deep_check, findings_raw, actions_raw = sys.argv[1:6]
payload = {
    "mode": "dev",
    "repair_requested": repair_requested == "true",
    "repair_applied": repair_applied == "true",
    "deep_check": deep_check or None,
    "findings": [item for item in findings_raw.split("\n") if item],
    "actions": [item for item in actions_raw.split("\n") if item],
}
print(json.dumps(payload, sort_keys=True))
PY
}

doctor_production_json() {
  local target="$1"
  local repair_requested="$2"
  local repair_applied="$3"
  local deep_check="$4"
  local findings="$5"
  local actions="$6"
  python3 - "$target" "$repair_requested" "$repair_applied" "$deep_check" "$findings" "$actions" <<'PY'
import json
import sys

target, repair_requested, repair_applied, deep_check, findings_raw, actions_raw = sys.argv[1:7]
payload = {
    "mode": "production",
    "target": target,
    "repair_requested": repair_requested == "true",
    "repair_applied": repair_applied == "true",
    "deep_check": deep_check or None,
    "findings": [item for item in findings_raw.split("\n") if item],
    "actions": [item for item in actions_raw.split("\n") if item],
}
print(json.dumps(payload, sort_keys=True))
PY
}

ensure_secret_scaffold_file() {
  local secret_dir="$1"
  local name="$2"
  local secret_path="${secret_dir}/${name}"
  if [[ -f "$secret_path" ]]; then
    return 0
  fi
  write_file_content "$secret_path" "$(secret_placeholder_for_name "$name")"$'\n' 440
}

repair_production_dirs() {
  local secret_dir="$1"
  local runtime_dir="$2"
  ensure_dir "$secret_dir"
  ensure_dir "$runtime_dir"
  if path_requires_privileged_write "$secret_dir"; then
    run_privileged chmod 750 "$secret_dir"
  else
    run chmod 750 "$secret_dir"
  fi
  if path_requires_privileged_write "$runtime_dir"; then
    run_privileged chmod 750 "$runtime_dir"
  else
    run chmod 750 "$runtime_dir"
  fi
}

restart_docker_managed_resources() {
  local restarted_any="false"
  local container
  for container in riskhub-redis riskhub-backend riskhub-backend-scheduler riskhub-frontend; do
    if [[ "$(docker_container_state "$container")" != "missing" ]]; then
      run docker restart "$container"
      restarted_any="true"
    fi
  done
  [[ "$restarted_any" == "true" ]]
}

restart_linux_managed_resources() {
  local restarted_any="false"
  if command_exists systemctl; then
    run_privileged systemctl restart "$DEFAULT_LINUX_REDIS_SERVICE"
    run_privileged systemctl restart "$DEFAULT_LINUX_BACKEND_SERVICE"
    run_privileged systemctl restart "$DEFAULT_LINUX_SCHEDULER_SERVICE"
    run_privileged systemctl restart nginx
    restarted_any="true"
  fi
  [[ "$restarted_any" == "true" ]]
}

rebuild_install_state_from_live() {
  local target="$1"
  local config_path="$2"
  local secret_dir="$3"
  local runtime_dir="$4"
  local state_path
  state_path="$(install_state_path "$runtime_dir")"
  local deploy_ts=""
  local last_command="production"
  if [[ -f "$state_path" ]]; then
    deploy_ts="$(install_state_field "$state_path" "last_successful_deploy_timestamp" 2>/dev/null || true)"
    last_command="$(install_state_field "$state_path" "last_successful_command" 2>/dev/null || printf '%s' "production")"
  fi
  local smoke_ts
  smoke_ts="$(timestamp_utc)"
  local release_source_json=""
  if [[ "$target" == "docker" ]]; then
    release_source_json="$(docker_live_release_source_json)"
  else
    release_source_json="$(linux_live_release_source_json)"
  fi
  local public_url=""
  public_url="$(production_public_url "$config_path")"
  write_production_install_state "$target" "$config_path" "$secret_dir" "$runtime_dir" "$last_command" "$deploy_ts" "$smoke_ts" "$release_source_json" "$public_url"
}

run_doctor() {
  local mode=""
  local target=""
  local config_path="$DEFAULT_CONFIG_PATH"
  local secret_dir="$DEFAULT_SECRET_DIR"
  local json=false
  local repair=false
  local deep=false
  local runtime_dir
  runtime_dir="$(runtime_dir_path)"

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
      --json)
        json=true
        shift
        ;;
      --repair)
        repair=true
        shift
        ;;
      --deep)
        deep=true
        shift
        ;;
      *)
        die "Unknown doctor option: $1"
        ;;
    esac
  done

  [[ -n "$mode" ]] || die "Doctor requires --mode demo|dev|production."

  local findings=()
  local actions=()
  local payload_json=""
  local repair_applied="false"
  local deep_check="not_run"

  case "$mode" in
    demo)
      if ! docker_daemon_ready; then
        findings+=("docker_daemon_unavailable")
      fi
      if [[ "$(docker_container_state "riskhub-db")" != "running" ]]; then
        findings+=("db_container_not_running")
      fi
      if [[ "$(docker_container_state "riskhub-redis")" != "running" ]]; then
        findings+=("redis_container_not_running")
      fi
      if [[ "$(docker_container_state "riskhub-backend")" != "running" ]]; then
        findings+=("backend_container_not_running")
      fi
      if [[ "$(docker_container_state "riskhub-frontend")" != "running" ]]; then
        findings+=("frontend_container_not_running")
      fi
      if ! curl_ok "http://localhost/login"; then
        findings+=("login_page_unreachable")
      fi
      if ! curl_ok "http://localhost/api/v1/auth/config"; then
        findings+=("auth_config_unreachable")
      fi

      if [[ "$deep" == "true" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
          run curl -fsS "http://localhost/login"
          run curl -fsS "http://localhost/api/v1/auth/config"
          deep_check="dry_run"
        elif verify_demo >/dev/null 2>&1; then
          deep_check="pass"
        else
          deep_check="fail"
          findings+=("deep_verify_failed")
        fi
      fi

      if [[ "$repair" == "true" ]]; then
        actions+=("${COMPOSE_SCRIPT} up")
        if [[ "$DRY_RUN" == "true" ]]; then
          run "${COMPOSE_SCRIPT}" up
        else
          run "${COMPOSE_SCRIPT}" up
          repair_applied="true"
          verify_demo
        fi
      fi

      payload_json="$(doctor_demo_json "$repair" "$repair_applied" "$deep_check" "$(printf '%s\n' "${findings[@]}")" "$(printf '%s\n' "${actions[@]}")")"
      ;;
    dev)
      if [[ "$(docker_container_state "riskhub-db")" != "running" ]]; then
        findings+=("db_container_not_running")
      fi
      if [[ "$(docker_container_state "riskhub-redis")" != "running" ]]; then
        findings+=("redis_container_not_running")
      fi
      if ! port_listening 8000; then
        findings+=("backend_listener_missing")
      fi
      if ! port_listening 5173; then
        findings+=("frontend_listener_missing")
      fi
      if [[ ! -d "${REPO_ROOT}/backend/venv" ]]; then
        findings+=("backend_venv_missing")
      fi
      if [[ ! -d "${REPO_ROOT}/frontend/node_modules" ]]; then
        findings+=("frontend_node_modules_missing")
      fi
      if ! python3 - "$(
        resolved_dev_node_status_json
      )" <<'PY' >/dev/null 2>&1
import json
import sys
payload = json.loads(sys.argv[1])
raise SystemExit(0 if payload.get("valid") else 1)
PY
      then
        findings+=("node_major_invalid")
      fi
      if ! curl_ok "http://localhost:8000/api/v1/auth/config"; then
        findings+=("auth_config_unreachable")
      fi

      if [[ "$deep" == "true" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
          run curl -fsS "http://localhost:5173/login"
          run curl -fsS "http://localhost:8000/api/v1/health"
          run curl -fsS "http://localhost:8000/api/v1/auth/config"
          deep_check="dry_run"
        elif verify_dev >/dev/null 2>&1; then
          deep_check="pass"
        else
          deep_check="fail"
          findings+=("deep_verify_failed")
        fi
      fi

      if [[ "$repair" == "true" ]]; then
        actions+=("${COMPOSE_SCRIPT} up --profile db-only")
        actions+=("${DEV_SCRIPT} --daemon")
        if [[ "$DRY_RUN" == "true" ]]; then
          run "${COMPOSE_SCRIPT}" up --profile db-only
          run "${DEV_SCRIPT}" --daemon
        else
          run "${COMPOSE_SCRIPT}" up --profile db-only
          run "${DEV_SCRIPT}" --daemon
          repair_applied="true"
          verify_dev
        fi
      fi

      payload_json="$(doctor_dev_json "$repair" "$repair_applied" "$deep_check" "$(printf '%s\n' "${findings[@]}")" "$(printf '%s\n' "${actions[@]}")")"
      ;;
    production)
      target="$(resolve_production_target "$target" "$runtime_dir")"
      local state_json
      state_json="$(production_status_json "$target" "$config_path" "$secret_dir" "$runtime_dir")"
      if ! python3 - "$state_json" <<'PY' >/dev/null 2>&1
import json
import sys
payload = json.loads(sys.argv[1])
raise SystemExit(0 if payload["metadata"]["present"] else 1)
PY
      then
        findings+=("install_state_missing")
      fi
      if python3 - "$state_json" <<'PY' >/dev/null 2>&1
import json
import sys
payload = json.loads(sys.argv[1])
raise SystemExit(0 if payload["metadata"]["stale"] else 1)
PY
      then
        findings+=("install_state_stale")
      fi
      [[ -f "$config_path" ]] || findings+=("config_missing")
      [[ -d "$secret_dir" ]] || findings+=("secret_dir_missing")
      [[ -d "$runtime_dir" ]] || findings+=("runtime_dir_missing")
      for secret_name in database_url secret_key redis_password; do
        if required_secret_missing "$secret_dir" "$secret_name"; then
          findings+=("${secret_name}_missing")
        fi
      done

      if [[ "$target" == "docker" ]]; then
        for pair in \
          "redis:$(docker_container_state "riskhub-redis")" \
          "backend:$(docker_container_state "riskhub-backend")" \
          "scheduler:$(docker_container_state "riskhub-backend-scheduler")" \
          "frontend:$(docker_container_state "riskhub-frontend")"; do
          if [[ "${pair#*:}" != "running" ]]; then
            findings+=("${pair%%:*}_not_running")
          fi
        done
      else
        local svc status_value
        for svc in "$DEFAULT_LINUX_REDIS_SERVICE" "$DEFAULT_LINUX_BACKEND_SERVICE" "$DEFAULT_LINUX_SCHEDULER_SERVICE" "nginx"; do
          status_value="unavailable"
          if command_exists systemctl; then
            status_value="$(systemctl is-active "$svc" 2>/dev/null || true)"
          fi
          if [[ "$status_value" != "active" ]]; then
            findings+=("${svc}_not_active")
          fi
        done
      fi

      if [[ "$deep" == "true" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
          run "${DEPLOY_SCRIPT}" smoke --target "$target" --config "$config_path" --secret-dir "$secret_dir" --dry-run
          deep_check="dry_run"
        else
          local smoke_args=(smoke --target "$target" --config "$config_path" --secret-dir "$secret_dir")
          if [[ "$YES" == "true" ]]; then smoke_args+=(--yes); fi
          if [[ "$VERBOSE" == "true" ]]; then smoke_args+=(--verbose); fi
          if "${DEPLOY_SCRIPT}" "${smoke_args[@]}" >/dev/null 2>&1; then
            deep_check="pass"
          else
            deep_check="fail"
            findings+=("smoke_check_failed")
          fi
        fi
      fi

      if [[ "$repair" == "true" ]]; then
        if [[ ! -f "$config_path" ]]; then
          actions+=("${DEPLOY_SCRIPT} init --target ${target} --config ${config_path} --secret-dir ${secret_dir}")
          run "${DEPLOY_SCRIPT}" init --target "$target" --config "$config_path" --secret-dir "$secret_dir"
        fi
        actions+=("ensure runtime/scaffold directories at ${secret_dir} and ${runtime_dir}")
        repair_production_dirs "$secret_dir" "$runtime_dir"
        if [[ ! -f "${secret_dir}/database_url" ]]; then
          actions+=("create missing secret scaffold: database_url")
          ensure_secret_scaffold_file "$secret_dir" "database_url"
        fi
        if [[ ! -f "${secret_dir}/secret_key" ]]; then
          actions+=("create missing secret scaffold: secret_key")
          ensure_secret_scaffold_file "$secret_dir" "secret_key"
        fi
        if [[ ! -f "${secret_dir}/redis_password" ]]; then
          actions+=("create missing secret scaffold: redis_password")
          ensure_secret_scaffold_file "$secret_dir" "redis_password"
        fi
        if [[ "$target" == "docker" ]]; then
          actions+=("restart docker managed resources")
          restart_docker_managed_resources || true
        else
          actions+=("restart linux managed services")
          restart_linux_managed_resources || true
        fi
        actions+=("${DEPLOY_SCRIPT} status --target ${target}")
        actions+=("${DEPLOY_SCRIPT} smoke --target ${target} --config ${config_path} --secret-dir ${secret_dir}")
        if [[ "$DRY_RUN" == "true" ]]; then
          run "${DEPLOY_SCRIPT}" status --target "$target"
          run "${DEPLOY_SCRIPT}" smoke --target "$target" --config "$config_path" --secret-dir "$secret_dir"
        else
          run "${DEPLOY_SCRIPT}" status --target "$target"
          run "${DEPLOY_SCRIPT}" smoke --target "$target" --config "$config_path" --secret-dir "$secret_dir"
          rebuild_install_state_from_live "$target" "$config_path" "$secret_dir" "$runtime_dir"
          repair_applied="true"
        fi
      fi

      payload_json="$(doctor_production_json "$target" "$repair" "$repair_applied" "$deep_check" "$(printf '%s\n' "${findings[@]}")" "$(printf '%s\n' "${actions[@]}")")"
      ;;
    *)
      die "Doctor requires --mode demo|dev|production."
      ;;
  esac

  if [[ "$json" == "true" ]]; then
    printf '%s\n' "$payload_json"
  else
    print_doctor_human "$payload_json"
    if [[ "$repair_applied" == "true" ]]; then
      case "$mode" in
        demo)
          summary_demo
          ;;
        dev)
          summary_dev
          ;;
        production)
          summary_production_lifecycle "doctor" "$target" "$config_path" "$secret_dir"
          ;;
      esac
    fi
  fi
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
  upgrade)
    run_upgrade "$@"
    ;;
  verify)
    run_verify "$@"
    ;;
  status)
    run_status "$@"
    ;;
  logs)
    run_logs "$@"
    ;;
  doctor)
    run_doctor "$@"
    ;;
  *)
    show_help
    die "Unknown command: $COMMAND"
    ;;
esac
