#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
DEPRECATED: scripts/prod/stop.sh is retired and unsupported.

Use the public production CLI instead:
  ./scripts/deploy.sh status --target docker
  ./scripts/deploy.sh logs --target docker --service all --tail 200
  ./scripts/deploy.sh rollback --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --service all

Direct stop/remove operations are maintainer-only and are no longer a supported admin workflow.

See:
  docs/deployment/production.md
  docs/deployment/reference.md
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

usage >&2
printf '\nERROR: scripts/prod/stop.sh is retired. Use ./scripts/deploy.sh instead.\n' >&2
exit 1
