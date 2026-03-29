#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${REPO_ROOT}/scripts/prod/lib/common.sh"

DEFAULT_BACKEND_ENV="${RUNTIME_DIR}/backend.env"

tag=""
workers="4"
publish_backend=""
action="auto" # auto|deploy|upgrade

usage() {
  cat <<EOF_USAGE
Usage: backend/scripts/runtime/prod.sh [options]

Component-only backend production deploy/upgrade wrapper.
Builds the backend runtime image, runs DB prod lifecycle, ensures redis, and installs/upgrades
backend API + scheduler containers only.

Options:
  --backend-env PATH     Default: ${DEFAULT_BACKEND_ENV}
  --tag TAG              Image tag (default: git short SHA, else timestamp)
  --workers N            Backend API workers (default: 4)
  --publish-backend SPEC Optional publish (API only), e.g. 127.0.0.1:8000:8000
  --action MODE          auto|deploy|upgrade (default: auto)
  --dry-run              Print actions only
  --yes                  Non-interactive confirmation
  --verbose              More logging
  -h, --help             Show help
EOF_USAGE
}

parse_common_flags "$@"
if [[ ${#REMAINING_ARGS[@]} -gt 0 ]]; then
  set -- "${REMAINING_ARGS[@]}"
else
  set --
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      tag="${2:-}"
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
    --action)
      action="${2:-}"
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

if [[ -z "${BACKEND_ENV}" ]]; then
  BACKEND_ENV="${DEFAULT_BACKEND_ENV}"
fi

if ! [[ "$workers" =~ ^[0-9]+$ ]] || (( workers < 1 )); then
  die "Invalid --workers (must be integer >= 1)"
fi

action="$(printf '%s' "$action" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ "$action" != "auto" && "$action" != "deploy" && "$action" != "upgrade" ]]; then
  die "Invalid --action (expected auto|deploy|upgrade)"
fi

docker_require_running

if [[ -z "$tag" ]]; then
  if [[ -d "${REPO_ROOT}/.git" ]] && command -v git >/dev/null 2>&1; then
    tag="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || true)"
  fi
  if [[ -z "$tag" ]]; then
    tag="$(date +%Y%m%d%H%M%S)"
  fi
fi

backend_image="riskhub-backend:${tag}"
backend_installed="false"
scheduler_installed="false"
if container_exists "$BACKEND_CONTAINER"; then backend_installed="true"; fi
if container_exists "$SCHEDULER_CONTAINER"; then scheduler_installed="true"; fi

if [[ "$action" == "auto" ]]; then
  if [[ "$backend_installed" == "true" && "$scheduler_installed" == "true" ]]; then
    action="upgrade"
  elif [[ "$backend_installed" == "false" && "$scheduler_installed" == "false" ]]; then
    action="deploy"
  else
    if [[ "$DRY_RUN" == "true" ]]; then
      warn "Inconsistent backend install state (api=${backend_installed}, scheduler=${scheduler_installed}); DRY_RUN continues with action=upgrade for preview only."
      action="upgrade"
    else
      die "Inconsistent backend install state (api=${backend_installed}, scheduler=${scheduler_installed}). Resolve containers before continuing."
    fi
  fi
fi

if [[ "$DRY_RUN" != "true" ]]; then
  if [[ "$action" == "deploy" && ( "$backend_installed" == "true" || "$scheduler_installed" == "true" ) ]]; then
    die "Backend containers already exist. Use --action upgrade or --action auto."
  fi
  if [[ "$action" == "upgrade" && ( "$backend_installed" != "true" || "$scheduler_installed" != "true" ) ]]; then
    die "Upgrade requires both backend API and scheduler containers to exist."
  fi
else
  if [[ "$action" == "deploy" && ( "$backend_installed" == "true" || "$scheduler_installed" == "true" ) ]]; then
    warn "DRY_RUN: deploy requested while backend containers already exist; previewing deploy flow only."
  fi
  if [[ "$action" == "upgrade" && ( "$backend_installed" != "true" || "$scheduler_installed" != "true" ) ]]; then
    warn "DRY_RUN: upgrade requested with missing backend/scheduler container; previewing upgrade flow only."
  fi
fi

confirm_or_die "Run backend ${action} (build image + DB lifecycle + redis + backend API/scheduler only)?"

child_flags=()
if [[ "$DRY_RUN" == "true" ]]; then child_flags+=(--dry-run); fi
if [[ "$YES" == "true" ]]; then child_flags+=(--yes); fi
if [[ "$VERBOSE" == "true" ]]; then child_flags+=(--verbose); fi

log "Building backend runtime image: ${backend_image}"
run docker build --target runtime -t "$backend_image" "${REPO_ROOT}/backend"

log "Running production DB lifecycle via backend/scripts/runtime/db/prod.sh"
db_args=(--backend-env "$BACKEND_ENV" --backend-image "$backend_image")
if [[ ${#child_flags[@]} -gt 0 ]]; then db_args+=("${child_flags[@]}"); fi
run "${REPO_ROOT}/backend/scripts/runtime/db/prod.sh" "${db_args[@]}"

log "Ensuring redis container"
redis_args=(--backend-env "$BACKEND_ENV")
if [[ ${#child_flags[@]} -gt 0 ]]; then redis_args+=("${child_flags[@]}"); fi
run "${REPO_ROOT}/scripts/prod/install_redis.sh" "${redis_args[@]}"

previous_backend_image=""
previous_scheduler_image=""
if [[ "$action" == "upgrade" ]]; then
  previous_backend_image="$(container_image "$BACKEND_CONTAINER")"
  previous_scheduler_image="$(container_image "$SCHEDULER_CONTAINER")"
fi

api_args=(--backend-env "$BACKEND_ENV" --backend-image "$backend_image" --instance api --workers "$workers")
if [[ -n "$publish_backend" ]]; then
  api_args+=(--publish-backend "$publish_backend")
fi
if [[ -n "$previous_backend_image" ]]; then
  api_args+=(--previous-image "$previous_backend_image")
fi
if [[ ${#child_flags[@]} -gt 0 ]]; then api_args+=("${child_flags[@]}"); fi

log "Installing backend API container (${action})"
run "${REPO_ROOT}/scripts/prod/install_backend.sh" "${api_args[@]}"

scheduler_args=(--backend-env "$BACKEND_ENV" --backend-image "$backend_image" --instance scheduler)
if [[ -n "$previous_scheduler_image" ]]; then
  scheduler_args+=(--previous-image "$previous_scheduler_image")
fi
if [[ ${#child_flags[@]} -gt 0 ]]; then scheduler_args+=("${child_flags[@]}"); fi

log "Installing backend scheduler container (${action})"
run "${REPO_ROOT}/scripts/prod/install_backend.sh" "${scheduler_args[@]}"

log "Backend ${action}: OK"
