#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/prod/lib/preflight.sh
source "${SCRIPT_DIR}/lib/preflight.sh"

instance="api" # api|scheduler
backend_image=""
workers=""
publish_backend=""
previous_image=""

usage() {
  cat <<EOF
Usage: scripts/prod/install_backend.sh --backend-env PATH --backend-image IMAGE [options]

Installs backend containers:
- api:        $BACKEND_CONTAINER (network alias: backend, ENABLE_SCHEDULER=false)
- scheduler:  $SCHEDULER_CONTAINER (ENABLE_SCHEDULER=true, workers forced to 1)

Options:
  --backend-env PATH         Path to backend.env
  --backend-image IMAGE      Backend image ref (e.g. riskhub-backend:1.0.0)
  --instance api|scheduler   Which backend instance to install (default: api)
  --workers N                API worker count (default: 4). Ignored for scheduler (forced to 1)
  --publish-backend SPEC     Optional host publish for API only (e.g. 127.0.0.1:8000:8000)
  --previous-image IMAGE     Optional label value recorded for rollback (com.riskhub.previous_image)
  --dry-run                  Print commands without executing
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
    --instance)
      instance="${2:-}"
      shift 2
      ;;
    --workers)
      workers="${2:-}"
      shift 2
      ;;
    --publish-backend)
      publish_backend="${2:-}"
      shift 2
      ;;
    --previous-image)
      previous_image="${2:-}"
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

if [[ "$instance" != "api" && "$instance" != "scheduler" ]]; then
  die "Invalid --instance (expected api|scheduler)"
fi

ensure_network "$NETWORK_NAME"
ensure_volume "$BACKEND_LOGS_VOLUME"

redis_password="$(envfile_get "$BACKEND_ENV" "REDIS_PASSWORD" || true)"
if [[ -z "$redis_password" ]]; then
  die "REDIS_PASSWORD is required in backend env"
fi
redis_url="redis://:${redis_password}@redis:6379/0"

container_name="$BACKEND_CONTAINER"
network_alias_args=(--network "$NETWORK_NAME")
enable_scheduler="false"
role_label="backend-api"

if [[ "$instance" == "scheduler" ]]; then
  container_name="$SCHEDULER_CONTAINER"
  enable_scheduler="true"
  role_label="backend-scheduler"
  # Force single worker for scheduler safety.
  workers="1"
  if [[ -n "$publish_backend" ]]; then
    die "--publish-backend is not supported for scheduler instance"
  fi
else
  # API instance
  if [[ -z "$workers" ]]; then
    workers="4"
  fi
  network_alias_args+=(--network-alias backend)
fi

if ! [[ "$workers" =~ ^[0-9]+$ ]]; then
  die "Invalid --workers (must be numeric)"
fi
if [[ "$instance" == "scheduler" && "$workers" != "1" ]]; then
  die "Scheduler instance must run with --workers 1"
fi

rm_container_if_exists "$container_name"

publish_args=()
if [[ -n "$publish_backend" ]]; then
  publish_args=(-p "$publish_backend")
fi

label_args=(
  --label "com.riskhub.managed_by=scripts/prod"
  --label "com.riskhub.role=${role_label}"
)
if [[ -n "$previous_image" ]]; then
  label_args+=(--label "com.riskhub.previous_image=${previous_image}")
fi

log "Installing backend container: $container_name (instance=$instance workers=$workers scheduler=$enable_scheduler)"

run_redacted \
  "docker run -d --name $container_name ... --env-file $BACKEND_ENV -e REDIS_URL=*** -e ENABLE_SCHEDULER=$enable_scheduler $backend_image uvicorn ... --workers $workers" \
  docker run -d \
  --name "$container_name" \
  --restart unless-stopped \
  --security-opt no-new-privileges \
  "${label_args[@]}" \
  "${network_alias_args[@]}" \
  "${publish_args[@]}" \
  -v "${BACKEND_LOGS_VOLUME}:/app/logs" \
  --env-file "$BACKEND_ENV" \
  -e "REDIS_URL=${redis_url}" \
  -e "ENABLE_SCHEDULER=${enable_scheduler}" \
  "$backend_image" \
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "$workers"

log "Backend install: OK ($container_name)"
