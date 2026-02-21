#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d-%H%M%S)}"
ARTIFACT_ROOT="${ARTIFACT_ROOT:-$ROOT_DIR/tests/results/security/deep-gap-round5-$RUN_ID}"
OUT_DIR="$ARTIFACT_ROOT/reports"
OUT_JSON="$OUT_DIR/real-staging-replay.json"

: "${RH_STAGING_BASE_URL:?missing RH_STAGING_BASE_URL}"
: "${RH_STAGING_ADMIN_BEARER:?missing RH_STAGING_ADMIN_BEARER}"
: "${RH_STAGING_MANAGER_BEARER:?missing RH_STAGING_MANAGER_BEARER}"
: "${RH_STAGING_EMPLOYEE_BEARER:?missing RH_STAGING_EMPLOYEE_BEARER}"
: "${RH_STAGING_DEPT_A_ID:?missing RH_STAGING_DEPT_A_ID}"
: "${RH_STAGING_DEPT_B_ID:?missing RH_STAGING_DEPT_B_ID}"

PYTHON_BIN="${PYTHON_BIN:-$ROOT_DIR/backend/venv/bin/python}"
if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="python3"
fi

mkdir -p "$OUT_DIR"

"$PYTHON_BIN" "$ROOT_DIR/scripts/security/real_staging_replay.py" \
  --base-url "$RH_STAGING_BASE_URL" \
  --output "$OUT_JSON"

echo "Real staging replay artifact: $OUT_JSON"
