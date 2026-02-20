#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${REPO_ROOT}/scripts/prod/lib/common.sh"

tag=""
action="auto" # auto|deploy|upgrade

usage() {
  cat <<EOF_USAGE
Usage: frontend/scripts/runtime/prod.sh [options]

Component-only frontend production deploy/upgrade wrapper.
Builds frontend image and installs/upgrades frontend container only.

Options:
  --frontend-env PATH   Default: /etc/riskhub/frontend.env
  --tag TAG             Image tag (default: git short SHA, else timestamp)
  --action MODE         auto|deploy|upgrade (default: auto)
  --dry-run             Print actions only
  --yes                 Non-interactive confirmation
  --verbose             More logging
  -h, --help            Show help
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

if [[ -z "${FRONTEND_ENV}" ]]; then
  FRONTEND_ENV="/etc/riskhub/frontend.env"
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

frontend_image="riskhub-frontend:${tag}"
installed="false"
if container_exists "$FRONTEND_CONTAINER"; then
  installed="true"
fi

if [[ "$action" == "auto" ]]; then
  if [[ "$installed" == "true" ]]; then
    action="upgrade"
  else
    action="deploy"
  fi
fi

if [[ "$action" == "deploy" && "$installed" == "true" ]]; then
  die "Frontend container already exists (${FRONTEND_CONTAINER}). Use --action upgrade or --action auto."
fi
if [[ "$action" == "upgrade" && "$installed" == "false" ]]; then
  die "Frontend container not found (${FRONTEND_CONTAINER}). Use --action deploy or --action auto."
fi

confirm_or_die "Run frontend ${action} (build image + install frontend container only)?"

child_flags=()
if [[ "$DRY_RUN" == "true" ]]; then child_flags+=(--dry-run); fi
if [[ "$YES" == "true" ]]; then child_flags+=(--yes); fi
if [[ "$VERBOSE" == "true" ]]; then child_flags+=(--verbose); fi

previous_image=""
if [[ "$action" == "upgrade" ]]; then
  previous_image="$(container_image "$FRONTEND_CONTAINER")"
fi

log "Building frontend image: ${frontend_image}"
run docker build -t "$frontend_image" "${REPO_ROOT}/frontend"

install_args=(--frontend-env "$FRONTEND_ENV" --frontend-image "$frontend_image")
if [[ -n "$previous_image" ]]; then
  install_args+=(--previous-image "$previous_image")
fi
if [[ ${#child_flags[@]} -gt 0 ]]; then
  install_args+=("${child_flags[@]}")
fi

log "Installing frontend container (${action})"
run "${REPO_ROOT}/scripts/prod/install_frontend.sh" "${install_args[@]}"

log "Frontend ${action}: OK"
