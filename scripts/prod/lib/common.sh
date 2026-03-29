#!/usr/bin/env bash
set -euo pipefail

# Shared constants (Phase 500 install path)
# shellcheck disable=SC2034 # Shared sourced library constant.
NETWORK_NAME="riskhub-network"
SECRET_DIR="${RISKHUB_DEFAULT_SECRET_DIR:-/etc/riskhub/secrets}"
RUNTIME_DIR="${RISKHUB_RUNTIME_DIR:-/etc/riskhub/runtime}"

# shellcheck disable=SC2034 # Shared sourced library constant.
REDIS_CONTAINER="riskhub-redis"
# shellcheck disable=SC2034 # Shared sourced library constant.
BACKEND_CONTAINER="riskhub-backend"
# shellcheck disable=SC2034 # Shared sourced library constant.
SCHEDULER_CONTAINER="riskhub-backend-scheduler"
# shellcheck disable=SC2034 # Shared sourced library constant.
FRONTEND_CONTAINER="riskhub-frontend"

# shellcheck disable=SC2034 # Shared sourced library constant.
BACKEND_LOGS_VOLUME="riskhub-backend-logs"
# shellcheck disable=SC2034 # Shared sourced library constant.
REDIS_DATA_VOLUME="riskhub-redis-data"

# Common flags (parsed by parse_common_flags)
DRY_RUN=false
YES=false
# shellcheck disable=SC2034 # Shared parsed flag reused by sourced scripts.
VERBOSE=false
# shellcheck disable=SC2034 # Shared parsed flag reused by sourced scripts.
BACKEND_ENV=""
# shellcheck disable=SC2034 # Shared parsed flag reused by sourced scripts.
FRONTEND_ENV=""
# shellcheck disable=SC2034 # Shared parsed flag reused by sourced scripts.
REMAINING_ARGS=()

timestamp() {
  date +"%Y-%m-%dT%H:%M:%S%z"
}

log() {
  printf '%s %s\n' "$(timestamp)" "$*"
}

warn() {
  printf '%s WARN: %s\n' "$(timestamp)" "$*" >&2
}

err() {
  printf '%s ERROR: %s\n' "$(timestamp)" "$*" >&2
}

die() {
  err "$*"
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

require_dir() {
  local path="$1"
  [[ -d "$path" ]] || die "Missing required directory: $path"
}

confirm_or_die() {
  local prompt="$1"
  if [[ "$YES" == "true" ]]; then
    return 0
  fi
  if [[ ! -t 0 ]]; then
    die "Refusing to proceed in non-interactive mode without --yes ($prompt)"
  fi
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

run_redacted() {
  # Usage:
  #   run_redacted "docker run ... SECRET=***" docker run ... SECRET="$SECRET"
  local display="$1"
  shift
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '+ %s\n' "$display" >&2
    return 0
  fi
  "$@"
}

docker_require_running() {
  require_cmd docker
  if ! docker ps >/dev/null 2>&1; then
    die "Docker daemon not reachable. Ensure Docker Engine is running and your user can run docker."
  fi
}

docker_network_exists() {
  docker network inspect "$1" >/dev/null 2>&1
}

docker_volume_exists() {
  docker volume inspect "$1" >/dev/null 2>&1
}

ensure_network() {
  local name="$1"
  if docker_network_exists "$name"; then
    return 0
  fi
  run docker network create "$name" >/dev/null
  log "Created docker network: $name"
}

ensure_volume() {
  local name="$1"
  if docker_volume_exists "$name"; then
    return 0
  fi
  run docker volume create "$name" >/dev/null
  log "Created docker volume: $name"
}

prepare_volume_ownership() {
  local volume_name="$1"
  local image_ref="$2"
  local mount_path="$3"
  local owner_spec="$4"

  run docker run --rm \
    --user 0:0 \
    --entrypoint sh \
    -v "${volume_name}:${mount_path}" \
    "$image_ref" \
    -lc "mkdir -p ${mount_path} && chown -R ${owner_spec} ${mount_path}"
}

container_exists() {
  docker inspect "$1" >/dev/null 2>&1
}

rm_container_if_exists() {
  local name="$1"
  if container_exists "$name"; then
    local running_state="false"
    running_state="$(docker inspect --format '{{.State.Running}}' "$name" 2>/dev/null || printf 'false')"
    if [[ "$running_state" == "true" ]]; then
      run docker stop -t 20 "$name" >/dev/null
    fi
    run docker rm "$name" >/dev/null
    log "Removed existing container: $name"
  fi
}

container_image() {
  docker inspect --format '{{.Config.Image}}' "$1" 2>/dev/null || true
}

container_label() {
  local name="$1"
  local key="$2"
  docker inspect --format "{{ index .Config.Labels \"$key\" }}" "$name" 2>/dev/null || true
}

docker_secret_mount_args() {
  require_dir "$SECRET_DIR"
  require_dir "$RUNTIME_DIR"
  printf '%s\0' \
    -v "${SECRET_DIR}:${SECRET_DIR}:ro" \
    -v "${RUNTIME_DIR}:${RUNTIME_DIR}:ro"
}

parse_common_flags() {
  # Parses the common script flags and leaves the rest in REMAINING_ARGS.
  local remaining=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --backend-env)
        # shellcheck disable=SC2034 # Shared parsed flag consumed by sourced entrypoints.
        BACKEND_ENV="${2:-}"
        shift 2
        ;;
      --frontend-env)
        # shellcheck disable=SC2034 # Shared parsed flag consumed by sourced entrypoints.
        FRONTEND_ENV="${2:-}"
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
        # shellcheck disable=SC2034 # Shared parsed flag consumed by sourced entrypoints.
        VERBOSE=true
        shift
        ;;
      --)
        shift
        # Preserve everything after -- without further parsing.
        remaining+=("$@")
        break
        ;;
      *)
        remaining+=("$1")
        shift
        ;;
    esac
  done

  # bash 3.2 + `set -u` treats "${arr[@]}" as "unbound variable" when arr is empty.
  if [[ ${#remaining[@]} -gt 0 ]]; then
    # shellcheck disable=SC2034 # Shared parsed flag consumed by sourced entrypoints.
    REMAINING_ARGS=("${remaining[@]}")
  else
    # shellcheck disable=SC2034 # Shared parsed flag consumed by sourced entrypoints.
    REMAINING_ARGS=()
  fi
}
