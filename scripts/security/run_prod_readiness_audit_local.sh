#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
export PYTHONPATH="$ROOT_DIR/scripts/security${PYTHONPATH:+:$PYTHONPATH}"

exec python3 -m prod_readiness_audit.cli "$@"
