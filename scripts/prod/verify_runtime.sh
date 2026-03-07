#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

usage() {
  cat <<EOF
Usage: scripts/prod/verify_runtime.sh [options]

Read-only diagnostics for Phase 500 deployments.

Options:
  --verbose   More logging
EOF
}

parse_common_flags "$@"
if [[ ${#REMAINING_ARGS[@]} -gt 0 ]]; then
  set -- "${REMAINING_ARGS[@]}"
else
  set --
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1 (use --help)"
      ;;
  esac
done

docker_require_running

log "Containers:"
run docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | grep -E "(${REDIS_CONTAINER}|${BACKEND_CONTAINER}|${SCHEDULER_CONTAINER}|${FRONTEND_CONTAINER})" || true

log "Network attachment (riskhub-network):"
run docker network inspect "$NETWORK_NAME" --format '{{json .Containers}}' || true

log "Images (current):"
for c in "$REDIS_CONTAINER" "$BACKEND_CONTAINER" "$SCHEDULER_CONTAINER" "$FRONTEND_CONTAINER"; do
  if container_exists "$c"; then
    img="$(container_image "$c")"
    prev="$(container_label "$c" "com.riskhub.previous_image")"
    log "  $c image=$img previous_image=${prev:-}"
  fi
done

if container_exists "$BACKEND_CONTAINER"; then
  log "Reliability runtime:"
  run docker exec -i "$BACKEND_CONTAINER" python - <<'PY'
import asyncio
import json
import os
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


async def main() -> None:
    db_url = Path(os.environ["DATABASE_URL_FILE"]).read_text(encoding="utf-8").strip()
    engine = create_async_engine(db_url)
    try:
        async with engine.connect() as conn:
            scheduler_runtime_rows = int(
                (
                    await conn.execute(
                        text(
                            "SELECT COUNT(*) FROM scheduler_job_runs "
                            "WHERE job_name = '__scheduler_runtime__' AND status = 'running'"
                        )
                    )
                ).scalar_one()
            )
            dead_letter_count = int(
                (
                    await conn.execute(
                        text("SELECT COUNT(*) FROM app_outbox_events WHERE status = 'dead_letter'")
                    )
                ).scalar_one()
            )
            latest_jobs = list(
                (
                    await conn.execute(
                        text(
                            "SELECT job_name, status, started_at "
                            "FROM scheduler_job_runs "
                            "WHERE job_name <> '__scheduler_runtime__' "
                            "ORDER BY started_at DESC LIMIT 5"
                        )
                    )
                ).mappings()
            )
    finally:
        await engine.dispose()

    print(
        json.dumps(
            {
                "scheduler_runtime_rows": scheduler_runtime_rows,
                "dead_letter_count": dead_letter_count,
                "latest_jobs": [dict(row) for row in latest_jobs],
            },
            sort_keys=True,
        )
    )


asyncio.run(main())
PY
fi
