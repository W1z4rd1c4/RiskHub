#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=scripts/prod/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/prod/lib/preflight.sh
source "${SCRIPT_DIR}/lib/preflight.sh"

DEFAULT_BACKEND_ENV="/etc/riskhub/backend.env"
DEFAULT_FRONTEND_ENV="/etc/riskhub/frontend.env"

tag=""
workers="4"

public_url=""
frontend_host_port=""
database_url=""
entra_tenant_id=""
entra_client_id=""

bootstrap_admin_email=""
bootstrap_admin_role="admin" # fixed to admin in this wizard (CRO has its own bootstrap email)
bootstrap_cro_email=""

entra_jit="" # true|false
entra_allowed_domains="" # comma-separated domains (optional)

action="auto" # auto|deploy|upgrade|exit

usage() {
  cat <<EOF
Usage: scripts/prod/setup.sh [options]

Guided Phase 500 production setup:
- prompts for required production settings,
- generates strong secrets,
- writes /etc/riskhub/backend.env and /etc/riskhub/frontend.env by default,
- runs preflight checks,
- then runs deploy.sh (or offers upgrade.sh if already installed).

Common flags:
  --backend-env PATH           Default: ${DEFAULT_BACKEND_ENV}
  --frontend-env PATH          Default: ${DEFAULT_FRONTEND_ENV}
  --dry-run                   Do not write to /etc; write temp env files and preview deploy/upgrade only
  --yes                       Non-interactive mode (no prompts). Requires --action and all required inputs.
  --verbose                   More logging

Non-interactive inputs (optional in interactive mode):
  --tag TAG
  --workers N
  --public-url URL            Origin only, e.g. https://riskhub.example.com
  --frontend-host-port PORT   Default: 80
  --database-url URL          Full postgresql+asyncpg URL (external PostgreSQL)
  --entra-tenant-id GUID
  --entra-client-id GUID
  --bootstrap-admin-email EMAIL
  --bootstrap-admin-role admin      Fixed to admin in this wizard (CRO uses --bootstrap-cro-email)
  --bootstrap-cro-email EMAIL
  --entra-jit true|false
  --entra-allowed-domains "a.com,b.com"
  --action auto|deploy|upgrade|exit
EOF
}

log_kv_redacted() {
  local key="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    log "  ${key}="
    return 0
  fi
  log "  ${key}=*** (len=${#value})"
}

is_guid() {
  local value="$1"
  [[ "$value" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]
}

normalize_bool() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | xargs)"
  case "$value" in
    true|t|yes|y|1) printf 'true' ;;
    false|f|no|n|0) printf 'false' ;;
    *) return 1 ;;
  esac
}

require_interactive_or_die() {
  if [[ "$YES" == "true" ]]; then
    die "Refusing to prompt in --yes mode. Provide required flags."
  fi
  if [[ ! -t 0 ]]; then
    die "Refusing to prompt in non-interactive mode. Use --yes and provide required flags."
  fi
}

prompt_value() {
  local prompt="$1"
  local default="${2:-}"
  local value=""
  require_interactive_or_die
  if [[ -n "$default" ]]; then
    read -r -p "${prompt} [${default}]: " value
    value="${value:-$default}"
  else
    read -r -p "${prompt}: " value
  fi
  printf '%s' "$value"
}

prompt_yes_no() {
  local prompt="$1"
  local default_bool="$2" # true|false
  local default_label="y/N"
  if [[ "$default_bool" == "true" ]]; then
    default_label="Y/n"
  fi
  require_interactive_or_die
  local answer=""
  read -r -p "${prompt} [${default_label}] " answer
  answer="$(printf '%s' "${answer:-}" | tr '[:upper:]' '[:lower:]' | xargs)"
  if [[ -z "$answer" ]]; then
    printf '%s' "$default_bool"
    return 0
  fi
  case "$answer" in
    y|yes) printf 'true' ;;
    n|no) printf 'false' ;;
    *) die "Invalid response (expected y/n)." ;;
  esac
}

validate_public_url_or_die() {
  local url="$1"
  url="$(printf '%s' "$url" | xargs)"
  url="${url%/}"
  if [[ -z "$url" ]]; then
    die "PUBLIC_URL is required"
  fi
  if ! [[ "$url" =~ ^https?://[^/]+$ ]]; then
    die "PUBLIC_URL must be an origin only (no path), e.g. https://riskhub.example.com"
  fi
}

url_hostname() {
  local url="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY' "$url"
import sys
from urllib.parse import urlparse

u = sys.argv[1]
p = urlparse(u)
host = p.hostname or ""
print(host)
PY
    return 0
  fi

  # Fallback parsing (best-effort).
  local host="${url#http://}"
  host="${host#https://}"
  host="${host%%/*}"
  host="${host##*@}"
  host="${host%%:*}"
  printf '%s' "$host"
}

validate_database_url_or_die() {
  local url="$1"
  url="$(printf '%s' "$url" | xargs)"
  if [[ -z "$url" ]]; then
    die "DATABASE_URL is required"
  fi
  if [[ "$url" == "postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub" ]]; then
    die "DATABASE_URL must not be the default placeholder (refusing)."
  fi
  if [[ "$url" == *"@db:"* ]]; then
    die "DATABASE_URL appears to target compose hostname 'db'. Phase 500 requires external PostgreSQL."
  fi
  if [[ "$url" != postgresql+asyncpg://* ]]; then
    warn "DATABASE_URL does not start with 'postgresql+asyncpg://'. Ensure this is a valid async SQLAlchemy URL."
  fi
}

validate_port_or_die() {
  local port="$1"
  if ! [[ "$port" =~ ^[0-9]+$ ]]; then
    die "Frontend host port must be numeric"
  fi
  if (( port < 1 || port > 65535 )); then
    die "Frontend host port must be between 1 and 65535"
  fi
}

validate_workers_or_die() {
  local w="$1"
  if ! [[ "$w" =~ ^[0-9]+$ ]]; then
    die "--workers must be numeric"
  fi
  if (( w < 1 )); then
    die "--workers must be >= 1"
  fi
}

validate_email_or_die() {
  local email="$1"
  email="$(printf '%s' "$email" | xargs)"
  if [[ -z "$email" || "$email" != *"@"* ]]; then
    die "Invalid bootstrap email"
  fi
}

validate_role_or_die() {
  local role
  role="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | xargs)"
  if [[ "$role" != "admin" && "$role" != "cro" ]]; then
    die "Invalid bootstrap role (expected admin|cro)"
  fi
}

json_array_from_csv() {
  # Input: "a.com,b.com"
  # Output: ["a.com","b.com"]
  local csv="$1"
  csv="$(printf '%s' "$csv" | xargs)"
  if [[ -z "$csv" ]]; then
    printf '[]'
    return 0
  fi
  local out="["
  local first=true
  local item
  IFS=',' read -r -a parts <<<"$csv"
  for item in "${parts[@]}"; do
    item="$(printf '%s' "$item" | xargs)"
    if [[ -z "$item" ]]; then
      continue
    fi
    # Minimal JSON string escape for quotes and backslashes.
    item="${item//\\/\\\\}"
    item="${item//\"/\\\"}"
    if [[ "$first" == "true" ]]; then
      first=false
    else
      out+=","
    fi
    out+="\"${item}\""
  done
  out+="]"
  printf '%s' "$out"
}

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n'
    return 0
  fi
  require_cmd head
  require_cmd base64
  head -c 48 /dev/urandom | base64 | tr -d '\n'
}

print_docker_install_help() {
  local os_name="unknown"
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release || true
    os_name="${ID:-unknown}"
  fi

  cat <<EOF
Docker is required for Phase 500 installation.

Remediation:
- Install Docker Engine / Docker Desktop
- Start the Docker daemon/service
- Ensure your user can run docker (Linux): add to docker group, then log out/in

OS hint: ${os_name}

Common commands (Linux):
  sudo systemctl enable --now docker
  sudo usermod -aG docker "\$USER"
  # then log out/in or restart your session

Docs:
  https://docs.docker.com/engine/install/
EOF
}

check_docker_or_die_with_help() {
  if ! command -v docker >/dev/null 2>&1; then
    print_docker_install_help
    exit 1
  fi
  if ! docker ps >/dev/null 2>&1; then
    print_docker_install_help
    exit 1
  fi
}

needs_sudo_for_path() {
  local path="$1"
  local dir
  dir="$(dirname "$path")"
  if [[ "$EUID" -eq 0 ]]; then
    return 1
  fi
  if [[ -w "$dir" ]]; then
    return 1
  fi
  return 0
}

require_sudo_or_die() {
  if command -v sudo >/dev/null 2>&1; then
    return 0
  fi
  die "sudo is required to write to the requested env paths. Re-run as root or set --backend-env/--frontend-env to a writable directory."
}

ensure_dir() {
  local dir="$1"
  if [[ -d "$dir" ]]; then
    return 0
  fi
  if [[ "$EUID" -eq 0 ]]; then
    mkdir -p "$dir"
    return 0
  fi
  if [[ -w "$(dirname "$dir")" ]]; then
    mkdir -p "$dir"
    return 0
  fi
  require_sudo_or_die
  sudo mkdir -p "$dir"
}

atomic_install_600() {
  # Copy src -> tmp in destination dir, chmod 600, then mv into place.
  local src="$1"
  local dest="$2"
  local dest_dir dest_base tmp
  dest_dir="$(dirname "$dest")"
  dest_base="$(basename "$dest")"

  ensure_dir "$dest_dir"

  if needs_sudo_for_path "$dest"; then
    require_sudo_or_die
    tmp="$(sudo mktemp "${dest_dir}/.${dest_base}.tmp.XXXXXX")"
    sudo chmod 600 "$tmp"
    sudo cp "$src" "$tmp"
    sudo mv -f "$tmp" "$dest"
    return 0
  fi

  tmp="$(mktemp "${dest_dir}/.${dest_base}.tmp.XXXXXX")"
  chmod 600 "$tmp"
  cp "$src" "$tmp"
  mv -f "$tmp" "$dest"
}

parse_common_flags "$@"
if [[ ${#REMAINING_ARGS[@]} -gt 0 ]]; then
  set -- "${REMAINING_ARGS[@]}"
else
  set --
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      tag="${2:-}"
      shift 2
      ;;
    --workers)
      workers="${2:-}"
      shift 2
      ;;
    --public-url)
      public_url="${2:-}"
      shift 2
      ;;
    --frontend-host-port)
      frontend_host_port="${2:-}"
      shift 2
      ;;
    --database-url)
      database_url="${2:-}"
      shift 2
      ;;
    --entra-tenant-id)
      entra_tenant_id="${2:-}"
      shift 2
      ;;
    --entra-client-id)
      entra_client_id="${2:-}"
      shift 2
      ;;
    --bootstrap-admin-email)
      bootstrap_admin_email="${2:-}"
      shift 2
      ;;
    --bootstrap-admin-role)
      bootstrap_admin_role="${2:-}"
      shift 2
      ;;
    --bootstrap-cro-email)
      bootstrap_cro_email="${2:-}"
      shift 2
      ;;
    --entra-jit)
      entra_jit="${2:-}"
      shift 2
      ;;
    --entra-allowed-domains)
      entra_allowed_domains="${2:-}"
      shift 2
      ;;
    --action)
      action="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1 (use --help)"
      ;;
  esac
done

if [[ -z "$BACKEND_ENV" ]]; then
  BACKEND_ENV="$DEFAULT_BACKEND_ENV"
fi
if [[ -z "$FRONTEND_ENV" ]]; then
  FRONTEND_ENV="$DEFAULT_FRONTEND_ENV"
fi

validate_workers_or_die "$workers"

action="$(printf '%s' "$action" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ "$action" != "auto" && "$action" != "deploy" && "$action" != "upgrade" && "$action" != "exit" ]]; then
  die "Invalid --action (expected auto|deploy|upgrade|exit)"
fi

if [[ "$YES" == "true" ]]; then
  if [[ "$action" == "auto" ]]; then
    die "--yes mode requires an explicit --action (deploy|upgrade|exit)"
  fi

  # Avoid prompting in non-interactive mode (use safe defaults where defined).
  if [[ -z "$frontend_host_port" ]]; then
    frontend_host_port="80"
  fi

  missing_required=()
  if [[ -z "$public_url" ]]; then missing_required+=(--public-url); fi
  if [[ -z "$database_url" ]]; then missing_required+=(--database-url); fi
  if [[ -z "$entra_tenant_id" ]]; then missing_required+=(--entra-tenant-id); fi
  if [[ -z "$entra_client_id" ]]; then missing_required+=(--entra-client-id); fi
  if [[ -z "$bootstrap_admin_email" ]]; then missing_required+=(--bootstrap-admin-email); fi
  if [[ -z "$bootstrap_cro_email" ]]; then missing_required+=(--bootstrap-cro-email); fi

  if [[ ${#missing_required[@]} -gt 0 ]]; then
    die "Missing required flags in --yes mode: ${missing_required[*]}"
  fi
fi

check_docker_or_die_with_help

if [[ "$YES" != "true" ]]; then
  log "RiskHub Phase 500 guided setup"
  log "Repo root: $REPO_ROOT"
fi

if [[ -z "$public_url" ]]; then
  public_url="$(prompt_value "Public base URL (origin only, used for CORS and Entra redirect URI)" "")"
fi
public_url="$(printf '%s' "$public_url" | xargs)"
public_url="${public_url%/}"
validate_public_url_or_die "$public_url"

host_name="$(url_hostname "$public_url")"
if [[ -z "$host_name" ]]; then
  die "Could not derive hostname from PUBLIC_URL"
fi

if [[ -z "$frontend_host_port" ]]; then
  frontend_host_port="$(prompt_value "Frontend host port" "80")"
fi
frontend_host_port="$(printf '%s' "$frontend_host_port" | xargs)"
validate_port_or_die "$frontend_host_port"

if [[ -z "$database_url" ]]; then
  database_url="$(prompt_value "External PostgreSQL DATABASE_URL (paste full postgresql+asyncpg://...)" "")"
fi
validate_database_url_or_die "$database_url"

if [[ -z "$entra_tenant_id" ]]; then
  entra_tenant_id="$(prompt_value "ENTRA_TENANT_ID (GUID)" "")"
fi
entra_tenant_id="$(printf '%s' "$entra_tenant_id" | xargs)"
if ! is_guid "$entra_tenant_id"; then
  die "Invalid ENTRA_TENANT_ID (expected GUID)"
fi

if [[ -z "$entra_client_id" ]]; then
  entra_client_id="$(prompt_value "ENTRA_CLIENT_ID (GUID)" "")"
fi
entra_client_id="$(printf '%s' "$entra_client_id" | xargs)"
if ! is_guid "$entra_client_id"; then
  die "Invalid ENTRA_CLIENT_ID (expected GUID)"
fi

if [[ -z "$bootstrap_admin_email" ]]; then
  bootstrap_admin_email="$(prompt_value "Bootstrap admin email (SSO safety; must match Entra email)" "")"
fi
validate_email_or_die "$bootstrap_admin_email"

if [[ -z "$bootstrap_admin_role" ]]; then
  bootstrap_admin_role="admin"
fi
bootstrap_admin_role="$(printf '%s' "$bootstrap_admin_role" | tr '[:upper:]' '[:lower:]' | xargs)"
validate_role_or_die "$bootstrap_admin_role"
if [[ "$bootstrap_admin_role" != "admin" ]]; then
  die "BOOTSTRAP_ADMIN_ROLE must be 'admin' for scripts/prod/setup.sh. Provide a separate --bootstrap-cro-email for CRO bootstrap."
fi

if [[ -z "$bootstrap_cro_email" ]]; then
  bootstrap_cro_email="$(prompt_value "Bootstrap CRO email (SSO safety; must match Entra email)" "")"
fi
validate_email_or_die "$bootstrap_cro_email"

admin_email_lc="$(printf '%s' "$bootstrap_admin_email" | tr '[:upper:]' '[:lower:]' | xargs)"
cro_email_lc="$(printf '%s' "$bootstrap_cro_email" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ -n "$admin_email_lc" && "$admin_email_lc" == "$cro_email_lc" ]]; then
  die "Bootstrap admin and CRO emails must be different (got the same email for both)."
fi

normalized_entra_jit="$(normalize_bool "$entra_jit" 2>/dev/null || true)"
if [[ -n "$entra_jit" && -z "$normalized_entra_jit" ]]; then
  die "Invalid --entra-jit (expected true|false)"
fi
entra_jit="$normalized_entra_jit"
if [[ -z "$entra_jit" ]]; then
  if [[ "$YES" == "true" ]]; then
    entra_jit="true"
  else
    entra_jit="$(prompt_yes_no "Enable Entra JIT provisioning? (creates users on first SSO login; safe default role)" "true")"
  fi
fi

allowed_domains_json="[]"
if [[ -n "$entra_allowed_domains" ]]; then
  allowed_domains_json="$(json_array_from_csv "$entra_allowed_domains")"
else
  if [[ "$YES" != "true" ]]; then
    if [[ "$(prompt_yes_no "Restrict allowed email domains for Entra logins?" "false")" == "true" ]]; then
      entra_allowed_domains="$(prompt_value "Allowed email domains (comma-separated, e.g. yourcompany.com,subsidiary.com)" "")"
      allowed_domains_json="$(json_array_from_csv "$entra_allowed_domains")"
    fi
  fi
fi

redirect_uri="${public_url}/auth/sso/callback"

secret_key="$(gen_secret)"
redis_password="$(gen_secret)"

backend_env_intended="$BACKEND_ENV"
frontend_env_intended="$FRONTEND_ENV"

setup_tmp_dir=""
backend_env_local=""
frontend_env_local=""
cleanup() {
  if [[ -n "$backend_env_local" && -f "$backend_env_local" ]]; then rm -f "$backend_env_local" || true; fi
  if [[ -n "$frontend_env_local" && -f "$frontend_env_local" ]]; then rm -f "$frontend_env_local" || true; fi
}
trap cleanup EXIT

if [[ "$DRY_RUN" == "true" ]]; then
  if [[ "$BACKEND_ENV" == /etc/* || "$FRONTEND_ENV" == /etc/* ]]; then
    setup_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/riskhub-setup.XXXXXX")"
    BACKEND_ENV="${setup_tmp_dir}/backend.env"
    FRONTEND_ENV="${setup_tmp_dir}/frontend.env"
    log "DRY_RUN: would write backend env to ${backend_env_intended} (writing temp: ${BACKEND_ENV})"
    log "DRY_RUN: would write frontend env to ${frontend_env_intended} (writing temp: ${FRONTEND_ENV})"
  else
    log "DRY_RUN: writing env files to provided paths:"
    log "  backend: ${BACKEND_ENV}"
    log "  frontend: ${FRONTEND_ENV}"
  fi
fi

backend_env_local="$(mktemp "${TMPDIR:-/tmp}/riskhub-backend.env.XXXXXX")"
frontend_env_local="$(mktemp "${TMPDIR:-/tmp}/riskhub-frontend.env.XXXXXX")"

chmod 600 "$backend_env_local" "$frontend_env_local"

cat >"$backend_env_local" <<EOF
DEBUG=false
MOCK_AUTH_ENABLED=false
AUTH_MODE=microsoft_sso

SECRET_KEY=${secret_key}
DATABASE_URL=${database_url}

CORS_ORIGINS=["${public_url}"]
ALLOWED_HOSTS=["${host_name}"]

REDIS_PASSWORD=${redis_password}
REDIS_URL=

ENTRA_TENANT_ID=${entra_tenant_id}
ENTRA_CLIENT_ID=${entra_client_id}
ENTRA_JIT_PROVISIONING_ENABLED=${entra_jit}
ENTRA_ALLOWED_EMAIL_DOMAINS=${allowed_domains_json}

BOOTSTRAP_ADMIN_EMAIL=${bootstrap_admin_email}
BOOTSTRAP_ADMIN_ROLE=admin
BOOTSTRAP_ADMIN_ACCESS_SCOPE=global

BOOTSTRAP_CRO_EMAIL=${bootstrap_cro_email}
BOOTSTRAP_CRO_ACCESS_SCOPE=global
EOF

cat >"$frontend_env_local" <<EOF
FRONTEND_HOST_PORT=${frontend_host_port}
FRONTEND_CONTAINER_PORT=80
SERVER_NAME=${host_name}
EOF

atomic_install_600 "$backend_env_local" "$BACKEND_ENV"
atomic_install_600 "$frontend_env_local" "$FRONTEND_ENV"

log "Generated configuration (values redacted):"
log_kv_redacted "SECRET_KEY" "$secret_key"
log "  DATABASE_URL=***"
log "  PUBLIC_URL=${public_url}"
log "  FRONTEND_HOST_PORT=${frontend_host_port}"
log "  ENTRA_TENANT_ID=${entra_tenant_id}"
log "  ENTRA_CLIENT_ID=${entra_client_id}"
log "  ENTRA_REDIRECT_URI=${redirect_uri}"
log "  BOOTSTRAP_ADMIN_EMAIL=${bootstrap_admin_email}"
log "  BOOTSTRAP_CRO_EMAIL=${bootstrap_cro_email}"
log_kv_redacted "REDIS_PASSWORD" "$redis_password"

installed=false
if container_exists "$BACKEND_CONTAINER"; then
  installed=true
fi

if [[ "$action" == "auto" ]]; then
  if [[ "$installed" == "true" ]]; then
    choice="$(prompt_value "Existing install detected (${BACKEND_CONTAINER}). Choose action: upgrade|exit" "upgrade")"
    choice="$(printf '%s' "$choice" | tr '[:upper:]' '[:lower:]' | xargs)"
    if [[ "$choice" == "upgrade" ]]; then
      action="upgrade"
    else
      action="exit"
    fi
  else
    action="deploy"
  fi
fi

if [[ "$action" == "exit" ]]; then
  log "Exiting without deployment."
  exit 0
fi

if [[ "$action" == "deploy" && "$installed" == "true" ]]; then
  die "Existing install detected. Use --action upgrade (or remove containers) instead of deploy."
fi
if [[ "$action" == "upgrade" && "$installed" == "false" ]]; then
  die "No existing install detected. Use --action deploy for first install."
fi

preflight_args=(--backend-env "$BACKEND_ENV" --frontend-env "$FRONTEND_ENV")
if [[ "$action" == "upgrade" ]]; then
  preflight_args+=(--allow-frontend-port-in-use)
fi

log "Running preflight checks"
"${SCRIPT_DIR}/preflight.sh" "${preflight_args[@]}"

if [[ -z "$tag" ]]; then
  default_tag=""
  if [[ -d "${REPO_ROOT}/.git" ]] && command -v git >/dev/null 2>&1; then
    default_tag="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || true)"
  fi
  if [[ -z "$default_tag" ]]; then
    default_tag="$(date +%Y%m%d%H%M%S)"
  fi
  if [[ "$YES" == "true" ]]; then
    tag="$default_tag"
  else
    tag="$(prompt_value "Docker image tag to build/deploy" "$default_tag")"
  fi
fi

child_script="${SCRIPT_DIR}/deploy.sh"
if [[ "$action" == "upgrade" ]]; then
  child_script="${SCRIPT_DIR}/upgrade.sh"
fi

preview_args=(--backend-env "$BACKEND_ENV" --frontend-env "$FRONTEND_ENV" --tag "$tag" --workers "$workers" --dry-run --yes)
if [[ "$VERBOSE" == "true" ]]; then preview_args+=(--verbose); fi

log "Previewing ${action} (no mutations)"
"$child_script" "${preview_args[@]}"

if [[ "$DRY_RUN" == "true" ]]; then
  log "DRY_RUN: preview complete; no deployment performed."
  exit 0
fi

confirm_or_die "Proceed with ${action} now?"

run_args=(--backend-env "$BACKEND_ENV" --frontend-env "$FRONTEND_ENV" --tag "$tag" --workers "$workers" --yes)
if [[ "$VERBOSE" == "true" ]]; then run_args+=(--verbose); fi

log "Running ${action}"
"$child_script" "${run_args[@]}"

log "Install complete"
log "  Frontend: http://localhost:${frontend_host_port}/"
log "  Backend health (via frontend proxy): http://localhost:${frontend_host_port}/api/v1/health"
log "  Entra redirect URI: ${redirect_uri}"
log "Ops:"
log "  ${SCRIPT_DIR}/status.sh"
log "  ${SCRIPT_DIR}/logs.sh --service backend --follow"
log "  ${SCRIPT_DIR}/upgrade.sh --backend-env ${backend_env_intended} --frontend-env ${frontend_env_intended} --tag <new-tag> --yes"
log "  ${SCRIPT_DIR}/rollback.sh --backend-env ${backend_env_intended} --frontend-env ${frontend_env_intended} --i-understand-db-wont-downgrade --yes"
