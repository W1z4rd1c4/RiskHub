#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d-%H%M%S)}"
ARTIFACT_ROOT="${ARTIFACT_ROOT:-$ROOT_DIR/tests/results/security/contract-drift-remediation-$RUN_ID}"
PROTOCOL_DIR="$ARTIFACT_ROOT/protocol"
OUTPUT_JSON="$PROTOCOL_DIR/probe-results.json"
OUTPUT_CSV="$PROTOCOL_DIR/probe-triage.csv"

LOCAL_BASE_URL="${LOCAL_BASE_URL:-http://127.0.0.1:8000}"
STAGING_SIM_BASE_URL="${STAGING_SIM_BASE_URL:-http://127.0.0.1:18000}"
INCLUDE_STAGING_SIM="${INCLUDE_STAGING_SIM:-auto}"

PYTHON_BIN="${PYTHON_BIN:-$ROOT_DIR/backend/venv/bin/python}"
if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="${PYTHON_BIN_FALLBACK:-python3}"
fi

mkdir -p "$PROTOCOL_DIR"

TARGET_ARGS=(--target "local=$LOCAL_BASE_URL")
if [[ "$INCLUDE_STAGING_SIM" == "true" ]]; then
  TARGET_ARGS+=(--target "staging-sim=$STAGING_SIM_BASE_URL")
elif [[ "$INCLUDE_STAGING_SIM" == "auto" ]]; then
  if curl -fsS "$STAGING_SIM_BASE_URL/api/v1/health" >/dev/null 2>&1; then
    TARGET_ARGS+=(--target "staging-sim=$STAGING_SIM_BASE_URL")
  fi
fi

"$PYTHON_BIN" "$ROOT_DIR/scripts/security/protocol_contract_probe.py" \
  "${TARGET_ARGS[@]}" \
  --output-json "$OUTPUT_JSON" \
  --output-csv "$OUTPUT_CSV"

echo "Protocol probe outputs:"
echo "  JSON: $OUTPUT_JSON"
echo "  CSV:  $OUTPUT_CSV"
