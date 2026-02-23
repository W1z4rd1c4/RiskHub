#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/frontend"
NODE_MAJOR_REQUIRED="24"

usage() {
  cat <<'USAGE'
Usage: frontend/scripts/runtime/test.sh [-- <vite args>]

Starts frontend TEST runtime profile only (Vite startup mode).
This script does not execute unit or E2E suites.

Options:
  -h, --help   Show help
  --           Pass remaining args to Vite (npm run dev -- --mode test ...)
USAGE
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'ERROR: Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

require_node_major_runtime() {
  local current_major
  current_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"
  if [[ "$current_major" != "$NODE_MAJOR_REQUIRED" ]]; then
    printf 'ERROR: Node %s required for parity (found %s)\n' "$NODE_MAJOR_REQUIRED" "$(node --version 2>/dev/null || echo unknown)" >&2
    printf 'Remediation: brew install node@24 && export PATH="/opt/homebrew/opt/node@24/bin:$PATH"\n' >&2
    exit 1
  fi
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
require_node_major_runtime
[[ -f "${FRONTEND_DIR}/package.json" ]] || {
  printf 'ERROR: Missing frontend/package.json at %s\n' "${FRONTEND_DIR}" >&2
  exit 1
}

cd "${FRONTEND_DIR}"
if [[ ${#passthrough[@]} -gt 0 ]]; then
  exec npm run dev -- --mode test "${passthrough[@]}"
fi
exec npm run dev -- --mode test
