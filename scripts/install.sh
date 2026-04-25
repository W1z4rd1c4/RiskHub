#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
CLI="${SCRIPT_DIR}/install_cli.py"

if ! command -v python3 >/dev/null 2>&1; then
  printf 'ERROR: Missing required command: python3\n' >&2
  exit 1
fi

cd "${REPO_ROOT}"
exec python3 "${CLI}" "$@"
