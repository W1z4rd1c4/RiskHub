#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/frontend"

usage() {
  cat <<'USAGE'
Usage: frontend/scripts/runtime/dev.sh [-- <vite args>]

Starts frontend development runtime only.

Options:
  -h, --help   Show help
  --           Pass remaining args to Vite (npm run dev -- ...)
USAGE
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'ERROR: Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

passthrough=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      passthrough+=("$@")
      break
      ;;
    *)
      passthrough+=("$1")
      shift
      ;;
  esac
done

require_cmd node
require_cmd npm
[[ -f "${FRONTEND_DIR}/package.json" ]] || {
  printf 'ERROR: Missing frontend/package.json at %s\n' "${FRONTEND_DIR}" >&2
  exit 1
}

cd "${FRONTEND_DIR}"
if [[ ${#passthrough[@]} -gt 0 ]]; then
  exec npm run dev -- "${passthrough[@]}"
fi
exec npm run dev
