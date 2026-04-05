#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/backend"

port="8000"
reload="false"
passthrough=()

usage() {
  cat <<'USAGE'
Usage: backend/scripts/runtime/test.sh [options] [-- <uvicorn args>]

Starts backend TEST runtime profile only.
This script does not run pytest and does not auto-start/reset database.
Use backend/scripts/runtime/db/test.sh separately when needed.

Options:
  --port N        Backend port (default: 8000)
  --reload        Enable uvicorn --reload for test runtime
  -h, --help      Show help
  --              Pass remaining args to uvicorn
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      port="${2:-}"
      shift 2
      ;;
    --reload)
      reload="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      passthrough+=("$@")
      break
      ;;
    *)
      passthrough+=("$1")
      shift
      ;;
  esac
done

if ! [[ "$port" =~ ^[0-9]+$ ]]; then
  printf 'ERROR: --port must be numeric\n' >&2
  exit 1
fi

[[ -d "${BACKEND_DIR}/venv" ]] || {
  printf 'ERROR: Missing backend venv at %s/venv\n' "${BACKEND_DIR}" >&2
  exit 1
}

# Test runtime startup profile defaults (startup only; not test execution).
if [[ -z "${DEBUG:-}" ]]; then export DEBUG=true; fi
if [[ -z "${MOCK_AUTH_ENABLED:-}" ]]; then export MOCK_AUTH_ENABLED=true; fi
if [[ -z "${AUTH_MODE:-}" ]]; then export AUTH_MODE=hybrid_dev; fi
if [[ -z "${DIRECTORY_PROVIDER:-}" ]]; then export DIRECTORY_PROVIDER=ad_emulator; fi
if [[ -z "${ENTRA_JIT_PROVISIONING_ENABLED:-}" ]]; then export ENTRA_JIT_PROVISIONING_ENABLED=true; fi
if [[ -z "${AUTH_SSO_ALLOW_EMAIL_LINK:-}" ]]; then export AUTH_SSO_ALLOW_EMAIL_LINK=true; fi
if [[ -z "${SECRET_KEY:-}" ]]; then export SECRET_KEY=test-secret-key-not-for-production-use; fi
if [[ -z "${DATABASE_URL:-}" ]]; then export DATABASE_URL="postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub"; fi
if [[ -z "${TEST_DATABASE_URL:-}" ]]; then export TEST_DATABASE_URL="postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub"; fi
export RISKHUB_RUNTIME_PROFILE="test"

printf 'INFO: Backend runtime is component-scoped. Database is not auto-started.\n'
printf 'INFO: Start/reset DB separately: backend/scripts/runtime/db/test.sh\n'

cd "${BACKEND_DIR}"
# shellcheck disable=SC1091
source venv/bin/activate

cmd=(uvicorn app.main:app --host 0.0.0.0 --port "$port")
if [[ "$reload" == "true" ]]; then
  cmd+=(--reload)
fi
if [[ ${#passthrough[@]} -gt 0 ]]; then
  cmd+=("${passthrough[@]}")
fi

exec "${cmd[@]}"
