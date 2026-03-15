#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

mode=""
DRY_RUN=false
YES=false
VERBOSE=false
NO_BUILD=false

usage() {
  cat <<'EOF'
Usage: ./scripts/setup.sh --mode dev|test [options]

Deprecated compatibility shim.
Use ./scripts/compose.sh directly for Docker development workflows.

Options:
  --mode dev|test
  --no-build
  --dry-run
  --yes
  --verbose
  -h, --help
EOF
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
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
    --i-understand-will-wipe-dev-db)
      shift
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --i-understand-will-wipe-dev-db)
            shift
            ;;
          *)
            die "Unknown argument: $1"
            ;;
        esac
      done
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

mode="$(printf '%s' "$mode" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ -z "$mode" ]]; then
  die "Missing --mode dev|test"
fi

if [[ "$mode" == "prod" ]]; then
  die "Production setup moved to ./scripts/deploy.sh (use ./scripts/deploy.sh init --target docker|linux)."
fi

if [[ "$mode" != "dev" && "$mode" != "test" ]]; then
  die "Invalid --mode (expected dev|test)"
fi

printf 'Deprecated: use ./scripts/compose.sh directly.\n' >&2

args=()
if [[ "$NO_BUILD" == "true" ]]; then args+=(--no-build); fi
if [[ "$DRY_RUN" == "true" ]]; then args+=(--dry-run); fi
if [[ "$YES" == "true" ]]; then args+=(--yes); fi
if [[ "$VERBOSE" == "true" ]]; then args+=(--verbose); fi

if [[ "$mode" == "dev" ]]; then
  exec "${REPO_ROOT}/scripts/compose.sh" up "${args[@]}"
fi

exec "${REPO_ROOT}/scripts/compose.sh" reset --dataset test "${args[@]}"
