#!/usr/bin/env bash
set -euo pipefail

# Env-file helpers

envfile_get() {
  local file="$1"
  local key="$2"
  local line
  line="$(grep -E "^[[:space:]]*${key}=" "$file" 2>/dev/null | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi
  printf '%s' "${line#*=}"
}

envfile_require_nonempty() {
  local file="$1"
  local key="$2"
  local value
  value="$(envfile_get "$file" "$key" || true)"
  if [[ -z "$value" ]]; then
    die "Missing required env var '$key' in $file"
  fi
}

envfile_require_exact() {
  local file="$1"
  local key="$2"
  local expected="$3"
  local value
  value="$(envfile_get "$file" "$key" || true)"
  if [[ "$value" != "$expected" ]]; then
    die "Expected $key=$expected in $file"
  fi
}

envfile_require_min_len() {
  local file="$1"
  local key="$2"
  local min_len="$3"
  local value
  value="$(envfile_get "$file" "$key" || true)"
  if [[ ${#value} -lt "$min_len" ]]; then
    die "Expected $key length >= $min_len in $file"
  fi
}

envfile_require_absent() {
  local file="$1"
  local key="$2"
  if grep -qE "^[[:space:]]*${key}=" "$file"; then
    die "Raw secret env var '$key' must not be present in $file"
  fi
}

envfile_require_not_contains() {
  local file="$1"
  local key="$2"
  local needle="$3"
  local value
  value="$(envfile_get "$file" "$key" || true)"
  if [[ "$value" == *"$needle"* ]]; then
    die "Invalid $key in $file (must not contain '$needle')"
  fi
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "(:|\\])${port}$"
    return $?
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -q ":${port} "
    return $?
  fi
  return 2
}

preflight_backend_env() {
  local backend_env="$1"
  require_file "$backend_env"
  require_dir "$SECRET_DIR"

  # Production hardening invariants (mirror backend/app/main.py)
  envfile_require_exact "$backend_env" "DEBUG" "false"
  envfile_require_exact "$backend_env" "MOCK_AUTH_ENABLED" "false"
  envfile_require_exact "$backend_env" "AUTH_MODE" "microsoft_sso"
  envfile_require_exact "$backend_env" "DIRECTORY_PROVIDER" "graph"
  envfile_require_exact "$backend_env" "ENTRA_JIT_PROVISIONING_ENABLED" "false"
  envfile_require_exact "$backend_env" "AUTH_SSO_ALLOW_EMAIL_LINK" "false"

  envfile_require_absent "$backend_env" "SECRET_KEY"
  envfile_require_absent "$backend_env" "DATABASE_URL"
  envfile_require_absent "$backend_env" "ENTRA_CLIENT_SECRET"
  envfile_require_absent "$backend_env" "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY"
  envfile_require_absent "$backend_env" "REDIS_PASSWORD"
  envfile_require_absent "$backend_env" "REDIS_URL"

  envfile_require_nonempty "$backend_env" "SECRET_KEY_FILE"
  envfile_require_nonempty "$backend_env" "DATABASE_URL_FILE"
  envfile_require_nonempty "$backend_env" "REDIS_URL_FILE"

  local secret_key_file database_url_file redis_url_file
  secret_key_file="$(envfile_get "$backend_env" "SECRET_KEY_FILE" || true)"
  database_url_file="$(envfile_get "$backend_env" "DATABASE_URL_FILE" || true)"
  redis_url_file="$(envfile_get "$backend_env" "REDIS_URL_FILE" || true)"
  require_file "$secret_key_file"
  require_file "$database_url_file"

  local secret_key
  secret_key="$(cat "$secret_key_file")"
  if [[ ${#secret_key} -lt 32 ]]; then
    die "Expected SECRET_KEY_FILE value length >= 32 at $secret_key_file"
  fi

  local db_url
  db_url="$(cat "$database_url_file")"
  local default_db="postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub"
  if [[ "$db_url" == "$default_db" ]]; then
    die "DATABASE_URL must be explicitly configured for production (refusing default placeholder)."
  fi
  if [[ "$db_url" == *"@db:"* ]]; then
    die "DATABASE_URL appears to target compose service host 'db'. Phase 500 requires external PostgreSQL."
  fi

  envfile_require_nonempty "$backend_env" "CORS_ORIGINS"
  envfile_require_not_contains "$backend_env" "CORS_ORIGINS" "*"

  envfile_require_nonempty "$backend_env" "ENTRA_TENANT_ID"
  envfile_require_nonempty "$backend_env" "ENTRA_CLIENT_ID"
  if grep -qE '^[[:space:]]*AD_EMULATOR_BASE_URL=' "$backend_env"; then
    die "AD_EMULATOR_BASE_URL must not be present in $backend_env"
  fi

  local entra_client_secret_file entra_client_certificate_private_key_file entra_client_certificate_thumbprint
  local has_secret_mode=false
  local has_certificate_mode=false

  entra_client_secret_file="$(envfile_get "$backend_env" "ENTRA_CLIENT_SECRET_FILE" || true)"
  entra_client_certificate_private_key_file="$(envfile_get "$backend_env" "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE" || true)"
  entra_client_certificate_thumbprint="$(envfile_get "$backend_env" "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT" || true)"

  if [[ -n "$entra_client_secret_file" ]]; then
    require_file "$entra_client_secret_file"
    local client_secret
    client_secret="$(cat "$entra_client_secret_file")"
    [[ -n "$client_secret" ]] || die "ENTRA_CLIENT_SECRET_FILE must not be empty"
    [[ "${client_secret%$'\n'}" != "CHANGE_ME_ENTRA_CLIENT_SECRET" ]] || die "ENTRA_CLIENT_SECRET_FILE still contains the placeholder value"
    has_secret_mode=true
  fi

  if [[ -n "$entra_client_certificate_private_key_file" || -n "$entra_client_certificate_thumbprint" ]]; then
    [[ -n "$entra_client_certificate_private_key_file" ]] || die "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE is required when ENTRA_CLIENT_CERTIFICATE_THUMBPRINT is set"
    [[ -n "$entra_client_certificate_thumbprint" ]] || die "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT is required when ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE is set"
    require_file "$entra_client_certificate_private_key_file"
    local certificate_private_key
    certificate_private_key="$(cat "$entra_client_certificate_private_key_file")"
    [[ -n "$certificate_private_key" ]] || die "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE must not be empty"
    [[ "${certificate_private_key%$'\n'}" != "CHANGE_ME_ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY" ]] || die "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE still contains the placeholder value"
    has_certificate_mode=true
  fi

  if [[ "$has_secret_mode" != "true" && "$has_certificate_mode" != "true" ]]; then
    die "Expected one Entra Graph credential: ENTRA_CLIENT_SECRET_FILE or ENTRA_CLIENT_CERTIFICATE_THUMBPRINT + ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE in $backend_env"
  fi
  if [[ "$has_secret_mode" == "true" && "$has_certificate_mode" == "true" ]]; then
    warn "Both ENTRA_CLIENT_SECRET_FILE and certificate credential are configured; certificate mode is active."
  fi
  if [[ "$has_secret_mode" == "true" && "$has_certificate_mode" != "true" ]]; then
    warn "Production is using Entra client-secret mode; certificate mode is preferred unless explicitly waived."
  fi

  if [[ -f "$redis_url_file" ]]; then
    [[ -n "$(cat "$redis_url_file")" ]] || die "REDIS_URL_FILE must not be empty"
  else
    warn "REDIS_URL_FILE does not exist yet at ${redis_url_file}; deploy/upgrade will materialize it into the runtime directory."
  fi
}

preflight_frontend_env() {
  local frontend_env="$1"
  local allow_port_in_use="${2:-false}" # true|false
  require_file "$frontend_env"

  envfile_require_nonempty "$frontend_env" "FRONTEND_HOST_PORT"
  local host_port
  host_port="$(envfile_get "$frontend_env" "FRONTEND_HOST_PORT" || true)"
  if ! [[ "$host_port" =~ ^[0-9]+$ ]]; then
    die "FRONTEND_HOST_PORT must be numeric in $frontend_env"
  fi
  if (( host_port < 1 || host_port > 65535 )); then
    die "FRONTEND_HOST_PORT must be between 1 and 65535 in $frontend_env"
  fi

  local container_port
  container_port="$(envfile_get "$frontend_env" "FRONTEND_CONTAINER_PORT" || true)"
  if [[ -n "$container_port" ]]; then
    if ! [[ "$container_port" =~ ^[0-9]+$ ]]; then
      die "FRONTEND_CONTAINER_PORT must be numeric in $frontend_env"
    fi
    if (( container_port < 1 || container_port > 65535 )); then
      die "FRONTEND_CONTAINER_PORT must be between 1 and 65535 in $frontend_env"
    fi
  fi

  local in_use_rc=0
  if port_in_use "$host_port"; then
    if [[ "$allow_port_in_use" == "true" ]]; then
      warn "FRONTEND_HOST_PORT=$host_port is already in use; continuing because replacement mode is enabled."
    else
      die "FRONTEND_HOST_PORT=$host_port appears to be in use on this host."
    fi
  else
    in_use_rc=$?
    if [[ "$in_use_rc" -eq 2 ]]; then
      warn "Could not determine whether port $host_port is in use (no ss/lsof)."
    fi
  fi
}

preflight_docker_network_contract() {
  local backend_env="$1"
  local frontend_env="$2"
  local backend_subnet frontend_subnet expected_subnet
  backend_subnet="$(envfile_get "$backend_env" "DOCKER_NETWORK_SUBNET" || true)"
  frontend_subnet="$(envfile_get "$frontend_env" "DOCKER_NETWORK_SUBNET" || true)"

  if [[ -z "$backend_subnet" && -z "$frontend_subnet" ]]; then
    return 0
  fi
  if [[ -z "$backend_subnet" || -z "$frontend_subnet" ]]; then
    die "Docker runtime env contract is incomplete: DOCKER_NETWORK_SUBNET must be present in both backend.env and frontend.env."
  fi
  if [[ "$backend_subnet" != "$frontend_subnet" ]]; then
    die "Docker runtime env contract mismatch: backend.env DOCKER_NETWORK_SUBNET ($backend_subnet) does not match frontend.env ($frontend_subnet)."
  fi

  expected_subnet="$backend_subnet"
  if ! docker_network_exists "$NETWORK_NAME"; then
    return 0
  fi

  local existing_subnets
  existing_subnets="$(docker_network_subnets "$NETWORK_NAME")"
  if [[ -z "$existing_subnets" ]]; then
    die "Existing docker network '$NETWORK_NAME' has no inspectable subnet. Recreate the network before deploy."
  fi
  if ! printf '%s\n' "$existing_subnets" | grep -Fxq "$expected_subnet"; then
    die "Existing docker network '$NETWORK_NAME' uses subnet(s) [$existing_subnets], expected '$expected_subnet'. Recreate the network or update DOCKER_NETWORK_SUBNET."
  fi
}

preflight_check_db_connectivity() {
  local backend_env="$1"
  local backend_image="$2"

  require_file "$backend_env"
  if [[ -z "$backend_image" ]]; then
    die "DB check requested but no backend DB image provided (--backend-db-image)."
  fi

  log "Checking external PostgreSQL connectivity (SELECT 1)..."
  run docker run --rm \
    -v "${SECRET_DIR}:${SECRET_DIR}:ro" \
    -v "${RUNTIME_DIR}:${RUNTIME_DIR}:ro" \
    --env-file "$backend_env" "$backend_image" python - <<'PY'
import asyncio
import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

def resolve_setting(name: str) -> str:
    direct = os.environ.get(name)
    file_path = os.environ.get(f"{name}_FILE")
    if direct and file_path:
        raise SystemExit(f"{name} and {name}_FILE cannot both be set")
    if direct:
        return direct
    if file_path:
        with open(file_path, "r", encoding="utf-8") as handle:
            value = handle.read()
        return value.rstrip("\r\n")
    raise SystemExit(f"{name} is not set")

async def main() -> None:
    url = resolve_setting("DATABASE_URL")
    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
    finally:
        await engine.dispose()

asyncio.run(main())
PY
  log "Database connectivity: OK"
}
