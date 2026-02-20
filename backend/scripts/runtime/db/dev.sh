#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../../.." && pwd)"

DRY_RUN=false
VERBOSE=false
COMPOSE=()

usage() {
  cat <<'USAGE'
Usage: backend/scripts/runtime/db/dev.sh [options]

Starts compose PostgreSQL database only and waits for readiness.

Options:
  --dry-run      Print actions only
  --verbose      More logging
  -h, --help     Show help
USAGE
}

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

run() {
  if [[ "$DRY_RUN" == "true" || "$VERBOSE" == "true" ]]; then
    printf '+'
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '\n'
    if [[ "$DRY_RUN" == "true" ]]; then
      return 0
    fi
  fi
  "$@"
}

docker_require_running() {
  command -v docker >/dev/null 2>&1 || die "Docker is required"
  docker info >/dev/null 2>&1 || die "Docker daemon is not reachable"
}

resolve_compose_cmd() {
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose -f "${REPO_ROOT}/docker-compose.yml")
    return 0
  fi
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose -f "${REPO_ROOT}/docker-compose.yml")
    return 0
  fi
  die "Docker Compose not found. Install docker-compose or enable 'docker compose'."
}

wait_for_db_or_die() {
  local timeout_seconds="${1:-90}"
  local start now
  start="$(date +%s)"

  while true; do
    if docker exec riskhub-db pg_isready -U riskhub >/dev/null 2>&1; then
      log "Database is ready (riskhub-db)"
      return 0
    fi
    now="$(date +%s)"
    if (( now - start >= timeout_seconds )); then
      docker logs riskhub-db --tail 200 || true
      die "Database readiness timeout"
    fi
    sleep 2
  done
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
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
      die "Unknown argument: $1 (use --help)"
      ;;
  esac
done

docker_require_running
resolve_compose_cmd

log "Starting compose database service only"
run "${COMPOSE[@]}" up -d db

if [[ "$DRY_RUN" == "true" ]]; then
  run docker exec riskhub-db pg_isready -U riskhub
  log "DRY_RUN: complete"
  exit 0
fi

wait_for_db_or_die 90
log "DB dev runtime: OK"
