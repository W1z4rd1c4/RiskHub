#!/bin/bash
# Run Playwright with timeout/watchdog and artifact-based verdict classification.
# Usage:
#   ./scripts/run_playwright_with_watchdog.sh [playwright args...]
# Env:
#   PLAYWRIGHT_TIMEOUT_SECONDS (default: 5400)
#   PLAYWRIGHT_GRACE_SECONDS   (default: 30)
#   PLAYWRIGHT_WORKERS         (default: 5)
#   PLAYWRIGHT_RETRIES         (default: 0)
#   PLAYWRIGHT_RUN_LABEL       (default: timestamp)
#   PLAYWRIGHT_ARTIFACT_BASE   (default: /tmp/riskhub-playwright-watchdog)

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

TIMEOUT_SECONDS="${PLAYWRIGHT_TIMEOUT_SECONDS:-5400}"
GRACE_SECONDS="${PLAYWRIGHT_GRACE_SECONDS:-30}"
WORKERS="${PLAYWRIGHT_WORKERS:-5}"
RETRIES="${PLAYWRIGHT_RETRIES:-0}"
RUN_LABEL="${PLAYWRIGHT_RUN_LABEL:-$(date +%Y%m%d-%H%M%S)}"
ARTIFACT_BASE="${PLAYWRIGHT_ARTIFACT_BASE:-/tmp/riskhub-playwright-watchdog}"
ARTIFACT_ROOT="$ARTIFACT_BASE/$RUN_LABEL"

LOG_FILE="$ARTIFACT_ROOT/playwright.log"
SUMMARY_FILE="$ARTIFACT_ROOT/summary.txt"
JUNIT_COPY="$ARTIFACT_ROOT/junit.xml"
JSON_COPY="$ARTIFACT_ROOT/results.json"
HTML_COPY="$ARTIFACT_ROOT/playwright-report"

mkdir -p "$ARTIFACT_ROOT"

cd "$FRONTEND_DIR"

# Clear default reporter outputs to avoid stale verdicts.
rm -rf "$FRONTEND_DIR/playwright-report"
rm -f "$FRONTEND_DIR/test-results/junit.xml" "$FRONTEND_DIR/test-results/results.json"

CMD=(npx playwright test --workers="$WORKERS" --retries="$RETRIES" "$@")

{
  echo "run_label=$RUN_LABEL"
  echo "started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "cwd=$FRONTEND_DIR"
  echo "timeout_seconds=$TIMEOUT_SECONDS"
  echo "grace_seconds=$GRACE_SECONDS"
  echo "workers=$WORKERS"
  echo "retries=$RETRIES"
  echo "command=CI=1 ${CMD[*]}"
} >"$SUMMARY_FILE"

CI=1 "${CMD[@]}" >"$LOG_FILE" 2>&1 &
PW_PID=$!
PGID="$(ps -o pgid= "$PW_PID" | tr -d '[:space:]')"

timed_out=0
start_epoch="$(date +%s)"
last_heartbeat=0

while kill -0 "$PW_PID" >/dev/null 2>&1; do
  now_epoch="$(date +%s)"
  elapsed="$((now_epoch - start_epoch))"
  if [ "$elapsed" -ge "$TIMEOUT_SECONDS" ]; then
    timed_out=1
    break
  fi
  if [ "$((elapsed - last_heartbeat))" -ge 30 ]; then
    echo "watchdog=running elapsed_seconds=$elapsed pid=$PW_PID"
    last_heartbeat="$elapsed"
  fi
  sleep 1
done

if [ "$timed_out" -eq 1 ]; then
  echo "watchdog=timeout after ${TIMEOUT_SECONDS}s; sending SIGTERM to process group $PGID" >>"$SUMMARY_FILE"
  kill -TERM "-$PGID" >/dev/null 2>&1 || true
  grace_start="$(date +%s)"
  while kill -0 "$PW_PID" >/dev/null 2>&1; do
    if [ "$(( $(date +%s) - grace_start ))" -ge "$GRACE_SECONDS" ]; then
      echo "watchdog=force_kill after ${GRACE_SECONDS}s grace; sending SIGKILL to process group $PGID" >>"$SUMMARY_FILE"
      kill -KILL "-$PGID" >/dev/null 2>&1 || true
      break
    fi
    sleep 1
  done
fi

set +e
wait "$PW_PID"
PW_EXIT="$?"
set -e

end_epoch="$(date +%s)"
duration="$((end_epoch - start_epoch))"

# Re-create artifact directory in case an external process cleaned it during execution.
mkdir -p "$ARTIFACT_ROOT"

# Persist artifacts regardless of process exit.
if [ -f "$FRONTEND_DIR/test-results/junit.xml" ]; then
  cp "$FRONTEND_DIR/test-results/junit.xml" "$JUNIT_COPY"
fi
if [ -f "$FRONTEND_DIR/test-results/results.json" ]; then
  cp "$FRONTEND_DIR/test-results/results.json" "$JSON_COPY"
fi
if [ -d "$FRONTEND_DIR/playwright-report" ]; then
  cp -R "$FRONTEND_DIR/playwright-report" "$HTML_COPY"
fi

# Parse JUnit if available for artifact-based verdict.
tests=0
failures=0
errors=0
skipped=0
junit_present=0
expected_tests=0
if [ -f "$JUNIT_COPY" ]; then
  junit_present=1
  read -r tests failures errors skipped <<EOF_PARSE
$(python3 - "$JUNIT_COPY" <<'PY'
import sys
import xml.etree.ElementTree as ET

path = sys.argv[1]
root = ET.parse(path).getroot()
nodes = []
if root.tag == "testsuite":
    nodes = [root]
elif root.tag == "testsuites":
    nodes = root.findall("testsuite")

tests = failures = errors = skipped = 0
for n in nodes:
    tests += int(n.attrib.get("tests", 0))
    failures += int(n.attrib.get("failures", 0))
    errors += int(n.attrib.get("errors", 0))
    skipped += int(n.attrib.get("skipped", 0))

print(f"{tests} {failures} {errors} {skipped}")
PY
)
EOF_PARSE
fi

if [ -f "$LOG_FILE" ]; then
  expected_tests="$(grep -Eo 'Running [0-9]+ tests' "$LOG_FILE" | head -n 1 | awk '{print $2}' || true)"
  expected_tests="${expected_tests:-0}"
fi

verdict="unknown"
if [ "$junit_present" -eq 1 ]; then
  if [ "$failures" -gt 0 ] || [ "$errors" -gt 0 ]; then
    verdict="fail"
  elif [ "$tests" -eq 0 ]; then
    verdict="fail_no_tests"
  elif [ "$expected_tests" -gt 0 ] && [ "$tests" -lt "$expected_tests" ]; then
    verdict="fail_incomplete"
  elif [ "$PW_EXIT" -eq 0 ]; then
    verdict="pass"
  elif [ "$timed_out" -eq 1 ]; then
    verdict="pass_with_timeout_teardown"
  else
    verdict="fail_nonzero_exit"
  fi
else
  if [ "$PW_EXIT" -eq 0 ]; then
    verdict="pass_no_junit"
  else
    verdict="fail_no_junit"
  fi
fi

{
  echo "ended_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "duration_seconds=$duration"
  echo "process_exit_code=$PW_EXIT"
  echo "timed_out=$timed_out"
  echo "junit_present=$junit_present"
  echo "tests=$tests"
  echo "expected_tests=$expected_tests"
  echo "failures=$failures"
  echo "errors=$errors"
  echo "skipped=$skipped"
  echo "verdict=$verdict"
  echo "log_file=$LOG_FILE"
  echo "junit_file=$JUNIT_COPY"
  echo "json_file=$JSON_COPY"
  echo "html_report=$HTML_COPY"
} >>"$SUMMARY_FILE"

echo "Playwright watchdog summary: $SUMMARY_FILE"
cat "$SUMMARY_FILE"

if [[ "$verdict" == fail* ]]; then
  exit 1
fi

exit 0
