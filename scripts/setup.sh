#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

mode=""
DRY_RUN=false
YES=false
VERBOSE=false
PASSTHROUGH_ARGS=()

usage() {
  cat <<'EOF'
Usage: ./scripts/setup.sh [options] [-- <passthrough args>]

Unified RiskHub admin setup wizard. Choose one of:
  dev   - docker-compose stack (includes Postgres in Docker), migrate + base seed
  test  - docker-compose stack, WIPE DB volume, migrate + base seed + E2E seed
  prod  - delegate to scripts/prod/setup.sh (external PostgreSQL), config-only seeding

Options:
  --mode dev|test|prod   If omitted and interactive, show a menu
  --dry-run              Print actions only (no mutations)
  --yes                  Non-interactive mode (requires --mode)
  --verbose              More logging
  -h, --help             Show help

Notes:
- Dev/Test cannot run on the same host as Phase 500 prod (container name collisions).
  scripts/dev_test_setup.sh enforces this safety check.
- In non-interactive TEST mode, pass the explicit wipe acknowledgement to the child script:
  -- --i-understand-will-wipe-dev-db

Examples:
  ./scripts/setup.sh                           # interactive menu
  ./scripts/setup.sh --mode dev                # bring up dev docker stack + base seed
  ./scripts/setup.sh --mode test               # wipe and seed deterministic E2E data
  ./scripts/setup.sh --mode prod               # run the production guided installer
  ./scripts/setup.sh --mode test --yes --dry-run -- --i-understand-will-wipe-dev-db --no-build
EOF
}

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

is_interactive() {
  [[ -t 0 ]]
}

prompt_menu_choice() {
  if ! is_interactive; then
    die "Refusing to prompt in non-interactive mode. Use --yes --mode <dev|test|prod>."
  fi

  cat <<'EOF'
Select setup mode:
  1) dev  - compose stack + base seed (safe, non-destructive)
  2) test - compose stack + WIPE DB + base+E2E seed (destructive)
  3) prod - Phase 500 (external PostgreSQL) guided installer
EOF
  local choice=""
  read -r -p "Enter 1/2/3 [1]: " choice
  choice="${choice:-1}"
  case "$choice" in
    1) printf 'dev' ;;
    2) printf 'test' ;;
    3) printf 'prod' ;;
    *) die "Invalid choice: $choice" ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      mode="${2:-}"
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
      PASSTHROUGH_ARGS+=("$1")
      shift
      ;;
  esac
done

mode="$(printf '%s' "$mode" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ -z "$mode" ]]; then
  if [[ "$YES" == "true" ]]; then
    die "--yes requires --mode dev|test|prod"
  fi
  mode="$(prompt_menu_choice)"
fi

if [[ "$mode" != "dev" && "$mode" != "test" && "$mode" != "prod" ]]; then
  die "Invalid --mode (expected dev|test|prod)"
fi

common_args=()
if [[ "$DRY_RUN" == "true" ]]; then common_args+=(--dry-run); fi
if [[ "$YES" == "true" ]]; then common_args+=(--yes); fi
if [[ "$VERBOSE" == "true" ]]; then common_args+=(--verbose); fi

if [[ "$mode" == "prod" ]]; then
  log "NOTE: Prod scripts do not drop data. To start with an empty prod DB, point DATABASE_URL at a newly created database."
  prod_args=()
  if [[ ${#common_args[@]} -gt 0 ]]; then prod_args+=("${common_args[@]}"); fi
  if [[ ${#PASSTHROUGH_ARGS[@]} -gt 0 ]]; then prod_args+=("${PASSTHROUGH_ARGS[@]}"); fi
  if [[ ${#prod_args[@]} -gt 0 ]]; then
    exec "${REPO_ROOT}/scripts/prod/setup.sh" "${prod_args[@]}"
  fi
  exec "${REPO_ROOT}/scripts/prod/setup.sh"
fi

dev_args=(--mode "$mode")
if [[ ${#common_args[@]} -gt 0 ]]; then dev_args+=("${common_args[@]}"); fi
if [[ ${#PASSTHROUGH_ARGS[@]} -gt 0 ]]; then dev_args+=("${PASSTHROUGH_ARGS[@]}"); fi
exec "${REPO_ROOT}/scripts/dev_test_setup.sh" "${dev_args[@]}"
