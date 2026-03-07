#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
DEPRECATED: scripts/prod/upgrade.sh is retired and unsupported.

Use the public production CLI instead:
  ./scripts/deploy.sh upgrade --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --version <version>
  ./scripts/deploy.sh upgrade --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --backend-image <image> --frontend-image <image> --redis-image <image>

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
printf '\nERROR: scripts/prod/upgrade.sh is retired. Use ./scripts/deploy.sh instead.\n' >&2
exit 1
