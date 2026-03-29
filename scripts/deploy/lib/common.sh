#!/usr/bin/env bash
set -euo pipefail

DEPLOY_LIB_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${DEPLOY_LIB_DIR}/../../.." && pwd)"
RENDERER="${DEPLOY_LIB_DIR}/render.py"
# shellcheck disable=SC2034 # Shared sourced library constant.
DEFAULT_CONFIG_PATH="${RISKHUB_DEFAULT_CONFIG_PATH:-/etc/riskhub/riskhub.env}"
DEFAULT_SECRET_DIR="${RISKHUB_DEFAULT_SECRET_DIR:-/etc/riskhub/secrets}"
SECRET_DIR="${DEFAULT_SECRET_DIR}"
RUNTIME_DIR="${RISKHUB_RUNTIME_DIR:-/etc/riskhub/runtime}"
LINUX_ROOT="${RISKHUB_LINUX_ROOT:-/opt/riskhub}"
# shellcheck disable=SC2034 # Shared sourced library constant.
LINUX_RELEASES_DIR="${LINUX_ROOT}/releases"
LINUX_CURRENT_LINK="${LINUX_ROOT}/current"
# shellcheck disable=SC2034 # Shared sourced library constant.
LINUX_PREVIOUS_LINK="${LINUX_ROOT}/previous"
LINUX_USER="${RISKHUB_LINUX_USER:-riskhub}"
LINUX_GROUP="${RISKHUB_LINUX_GROUP:-riskhub}"
LINUX_UID="${RISKHUB_LINUX_UID:-10001}"
LINUX_GID="${RISKHUB_LINUX_GID:-10001}"
# shellcheck disable=SC2034 # Shared sourced library constant.
LINUX_BACKEND_SERVICE="${RISKHUB_LINUX_BACKEND_SERVICE:-riskhub-backend}"
# shellcheck disable=SC2034 # Shared sourced library constant.
LINUX_SCHEDULER_SERVICE="${RISKHUB_LINUX_SCHEDULER_SERVICE:-riskhub-scheduler}"
LINUX_REDIS_SERVICE="${RISKHUB_LINUX_REDIS_SERVICE:-riskhub-redis}"
# shellcheck disable=SC2034 # Shared sourced library constant.
LINUX_NGINX_SITE="${RISKHUB_LINUX_NGINX_SITE:-/etc/nginx/conf.d/riskhub.conf}"
# shellcheck disable=SC2034 # Shared sourced library constant.
LINUX_BACKEND_ENV="${RISKHUB_LINUX_BACKEND_ENV:-${RUNTIME_DIR}/backend.env}"

DRY_RUN=false
YES=false
# shellcheck disable=SC2034 # Parsed global flag shared across sourced deploy helpers.
VERBOSE=false

timestamp() {
  date +"%Y-%m-%dT%H:%M:%S%z"
}

log() {
  printf '%s %s\n' "$(timestamp)" "$*"
}

dry_run_trace() {
  printf '%s\n' "$*" >&2
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

require_file() {
  local path="$1"
  [[ -f "$path" ]] || die "Missing required file: $path"
}

confirm_or_die() {
  local prompt="$1"
  if [[ "$YES" == "true" ]]; then
    return 0
  fi
  if [[ ! -t 0 ]]; then
    die "Refusing to proceed in non-interactive mode without --yes ($prompt)"
  fi
  local answer=""
  read -r -p "$prompt [y/N] " answer
  case "${answer:-}" in
    y|Y|yes|YES) return 0 ;;
    *) die "Aborted." ;;
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

run_sh() {
  local display="$1"
  local command_text="$2"
  if [[ "$DRY_RUN" == "true" ]]; then
    dry_run_trace "+ ${display}"
    return 0
  fi
  bash -lc "$command_text"
}

run_redacted() {
  local display="$1"
  shift
  if [[ "$DRY_RUN" == "true" ]]; then
    dry_run_trace "+ ${display}"
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

run_privileged_sh() {
  local display="$1"
  local command_text="$2"
  if [[ "$EUID" -eq 0 ]]; then
    run_sh "$display" "$command_text"
    return 0
  fi
  require_cmd sudo
  if [[ "$DRY_RUN" == "true" ]]; then
    dry_run_trace "+ sudo ${display}"
    return 0
  fi
  sudo bash -lc "$command_text"
}

ensure_dir() {
  local path="$1"
  if [[ -d "$path" || -w "$(dirname "$path")" ]]; then
    run mkdir -p "$path"
  else
    run_privileged mkdir -p "$path"
  fi
}

copy_file() {
  local src="$1"
  local dest="$2"
  local mode="${3:-644}"
  ensure_dir "$(dirname "$dest")"
  if [[ -e "$dest" ]]; then
    if [[ -w "$dest" ]]; then
      run cp "$src" "$dest"
      run chmod "$mode" "$dest"
      return 0
    elif [[ -w "$(dirname "$dest")" ]]; then
      run rm -f "$dest"
      run cp "$src" "$dest"
      run chmod "$mode" "$dest"
      return 0
    fi
  elif [[ -w "$(dirname "$dest")" ]]; then
    run cp "$src" "$dest"
    run chmod "$mode" "$dest"
    return 0
  fi
  run_privileged cp "$src" "$dest"
  run_privileged chmod "$mode" "$dest"
}

write_file_content() {
  local dest="$1"
  local content="$2"
  local mode="${3:-644}"
  local dest_dir
  dest_dir="$(dirname "$dest")"
  ensure_dir "$dest_dir"
  if [[ "$DRY_RUN" == "true" ]]; then
    dry_run_trace "+ write content to $(printf '%q' "$dest") (mode ${mode})"
    return 0
  fi
  local tmp_file
  tmp_file="$(make_temp_file_in_parent_dir "$dest_dir" "riskhub-write")"
  local rc=0
  {
    printf '%s' "$content" >"$tmp_file"
    copy_file "$tmp_file" "$dest" "$mode"
  } || rc=$?
  cleanup_temp_file "$tmp_file"
  return "$rc"
}

should_use_privileged_ownership() {
  local path="$1"
  if [[ "$EUID" -eq 0 ]]; then
    return 0
  fi
  if [[ -e "$path" ]]; then
    [[ ! -w "$path" && ! -w "$(dirname "$path")" ]]
    return $?
  fi
  [[ ! -w "$(dirname "$path")" ]]
}

path_stat_json() {
  local path="$1"
  python3 - <<'PY' "$path"
import json
import stat
import sys
from pathlib import Path

target = Path(sys.argv[1])
st = target.stat()
print(json.dumps({"uid": st.st_uid, "gid": st.st_gid, "mode": stat.S_IMODE(st.st_mode)}))
PY
}

secret_placeholder() {
  local name="$1"
  case "$name" in
    database_url) printf '%s\n' "CHANGE_ME_DATABASE_URL" ;;
    secret_key) printf '%s\n' "CHANGE_ME_SECRET_KEY_AT_LEAST_32_CHARACTERS" ;;
    entra_client_secret) printf '%s\n' "CHANGE_ME_ENTRA_CLIENT_SECRET" ;;
    entra_client_certificate_private_key) printf '%s\n' "CHANGE_ME_ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY" ;;
    redis_password) printf '%s\n' "CHANGE_ME_REDIS_PASSWORD" ;;
    *) die "Unknown secret placeholder request: $name" ;;
  esac
}

secret_path() {
  local name="$1"
  printf '%s/%s\n' "$SECRET_DIR" "$name"
}

ensure_secret_dir_scaffold() {
  ensure_dir "$SECRET_DIR"
  if should_use_privileged_ownership "$SECRET_DIR"; then
    ensure_linux_user
    run_privileged chmod 750 "$SECRET_DIR"
    run_privileged chown root:"$LINUX_GROUP" "$SECRET_DIR"
  else
    run chmod 750 "$SECRET_DIR"
  fi
}

ensure_runtime_dir_scaffold() {
  ensure_dir "$RUNTIME_DIR"
  if should_use_privileged_ownership "$RUNTIME_DIR"; then
    ensure_linux_user
    run_privileged chmod 750 "$RUNTIME_DIR"
    run_privileged chown root:"$LINUX_GROUP" "$RUNTIME_DIR"
  else
    run chmod 750 "$RUNTIME_DIR"
  fi
}

write_runtime_secret_file() {
  local name="$1"
  local value="$2"
  local dest="${RUNTIME_DIR}/${name}"
  ensure_runtime_dir_scaffold
  write_file_content "$dest" "${value}" 440
  if should_use_privileged_ownership "$dest"; then
    ensure_linux_user
    run_privileged chown root:"$LINUX_GROUP" "$dest"
    run_privileged chmod 440 "$dest"
  fi
}

write_runtime_env_file() {
  local name="$1"
  local value="$2"
  local dest="${RUNTIME_DIR}/${name}"
  ensure_runtime_dir_scaffold
  write_file_content "$dest" "${value}" 640
  if should_use_privileged_ownership "$dest"; then
    ensure_linux_user
    run_privileged chown root:"$LINUX_GROUP" "$dest"
    run_privileged chmod 640 "$dest"
  fi
}

copy_runtime_file() {
  local src="$1"
  local dest="$2"
  local mode="${3:-640}"
  ensure_runtime_dir_scaffold
  copy_file "$src" "$dest" "$mode"
  if should_use_privileged_ownership "$dest"; then
    ensure_linux_user
    run_privileged chown root:"$LINUX_GROUP" "$dest"
    run_privileged chmod "$mode" "$dest"
  fi
}

render_runtime_dir() {
  local config_path="$1"
  local target="$2"
  local out_dir="$3"
  mkdir -p "$out_dir"
  python3 "$RENDERER" write-runtime \
    --config "$config_path" \
    --target "$target" \
    --secret-dir "$SECRET_DIR" \
    --runtime-dir "$RUNTIME_DIR" \
    --out-dir "$out_dir"
}

render_runtime_to_persistent_dir() {
  local config_path="$1"
  local target="$2"
  local tmp_dir
  tmp_dir="$(make_temp_dir_in_parent_dir "$(runtime_parent_dir)" "riskhub-runtime-render")"
  local rc=0

  {
    render_runtime_dir "$config_path" "$target" "$tmp_dir"
    copy_runtime_file "${tmp_dir}/backend.env" "${RUNTIME_DIR}/backend.env" 640
    copy_runtime_file "${tmp_dir}/frontend.env" "${RUNTIME_DIR}/frontend.env" 640
    copy_runtime_file "${tmp_dir}/metadata.env" "${RUNTIME_DIR}/metadata.env" 640
    copy_runtime_file "${tmp_dir}/redis_url" "${RUNTIME_DIR}/redis_url" 440
  } || rc=$?

  cleanup_temp_dir "$tmp_dir"
  return "$rc"
}

warn_if_path_not_encrypted_mount() {
  local path="$1"
  if ! command -v findmnt >/dev/null 2>&1 || ! command -v lsblk >/dev/null 2>&1; then
    return 0
  fi
  local source
  source="$(findmnt -no SOURCE --target "$path" 2>/dev/null || true)"
  if [[ -z "$source" || "$source" != /dev/* ]]; then
    return 0
  fi
  local block_type
  block_type="$(lsblk -no TYPE "$source" 2>/dev/null | head -n 1 | tr -d '[:space:]')"
  if [[ -n "$block_type" && "$block_type" != "crypt" ]]; then
    warn "${path} does not appear to be on an encrypted mount (${source}, type=${block_type}). Use host disk encryption for at-rest secret protection."
  fi
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "(:|\\])${port}$"
    return $?
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -q ":${port} "
    return $?
  fi
  return 2
}

check_bind_port() {
  local port="$1"
  local allow_in_use="${2:-false}"
  local in_use_rc=0
  if port_in_use "$port"; then
    if [[ "$allow_in_use" == "true" ]]; then
      warn "Bind port ${port} is already in use; continuing because replacement mode is enabled."
    else
      die "Bind port ${port} appears to be in use on this host."
    fi
  else
    in_use_rc=$?
    if [[ "$in_use_rc" -eq 2 ]]; then
      warn "Could not determine whether port ${port} is already in use (no ss/lsof)."
    fi
  fi
}

make_runtime_dir() {
  local config_path="$1"
  local target="$2"
  local tmp_dir
  tmp_dir="$(make_temp_dir_in_parent_dir "$(runtime_parent_dir)" "riskhub-deploy")"
  render_runtime_dir "$config_path" "$target" "$tmp_dir"
  printf '%s\n' "$tmp_dir"
}

source_metadata_env() {
  local runtime_dir="$1"
  # shellcheck disable=SC1090,SC1091
  source "${runtime_dir}/metadata.env"
}

cleanup_runtime_dir() {
  local runtime_dir="$1"
  if [[ -n "$runtime_dir" && -d "$runtime_dir" ]]; then
    rm -rf "$runtime_dir"
  fi
}

runtime_parent_dir() {
  printf '%s\n' "$(dirname "$RUNTIME_DIR")"
}

make_temp_file_in_parent_dir() {
  local parent_dir="$1"
  local prefix="${2:-riskhub-write}"
  ensure_dir "$parent_dir"

  local template="${parent_dir}/.${prefix}.XXXXXX"
  local tmp_file=""
  if [[ -w "$parent_dir" || "$EUID" -eq 0 ]]; then
    tmp_file="$(mktemp "$template")"
    chmod 600 "$tmp_file"
    printf '%s\n' "$tmp_file"
    return 0
  fi

  require_cmd sudo
  tmp_file="$(sudo mktemp "$template")"
  sudo chown "$EUID:$(id -g)" "$tmp_file"
  sudo chmod 600 "$tmp_file"
  printf '%s\n' "$tmp_file"
}

cleanup_temp_file() {
  local tmp_file="$1"
  if [[ -z "$tmp_file" || ! -e "$tmp_file" ]]; then
    return 0
  fi
  if [[ -w "$tmp_file" || -w "$(dirname "$tmp_file")" ]]; then
    rm -f "$tmp_file"
    return 0
  fi
  run_privileged rm -f "$tmp_file"
}

make_temp_dir_in_parent_dir() {
  local parent_dir="$1"
  local prefix="$2"
  ensure_dir "$parent_dir"

  local template="${parent_dir}/.${prefix}.XXXXXX"
  local tmp_dir=""
  if [[ -w "$parent_dir" || "$EUID" -eq 0 ]]; then
    tmp_dir="$(mktemp -d "$template")"
    chmod 700 "$tmp_dir"
    printf '%s\n' "$tmp_dir"
    return 0
  fi

  require_cmd sudo
  tmp_dir="$(sudo mktemp -d "$template")"
  sudo chown "$EUID:$(id -g)" "$tmp_dir"
  sudo chmod 700 "$tmp_dir"
  printf '%s\n' "$tmp_dir"
}

cleanup_temp_dir() {
  local tmp_dir="$1"
  if [[ -z "$tmp_dir" || ! -d "$tmp_dir" ]]; then
    return 0
  fi
  if [[ -w "$tmp_dir" || -w "$(dirname "$tmp_dir")" ]]; then
    rm -rf "$tmp_dir"
    return 0
  fi
  run_privileged rm -rf "$tmp_dir"
}

envfile_loader_snippet() {
  local envfile="$1"
  local quoted_envfile
  quoted_envfile="$(printf '%q' "$envfile")"
  cat <<EOF
while IFS= read -r line || [[ -n "\$line" ]]; do
  case "\$line" in
    ""|\#*) continue ;;
    *=*)
      key=\${line%%=*}
      value=\${line#*=}
      export "\$key=\$value"
      ;;
  esac
done < ${quoted_envfile}
EOF
}

git_remote_owner() {
  if [[ ! -d "${REPO_ROOT}/.git" ]]; then
    return 1
  fi
  local remote_url
  remote_url="$(git -C "$REPO_ROOT" config --get remote.origin.url 2>/dev/null || true)"
  if [[ -z "$remote_url" ]]; then
    return 1
  fi
  python3 - <<'PY' "$remote_url"
import re
import sys

url = sys.argv[1].strip()
match = re.search(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/.]+)(?:\.git)?$", url, re.IGNORECASE)
if not match:
    raise SystemExit(1)
print(match.group("owner").lower())
PY
}

resolve_default_image() {
  local kind="$1"
  local version="$2"
  local owner
  owner="$(git_remote_owner || true)"
  if [[ -z "$owner" ]]; then
    die "Unable to derive default GHCR image namespace from git remote. Pass explicit --backend-image/--frontend-image/--redis-image values."
  fi
  printf 'ghcr.io/%s/riskhub-%s:%s\n' "$owner" "$kind" "$version"
}

ensure_linux_user() {
  if id -u "$LINUX_USER" >/dev/null 2>&1; then
    return 0
  fi
  run_privileged groupadd --system --gid "$LINUX_GID" "$LINUX_GROUP"
  run_privileged useradd --system --uid "$LINUX_UID" --gid "$LINUX_GROUP" --home-dir "$LINUX_ROOT" --shell /usr/sbin/nologin "$LINUX_USER"
}

render_linux_site() {
  local config_path="$1"
  local out_path="$2"
  python3 "$RENDERER" render-linux-site --config "$config_path" --release-root "$LINUX_CURRENT_LINK" >"$out_path"
}

render_linux_nginx_full() {
  local config_path="$1"
  local out_path="$2"
  python3 "$RENDERER" render-linux-nginx-full --config "$config_path" --release-root "$LINUX_CURRENT_LINK" >"$out_path"
}

render_linux_backend_unit() {
  local config_path="$1"
  local out_path="$2"
  python3 "$RENDERER" \
    render-linux-backend-unit \
    --config "$config_path" \
    --current-link "$LINUX_CURRENT_LINK" \
    --runtime-dir "$RUNTIME_DIR" \
    --redis-service "$LINUX_REDIS_SERVICE" >"$out_path"
}

render_linux_scheduler_unit() {
  local _config_path="$1"
  local out_path="$2"
  python3 "$RENDERER" \
    render-linux-scheduler-unit \
    --current-link "$LINUX_CURRENT_LINK" \
    --runtime-dir "$RUNTIME_DIR" \
    --redis-service "$LINUX_REDIS_SERVICE" >"$out_path"
}

render_linux_redis_unit() {
  local out_path="$1"
  python3 "$RENDERER" render-linux-redis-unit --secret-dir "$SECRET_DIR" >"$out_path"
}

bundle_version() {
  local bundle_path="$1"
  python3 "$RENDERER" bundle-version --bundle "$bundle_path"
}
