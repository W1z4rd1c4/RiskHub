#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
DEPRECATED: scripts/prod/setup.sh is retired and unsupported.

Use the public production CLI instead:
  ./scripts/deploy.sh init --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
  ./scripts/deploy.sh preflight --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
  ./scripts/deploy.sh deploy --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --version <version>
  ./scripts/deploy.sh upgrade --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --version <version>
  ./scripts/deploy.sh rollback --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --service all

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
printf '\nERROR: scripts/prod/setup.sh is retired. Use ./scripts/deploy.sh instead.\n' >&2
exit 1
