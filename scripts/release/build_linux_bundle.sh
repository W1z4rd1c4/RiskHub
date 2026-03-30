#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

VERSION=""
OUTPUT_DIR="${REPO_ROOT}/dist/releases"

usage() {
  cat <<EOF
Usage: scripts/release/build_linux_bundle.sh --version VERSION [options]

Builds the RiskHub linux release bundle for the non-Docker production target.

Options:
  --version VERSION      Release version embedded in the bundle manifest
  --output-dir PATH      Directory for the resulting tar.gz (default: ${OUTPUT_DIR})
  -h, --help             Show this help text
EOF
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="${2:-}"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "$VERSION" ]] || {
  usage
  die "Missing --version"
}

[[ "$(uname -s)" == "Linux" ]] || die "Build the linux release bundle on Linux so the wheelhouse matches the deployment target."

require_cmd python3
require_cmd tar
require_cmd npm

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/riskhub-linux-bundle.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

STAGE_ROOT="${TMP_ROOT}/riskhub-linux-${VERSION}"
BACKEND_STAGE="${STAGE_ROOT}/backend"
FRONTEND_STAGE="${STAGE_ROOT}/frontend"
SCRIPTS_STAGE="${STAGE_ROOT}/scripts"
mkdir -p "${BACKEND_STAGE}" "${BACKEND_STAGE}/scripts" "${BACKEND_STAGE}/wheels" "${FRONTEND_STAGE}" "${SCRIPTS_STAGE}"

printf 'Building frontend dist for release %s\n' "$VERSION"
(
  cd "${REPO_ROOT}/frontend"
  npm ci
  npm run build
)

printf 'Downloading backend wheelhouse for release %s\n' "$VERSION"
python3 -m pip download \
  --only-binary=:all: \
  --dest "${BACKEND_STAGE}/wheels" \
  -r "${REPO_ROOT}/backend/requirements-db.txt"

cp -R "${REPO_ROOT}/backend/app" "${BACKEND_STAGE}/app"
cp -R "${REPO_ROOT}/backend/alembic" "${BACKEND_STAGE}/alembic"
cp "${REPO_ROOT}/backend/alembic.ini" "${BACKEND_STAGE}/alembic.ini"
cp "${REPO_ROOT}/backend/requirements-runtime.txt" "${BACKEND_STAGE}/requirements-runtime.txt"
cp "${REPO_ROOT}/backend/requirements-db.txt" "${BACKEND_STAGE}/requirements-db.txt"

cp "${REPO_ROOT}/backend/scripts/__init__.py" "${BACKEND_STAGE}/scripts/__init__.py"
cp "${REPO_ROOT}/backend/scripts/seed_roles_permissions.py" "${BACKEND_STAGE}/scripts/seed_roles_permissions.py"
cp "${REPO_ROOT}/backend/scripts/seed_departments.py" "${BACKEND_STAGE}/scripts/seed_departments.py"
cp "${REPO_ROOT}/backend/scripts/bootstrap_sso_user.py" "${BACKEND_STAGE}/scripts/bootstrap_sso_user.py"

cp -R "${REPO_ROOT}/frontend/dist" "${FRONTEND_STAGE}/dist"
cp "${REPO_ROOT}/scripts/deploy.sh" "${SCRIPTS_STAGE}/deploy.sh"
chmod 755 "${SCRIPTS_STAGE}/deploy.sh"
cp -R "${REPO_ROOT}/scripts/deploy" "${SCRIPTS_STAGE}/deploy"

find "${STAGE_ROOT}" -type d \( -name "__pycache__" -o -name ".pytest_cache" \) -prune -exec rm -rf {} +
find "${STAGE_ROOT}" -name "*.pyc" -delete
find "${STAGE_ROOT}" -name ".DS_Store" -delete

python3 - <<'PY' "${STAGE_ROOT}/manifest.json" "${VERSION}" "${REPO_ROOT}"
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

manifest_path = Path(sys.argv[1])
version = sys.argv[2]
repo_root = Path(sys.argv[3])

def git_value(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(repo_root), *args], text=True).strip()

payload = {
    "version": version,
    "created_utc": datetime.now(timezone.utc).isoformat(),
    "git_commit": git_value("rev-parse", "HEAD"),
    "git_ref": git_value("rev-parse", "--abbrev-ref", "HEAD"),
    "bundle_root": f"riskhub-linux-{version}",
}
manifest_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY

mkdir -p "${OUTPUT_DIR}"
ARCHIVE_PATH="${OUTPUT_DIR}/riskhub-linux-${VERSION}.tar.gz"
tar -czf "${ARCHIVE_PATH}" -C "${TMP_ROOT}" "riskhub-linux-${VERSION}"
printf 'Built %s\n' "${ARCHIVE_PATH}"
