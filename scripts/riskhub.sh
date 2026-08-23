#!/usr/bin/env bash
# Stable contributor command facade for RiskHub.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

print_usage() {
    cat <<'EOF'
RiskHub contributor commands

Usage: ./scripts/riskhub.sh <command> [options]

Commands:
  setup          Repair and start local development services without resetting data
  dev [options]  Start local development; forwards options such as --backend
  lint           Run frontend/backend lint plus backend mypy
  test           Run the default backend regression contract
  e2e            Run the guarded Playwright end-to-end contract
  release-check  Run the release-parity audit
  clean          Destructively remove local containers, volumes, dependencies, and test output
  help           Show this command contract

Advanced targets remain available through:
  make -f scripts/Makefile help
EOF
}

require_no_extra_args() {
    if [[ "$#" -ne 0 ]]; then
        echo "Command '$command' does not accept additional arguments." >&2
        print_usage >&2
        exit 2
    fi
}

command="${1:-help}"
if [[ "$#" -gt 0 ]]; then
    shift
fi

case "$command" in
    help|-h|--help)
        require_no_extra_args "$@"
        print_usage
        ;;
    setup)
        require_no_extra_args "$@"
        exec ./scripts/install.sh doctor --mode dev --repair
        ;;
    dev)
        exec ./scripts/install.sh dev "$@"
        ;;
    lint)
        require_no_extra_args "$@"
        exec make --no-print-directory -f scripts/Makefile lint lint-types
        ;;
    test)
        require_no_extra_args "$@"
        exec make --no-print-directory -f scripts/Makefile test
        ;;
    e2e)
        require_no_extra_args "$@"
        exec make --no-print-directory -f scripts/Makefile test-e2e
        ;;
    release-check)
        require_no_extra_args "$@"
        exec make --no-print-directory -f scripts/Makefile release-parity-audit
        ;;
    clean)
        require_no_extra_args "$@"
        exec make --no-print-directory -f scripts/Makefile clean
        ;;
    *)
        echo "Unknown RiskHub command: $command" >&2
        print_usage >&2
        exit 2
        ;;
esac