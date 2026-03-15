#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

COMMAND="${1:-}"
PROFILE="full"
LAN_IP=""
NO_BUILD=false
WITH_VOLUMES=false
DATASET=""
LOG_SERVICE=""
DRY_RUN=false
VERBOSE=false
COMPOSE=()

usage() {
  cat <<'EOF'
Usage:
  ./scripts/compose.sh up [--profile full|db-only] [--lan <ip>] [--no-build]
  ./scripts/compose.sh down [--volumes]
  ./scripts/compose.sh logs [service]
  ./scripts/compose.sh reset --dataset dev|test [--no-build]

Canonical Docker onboarding/appliance path for RiskHub development.
EOF
}

timestamp() {
  date +"%Y-%m-%dT%H:%M:%S%z"
}

log() {
  printf '%s %s\n' "$(timestamp)" "$*"
}

die() {
  printf '%s ERROR: %s\n' "$(timestamp)" "$*" >&2
  exit 1
}

run() {
  if [[ "$DRY_RUN" == "true" || "$VERBOSE" == "true" ]]; then
    printf '+'
    local arg
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

wait_for_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is required"
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
    log "Docker daemon is not ready. Launching Docker Desktop..."
    open -a Docker || true
  fi

  log "Waiting for Docker daemon..."
  local attempt=0
  while [ "$attempt" -lt 90 ]; do
    if docker info >/dev/null 2>&1; then
      log "Docker daemon is ready."
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done

  die "Docker daemon is unavailable. Start Docker and retry."
}

resolve_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose -f "${REPO_ROOT}/docker-compose.yml")
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose -f "${REPO_ROOT}/docker-compose.yml")
    return 0
  fi
  die "Docker Compose not found. Install docker-compose or enable 'docker compose'."
}

container_exists() {
  docker inspect "$1" >/dev/null 2>&1
}

container_label() {
  local name="$1"
  local key="$2"
  docker inspect --format "{{ index .Config.Labels \"$key\" }}" "$name" 2>/dev/null || true
}

refuse_if_phase500_prod_present() {
  # Compose never creates the scheduler container; if it exists, prod has been deployed.
  if container_exists "riskhub-backend-scheduler"; then
    die "Phase 500 prod appears installed (container riskhub-backend-scheduler exists). Dev Docker cannot run on the same host."
  fi

  if container_exists "riskhub-backend"; then
    local managed_by
    managed_by="$(container_label "riskhub-backend" "com.riskhub.managed_by")"
    if [[ "$managed_by" == "scripts/prod" ]]; then
      die "Phase 500 prod appears installed (riskhub-backend label com.riskhub.managed_by=scripts/prod). Dev Docker cannot run on the same host."
    fi
  fi
}

compose_run() {
  local profile="${1:-}"
  shift

  local cmd=("${COMPOSE[@]}")
  if [[ -n "$profile" ]]; then
    cmd+=(--profile "$profile")
  fi

  if [[ -n "$LAN_IP" ]]; then
    run env "LAN_HOST=${LAN_IP}" "${cmd[@]}" "$@"
  else
    run "${cmd[@]}" "$@"
  fi
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
      die "Database readiness timeout."
    fi
    sleep 2
  done
}

wait_for_redis_or_die() {
  local timeout_seconds="${1:-90}"
  local start now
  start="$(date +%s)"

  while true; do
    if docker exec riskhub-redis redis-cli ping >/dev/null 2>&1; then
      log "Redis is ready (riskhub-redis)"
      return 0
    fi
    now="$(date +%s)"
    if (( now - start >= timeout_seconds )); then
      docker logs riskhub-redis --tail 200 || true
      die "Redis readiness timeout."
    fi
    sleep 2
  done
}

smoke_check_or_die() {
  command -v curl >/dev/null 2>&1 || die "curl is required for smoke checks"

  log "Smoke check: backend health"
  if ! curl -fsS "http://localhost:8000/api/v1/health" >/dev/null; then
    docker logs riskhub-backend --tail 200 || true
    die "Backend health endpoint not reachable."
  fi

  log "Smoke check: frontend"
  if ! curl -fsS "http://localhost:80/" >/dev/null; then
    docker logs riskhub-frontend --tail 200 || true
    die "Frontend not reachable."
  fi
}

start_infra() {
  local profile="$1"
  local up_args=(up -d)
  if [[ "$NO_BUILD" != "true" ]]; then
    up_args+=(--build)
  fi
  up_args+=(db redis)

  log "Starting Docker infra (profile=${profile})"
  compose_run "$profile" "${up_args[@]}"

  if [[ "$DRY_RUN" == "true" ]]; then
    run docker exec riskhub-db pg_isready -U riskhub
    run docker exec riskhub-redis redis-cli ping
    return 0
  fi

  wait_for_db_or_die 90
  wait_for_redis_or_die 90
}

run_bootstrap() {
  local bootstrap_command="${1:-}"
  local run_args=(run --rm)
  if [[ "$NO_BUILD" != "true" ]]; then
    run_args+=(--build)
  fi
  run_args+=(bootstrap)

  log "Running development bootstrap (migrations + base seed)"
  if [[ -n "$bootstrap_command" ]]; then
    compose_run "full" "${run_args[@]}" sh -lc "$bootstrap_command"
  else
    compose_run "full" "${run_args[@]}"
  fi
}

start_full_stack() {
  local mode_label="$1"
  local bootstrap_command="$2"

  start_infra "full"
  run_bootstrap "$bootstrap_command"

  local up_args=(up -d)
  if [[ "$NO_BUILD" != "true" ]]; then
    up_args+=(--build)
  fi
  up_args+=(backend frontend)

  log "Starting frontend and backend containers"
  compose_run "full" "${up_args[@]}"

  if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY_RUN: ${mode_label} flow assembled."
    return 0
  fi

  smoke_check_or_die

  log "Startup complete"
  log "  Frontend: http://localhost/"
  log "  Backend:  http://localhost:8000/api/v1/health"
  log "  Database: localhost:5432"
  log "  Demo login: http://localhost/login"
}

if [[ -z "$COMMAND" ]]; then
  usage
  exit 1
fi
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2:-}"
      shift 2
      ;;
    --lan)
      LAN_IP="${2:-}"
      shift 2
      ;;
    --no-build)
      NO_BUILD=true
      shift
      ;;
    --volumes)
      WITH_VOLUMES=true
      shift
      ;;
    --dataset)
      DATASET="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --yes)
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ "$COMMAND" == "logs" && -z "$LOG_SERVICE" ]]; then
        LOG_SERVICE="$1"
        shift
      else
        die "Unknown argument: $1"
      fi
      ;;
  esac
done

case "$COMMAND" in
  up)
    [[ "$PROFILE" == "full" || "$PROFILE" == "db-only" ]] || die "--profile must be full or db-only"
    if [[ -n "$LAN_IP" && "$PROFILE" != "full" ]]; then
      die "--lan is only supported with --profile full"
    fi

    wait_for_docker
    resolve_compose_cmd
    refuse_if_phase500_prod_present

    if [[ "$PROFILE" == "db-only" ]]; then
      start_infra "db-only"
      if [[ "$DRY_RUN" != "true" ]]; then
        log "Startup complete"
        log "  Database: localhost:5432"
        log "  Redis:    localhost:6379"
      fi
    else
      start_full_stack "full" ""
    fi
    ;;
  down)
    wait_for_docker
    resolve_compose_cmd
    down_args=(down --remove-orphans)
    if [[ "$WITH_VOLUMES" == "true" ]]; then
      down_args+=(-v)
    fi
    log "Stopping Docker dev stack"
    compose_run "full" "${down_args[@]}"
    ;;
  logs)
    wait_for_docker
    resolve_compose_cmd
    log_args=(logs -f)
    if [[ -n "$LOG_SERVICE" ]]; then
      log_args+=("$LOG_SERVICE")
    fi
    compose_run "full" "${log_args[@]}"
    ;;
  reset)
    [[ -n "$DATASET" ]] || die "reset requires --dataset dev|test"
    [[ "$DATASET" == "dev" || "$DATASET" == "test" ]] || die "--dataset must be dev or test"
    wait_for_docker
    resolve_compose_cmd
    refuse_if_phase500_prod_present

    log "Resetting Docker dev stack (dataset=${DATASET})"
    compose_run "full" down -v --remove-orphans

    if [[ "$DATASET" == "dev" ]]; then
      start_full_stack "reset-dev" ""
    else
      start_full_stack \
        "reset-test" \
        "python -m alembic upgrade head && python -m app.db.seed && python -m scripts.seed_e2e_all"
      if [[ "$DRY_RUN" != "true" ]]; then
        log "  Dataset: deterministic E2E fixtures seeded"
      fi
    fi
    ;;
  *)
    usage
    die "Unknown command: ${COMMAND}"
    ;;
esac
