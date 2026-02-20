#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

mode=""
NO_BUILD=false
I_UNDERSTAND_WIPE=false

DRY_RUN=false
YES=false
VERBOSE=false

PASSTHROUGH_ARGS=()
COMPOSE=()

usage() {
  cat <<EOF
Usage: scripts/dev_test_setup.sh --mode dev|test [options]

Dev/Test docker-compose setup:
- dev:  bring up compose stack, run migrations, seed base demo data
- test: wipe compose volumes, bring up stack, run migrations, seed base + E2E data

Options:
  --mode dev|test
  --no-build
  --i-understand-will-wipe-dev-db   Required for --mode test when --yes is used
  --dry-run
  --yes
  --verbose
  -h, --help
EOF
}

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

docker_require_running() {
  require_cmd docker
  if ! docker info >/dev/null 2>&1; then
    die "Docker daemon not reachable. Start Docker and ensure your user can run docker."
  fi
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
    die "Phase 500 prod appears installed (container riskhub-backend-scheduler exists). Dev/Test cannot run on the same host. Stop/remove prod containers or use a separate host."
  fi

  if container_exists "riskhub-backend"; then
    managed_by="$(container_label "riskhub-backend" "com.riskhub.managed_by")"
    if [[ "$managed_by" == "scripts/prod" ]]; then
      die "Phase 500 prod appears installed (riskhub-backend label com.riskhub.managed_by=scripts/prod). Dev/Test cannot run on the same host. Stop/remove prod containers or use a separate host."
    fi
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
      log "Database did not become ready within ${timeout_seconds}s. Recent logs:"
      docker logs riskhub-db --tail 200 || true
      die "Database readiness timeout."
    fi
    sleep 2
  done
}

smoke_check_or_die() {
  require_cmd curl

  log "Smoke check: backend health"
  if ! curl -fsS "http://localhost:8000/api/v1/health" >/dev/null; then
    log "Backend smoke check failed. Recent backend logs:"
    docker logs riskhub-backend --tail 200 || true
    die "Backend health endpoint not reachable."
  fi

  log "Smoke check: frontend"
  if ! curl -fsS "http://localhost:80/" >/dev/null; then
    log "Frontend smoke check failed. Recent frontend logs:"
    docker logs riskhub-frontend --tail 200 || true
    die "Frontend not reachable."
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      mode="${2:-}"
      shift 2
      ;;
    --no-build)
      NO_BUILD=true
      shift
      ;;
    --i-understand-will-wipe-dev-db)
      I_UNDERSTAND_WIPE=true
      shift
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
      VERBOSE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      PASSTHROUGH_ARGS+=("$@")
      break
      ;;
    *)
      die "Unknown argument: $1 (use --help). (Note: passthrough is not supported here; call via ./scripts/setup.sh if needed.)"
      ;;
  esac
done

mode="$(printf '%s' "$mode" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ "$mode" != "dev" && "$mode" != "test" ]]; then
  die "Missing/invalid --mode (expected dev|test)"
fi

docker_require_running
resolve_compose_cmd
refuse_if_phase500_prod_present

if [[ "$mode" == "test" ]]; then
  if [[ "$YES" == "true" && "$I_UNDERSTAND_WIPE" != "true" ]]; then
    die "--mode test with --yes requires --i-understand-will-wipe-dev-db"
  fi

  log "TEST mode: will wipe docker-compose volumes (destructive)."
  confirm_or_die "Proceed with TEST wipe (docker compose down -v) and full reseed?"

  run "${COMPOSE[@]}" down -v --remove-orphans
fi

up_args=(up -d)
if [[ "$NO_BUILD" != "true" ]]; then
  up_args+=(--build)
fi
up_args+=(db redis backend frontend)

log "Starting compose stack (mode=$mode)"
run "${COMPOSE[@]}" "${up_args[@]}"

if [[ "$DRY_RUN" == "true" ]]; then
  log "DRY_RUN: would wait for database readiness"
  run docker exec riskhub-db pg_isready -U riskhub
  log "DRY_RUN: would run migrations"
  run "${COMPOSE[@]}" exec -T backend alembic upgrade head
  log "DRY_RUN: would seed base demo data"
  run "${COMPOSE[@]}" exec -T backend python -m app.db.seed
  if [[ "$mode" == "test" ]]; then
    log "DRY_RUN: would seed E2E deterministic data"
    run "${COMPOSE[@]}" exec -T backend python -m scripts.seed_e2e_all
  fi
  log "DRY_RUN: complete (no mutations performed)."
  exit 0
fi

log "Waiting for database readiness"
wait_for_db_or_die 90

log "Running migrations inside backend container"
if ! "${COMPOSE[@]}" exec -T backend alembic upgrade head; then
  log "Migrations failed. Recent backend logs:"
  docker logs riskhub-backend --tail 200 || true
  die "Migrations failed."
fi

log "Seeding base demo data (python -m app.db.seed)"
if ! "${COMPOSE[@]}" exec -T backend python -m app.db.seed; then
  log "Base seed failed. Recent backend logs:"
  docker logs riskhub-backend --tail 200 || true
  die "Base seed failed."
fi

if [[ "$mode" == "test" ]]; then
  log "Seeding E2E deterministic data (python -m scripts.seed_e2e_all)"
  if ! "${COMPOSE[@]}" exec -T backend python -m scripts.seed_e2e_all; then
    log "E2E seed failed. Recent backend logs:"
    docker logs riskhub-backend --tail 200 || true
    die "E2E seed failed."
  fi
fi

log "Running smoke checks"
smoke_check_or_die

log "Setup complete"
log "  Frontend: http://localhost/"
log "  Backend:  http://localhost:8000/api/v1/health"
if [[ "$mode" == "dev" ]]; then
  log "  Mode: dev (demo login expected to work at http://localhost/login)"
else
  log "  Mode: test (E2E deterministic dataset seeded)"
fi
