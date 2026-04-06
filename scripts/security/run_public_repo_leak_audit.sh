#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
ARTIFACT_ROOT="${ARTIFACT_ROOT:-$ROOT_DIR/tests/results/security/public-leak-audit-$RUN_ID}"
GITLEAKS_IMAGE="${GITLEAKS_IMAGE:-zricethezav/gitleaks:v8.18.2}"
TMP_ARTIFACT_ROOT="$ROOT_DIR/tests/results/security/.tmp-public-leak-audit-$RUN_ID"

CURRENT_TREE_REPORT="$ARTIFACT_ROOT/current-tree-gitleaks.json"
HISTORY_REPORT="$ARTIFACT_ROOT/history-gitleaks.json"
CURRENT_TREE_TMP_REPORT="$TMP_ARTIFACT_ROOT/current-tree-gitleaks.json"
HISTORY_TMP_REPORT="$TMP_ARTIFACT_ROOT/history-gitleaks.json"
TRACKED_HYGIENE_REPORT="$ARTIFACT_ROOT/current-tree-hygiene.json"
PRIVACY_REPORT="$ARTIFACT_ROOT/history-private-surface-paths.json"
MESSAGE_PRIVACY_REPORT="$ARTIFACT_ROOT/history-private-message-paths.json"
TRACKED_ARTIFACTS_REPORT="$ARTIFACT_ROOT/tracked-runtime-artifacts.txt"
HISTORY_ARTIFACTS_REPORT="$ARTIFACT_ROOT/history-runtime-artifacts.txt"

mkdir -p "$ARTIFACT_ROOT"
mkdir -p "$TMP_ARTIFACT_ROOT"
trap 'rm -rf "$TMP_ARTIFACT_ROOT"' EXIT

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run the public leak audit" >&2
  exit 1
fi

run_gitleaks() {
  local report_path="$1"
  shift
  docker run --rm \
    -v "$ROOT_DIR:/repo" \
    -w /repo \
    "$GITLEAKS_IMAGE" \
    detect \
    --no-banner \
    --redact \
    --config .gitleaks.toml \
    --report-format json \
    --report-path "/repo/${report_path#$ROOT_DIR/}" \
    "$@"
}

copy_report() {
  local source_path="$1"
  local target_path="$2"
  if [[ -f "$source_path" ]]; then
    cp "$source_path" "$target_path"
  fi
}

current_tree_rc=0
history_rc=0
tracked_hygiene_rc=0
history_privacy_rc=0
history_message_rc=0

if run_gitleaks "$CURRENT_TREE_TMP_REPORT" --source /repo --no-git; then
  :
else
  current_tree_rc=$?
fi
copy_report "$CURRENT_TREE_TMP_REPORT" "$CURRENT_TREE_REPORT"

if run_gitleaks "$HISTORY_TMP_REPORT" --source /repo; then
  :
else
  history_rc=$?
fi
copy_report "$HISTORY_TMP_REPORT" "$HISTORY_REPORT"

if python3 "$ROOT_DIR/scripts/security/validate_public_repo_hygiene.py" --format json --output "$TRACKED_HYGIENE_REPORT"; then
  :
else
  tracked_hygiene_rc=$?
fi

if python3 "$ROOT_DIR/scripts/security/validate_public_repo_hygiene.py" --mode history-patches --format json --output "$PRIVACY_REPORT"; then
  :
else
  history_privacy_rc=$?
fi

if python3 "$ROOT_DIR/scripts/security/validate_public_repo_hygiene.py" --mode history-messages --format json --output "$MESSAGE_PRIVACY_REPORT"; then
  :
else
  history_message_rc=$?
fi

git -C "$ROOT_DIR" ls-files '.dev-*.pid' 'dev.sh.pid' 'scripts/runtime-artifacts/**' 'backend/logs/**' 'tests/results/**' \
  >"$TRACKED_ARTIFACTS_REPORT"

git -C "$ROOT_DIR" rev-list --objects --all | \
  rg '(^| )(\.dev-backend\.pid|\.dev-frontend\.pid|dev\.sh\.pid|scripts/runtime-artifacts/legacy/)' \
  >"$HISTORY_ARTIFACTS_REPORT" || true

python3 - "$CURRENT_TREE_REPORT" "$HISTORY_REPORT" "$TRACKED_HYGIENE_REPORT" "$PRIVACY_REPORT" "$MESSAGE_PRIVACY_REPORT" "$TRACKED_ARTIFACTS_REPORT" "$HISTORY_ARTIFACTS_REPORT" <<'PY2'
from __future__ import annotations

import json
import sys
from pathlib import Path

current_tree_report = Path(sys.argv[1])
history_report = Path(sys.argv[2])
tracked_hygiene_report = Path(sys.argv[3])
privacy_report = Path(sys.argv[4])
message_privacy_report = Path(sys.argv[5])
tracked_artifacts_report = Path(sys.argv[6])
history_artifacts_report = Path(sys.argv[7])

def _count_json_rows(path: Path) -> int:
    if not path.exists():
        return 0
    payload = json.loads(path.read_text(encoding="utf-8"))
    return len(payload) if isinstance(payload, list) else 0

def _count_hygiene_findings(path: Path) -> int:
    if not path.exists():
        return 0
    payload = json.loads(path.read_text(encoding="utf-8"))
    return int(payload.get("finding_count", 0))

def _count_lines(path: Path) -> int:
    if not path.exists():
        return 0
    return len([line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()])

print(f"current_tree_gitleaks={_count_json_rows(current_tree_report)}")
print(f"history_gitleaks={_count_json_rows(history_report)}")
print(f"tracked_hygiene_findings={_count_hygiene_findings(tracked_hygiene_report)}")
print(f"history_privacy_path_hits={_count_hygiene_findings(privacy_report)}")
print(f"history_message_privacy_hits={_count_hygiene_findings(message_privacy_report)}")
print(f"tracked_runtime_artifacts={_count_lines(tracked_artifacts_report)}")
print(f"history_runtime_artifacts={_count_lines(history_artifacts_report)}")
PY2

if [[ "$current_tree_rc" -ne 0 || "$history_rc" -ne 0 ]]; then
  echo "Public leak audit failed: gitleaks found leaks." >&2
  exit 1
fi

if [[ "$tracked_hygiene_rc" -ne 0 || "$history_privacy_rc" -ne 0 || "$history_message_rc" -ne 0 || -s "$TRACKED_ARTIFACTS_REPORT" || -s "$HISTORY_ARTIFACTS_REPORT" ]]; then
  echo "Public leak audit failed: private metadata or tracked runtime artifacts detected." >&2
  exit 1
fi

echo "Public leak audit passed. Artifacts: $ARTIFACT_ROOT"
