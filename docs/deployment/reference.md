# Deployment Reference

> **Last Updated**: 2026-04-05
> **Audience**: Operators and maintainers

## Operator Config

Non-secret path:

```bash
/etc/riskhub/riskhub.env
```

Required keys:

- `PUBLIC_URL`
- `ALLOWED_HOSTS`
- `ENTRA_TENANT_ID`
- `ENTRA_CLIENT_ID`
- `DIRECTORY_PROVIDER`
- `ENTRA_JIT_PROVISIONING_ENABLED`
- `AUTH_SSO_ALLOW_EMAIL_LINK`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_CRO_EMAIL`

Optional keys:

- `API_WORKERS` default `4`
- `FRONTEND_BIND_PORT` default `80`
- `CORS_ORIGINS` when you need an explicit override instead of the managed same-origin default
- `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT` when using certificate credential mode
- `DOCKER_NETWORK_SUBNET` default `172.31.255.0/24` for managed docker installs
- `TRUSTED_PROXIES` JSON array override when you need explicit proxy CIDRs beyond the target defaults

Secret directory:

```bash
/etc/riskhub/secrets/
```

Required files:

- `database_url`
- `secret_key`
- `redis_password`

Entra confidential credential files:

- client secret mode: `entra_client_secret`
- certificate mode: `entra_client_certificate_private_key`

Production requires one supported Entra Graph credential mechanism:

- `ENTRA_CLIENT_SECRET_FILE`, or
- `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT` + `ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE`

If both are configured, certificate mode is preferred and becomes the active runtime mode.

## Managed / Installer-Rendered Values

These are rendered by the managed deploy tooling and are not operator-edited in the common guided-install path:

- `CORS_ORIGINS`
- `TRUSTED_PROXIES`
- `SERVER_NAME`
- `REDIS_URL`
- `DATABASE_URL_FILE`
- `SECRET_KEY_FILE`
- `ENTRA_CLIENT_SECRET_FILE` or
- `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT`
- `ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE`
- `REDIS_URL_FILE`
- scheduler singleton settings
- shell-safe `metadata.env` for internal deploy/runtime metadata
- target-specific nginx/systemd/docker runtime files

Production runtime note:

- `ALLOWED_HOSTS` is a required production setting. Managed `docker`/`linux` install flows derive and render it from the configured public hostname, but manual operators must treat it as an explicit allowlist requirement rather than assuming it is optional or inferred from CORS settings.
- `DIRECTORY_PROVIDER` must be set to `graph` in production.
- `ENTRA_JIT_PROVISIONING_ENABLED` must be set to `false` in production.
- `AUTH_SSO_ALLOW_EMAIL_LINK` must be set to `false` in production.
- `RATE_LIMIT_FAIL_CLOSED_ON_BACKEND_ERROR` defaults to `true` in production and controls whether Redis limiter outages fail closed (`503`) instead of degrading to in-memory limits.
- Every `/api/v1/auth/sso/exchange` call must come from the backend-issued SSO challenge flow; direct bare-token exchange is unsupported.
- Production requires one explicit Entra confidential credential mode: `ENTRA_CLIENT_SECRET_FILE`, or `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT` plus `ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE`.

Target-specific Redis URLs:

- docker: `redis://:<password>@redis:6379/0`
- linux: `redis://:<password>@127.0.0.1:6379/0`

Target-specific trusted proxy defaults:

- docker: `["127.0.0.1", "::1", "<DOCKER_NETWORK_SUBNET>"]`
- linux: `["127.0.0.1", "::1"]`

Docker network notes:

- managed docker installs create `riskhub-network` with the configured `DOCKER_NETWORK_SUBNET`
- deploy preflight fails if an existing `riskhub-network` does not match that subnet
- broad RFC1918 `TRUSTED_PROXIES` ranges weaken `X-Forwarded-For` trust for rate limiting, refresh-session IP attribution, and request logging

## Public Wrapper Commands

Recommended public production commands:

```bash
./scripts/install.sh production --target docker --version VERSION
./scripts/install.sh production --target docker --backend-image IMAGE --backend-db-image IMAGE --frontend-image IMAGE --redis-image IMAGE
./scripts/install.sh production --target linux --bundle PATH
./scripts/install.sh upgrade --target docker|linux ...
./scripts/install.sh verify --mode production --target docker|linux --config PATH --secret-dir PATH
./scripts/install.sh status --mode production --target docker|linux [--json]
./scripts/install.sh logs --mode production --target docker|linux [--tail N] [--follow]
./scripts/install.sh doctor --mode production --target docker|linux [--repair] [--deep] [--json]
```

Wrapper notes:

- `./scripts/install.sh` remains the public operator surface, but it is now backed internally by `scripts/install_cli.py` and `scripts/install_lib/`.
- `./scripts/install.sh production ...` initializes missing config scaffolding, prompts for required non-secret values, reuses `./scripts/deploy.sh secrets-edit ...` for secret capture, refuses unresolved placeholders, then runs `preflight`, `deploy`, `status`, and `smoke`.
- If `./scripts/install.sh production ...` detects an existing install, it allows the rerun and uses the upgrade lifecycle underneath rather than failing on an existing deployment.
- `./scripts/install.sh upgrade ...` creates a timestamped non-secret backup under the runtime directory, then runs `preflight`, `upgrade`, `status`, and `smoke`.
- `./scripts/install.sh verify ...` is non-mutating and dispatches to the production `status` and `smoke` checks for the selected target.
- `./scripts/install.sh status ...` reports target, config/runtime paths, current release source, managed resource state, and the latest known successful deploy/smoke metadata. `--json` emits machine-readable output only.
- `./scripts/install.sh doctor ...` is the first response for broken deployments. `--repair` is limited to safe scaffolding, path normalization, restart actions, metadata reconstruction, and post-repair `status`/`smoke`.

## Advanced/Admin Command Reference

Lower-level admin interface:

```bash
./scripts/deploy.sh init --target docker|linux [--config PATH] [--secret-dir PATH] [--force]
./scripts/deploy.sh secrets-init --target docker|linux [--secret-dir PATH] [--force]
./scripts/deploy.sh secrets-edit --target docker|linux [--secret-dir PATH]
./scripts/deploy.sh secrets-check --target docker|linux [--secret-dir PATH]
./scripts/deploy.sh preflight --target docker|linux --config PATH
./scripts/deploy.sh deploy --target docker --config PATH --secret-dir PATH --version VERSION
./scripts/deploy.sh deploy --target docker --config PATH --secret-dir PATH --backend-image IMAGE --backend-db-image IMAGE --frontend-image IMAGE --redis-image IMAGE
./scripts/deploy.sh deploy --target linux --config PATH --secret-dir PATH --bundle PATH
./scripts/deploy.sh upgrade --target docker|linux ...
./scripts/deploy.sh status --target docker|linux
./scripts/deploy.sh logs --target docker|linux [--service all|backend|scheduler|frontend|redis] [--tail N] [--follow]
./scripts/deploy.sh smoke --target docker|linux --config PATH --secret-dir PATH
./scripts/deploy.sh rollback --target docker --config PATH --secret-dir PATH [--service all|backend|frontend]
./scripts/deploy.sh rollback --target linux --config PATH --secret-dir PATH
```

Common flags:

- `--secret-dir PATH`
- `--dry-run`
- `--yes`
- `--verbose`

Operational notes:

- `./scripts/deploy.sh init ...` scaffolds the non-secret config, the secret-file placeholders, and the persistent runtime directory.
- `./scripts/deploy.sh secrets-edit ...` keeps its temporary edit workspace under the parent of `--secret-dir` so secret edits stay on the same host-managed mount, not under `/tmp`.
- `./scripts/install.sh production ...` is the recommended first-run operator workflow; keep `./scripts/deploy.sh` for advanced/manual administration, debugging, and partial lifecycle commands.
- Docker explicit-image mode requires all four images unless `--version` is supplied: runtime backend, backend DB, frontend, and redis.
- `metadata.env` is an internal shell-sourced runtime artifact. Operators should not edit it directly; maintainers must keep its assignments safe to `source`, including when runtime or secret paths contain spaces.

## Install State

Persistent install metadata is written to:

```bash
/etc/riskhub/runtime/install-state.json
```

This file records:

- target
- config path
- secret dir
- runtime dir
- current release source
- managed services or containers
- public URL
- last successful deploy timestamp
- last successful smoke timestamp
- last successful command

Operators should treat it as lifecycle metadata owned by `./scripts/install.sh`, not as a manual configuration file.

## Runtime Defaults

Backend API:

- bind host `127.0.0.1`
- bind port `8000`

Scheduler:

- enabled as a separate runtime only
- worker count forced to `1`
- linux bind port `8001`
- advisory lock enforced against Postgres before scheduler start

Reliability runtime:

- `scheduler_job_runs` stores scheduler ownership and scheduled job execution history
- `app_outbox_events` stores transactional outbox events for request-driven follow-up effects
- outbox dispatch interval is fixed in code at 5 seconds
- outbox max attempts is fixed in code at 10
- aggregate endpoint cache TTL is fixed in code at 15 seconds

Linux target:

- release root `/opt/riskhub/releases`
- current symlink `/opt/riskhub/current`
- previous symlink `/opt/riskhub/previous`
- backend unit `riskhub-backend.service`
- scheduler unit `riskhub-scheduler.service`
- redis unit `riskhub-redis.service`
- nginx site `/etc/nginx/conf.d/riskhub.conf`

## Production Invariants

- `DEBUG=false`
- `MOCK_AUTH_ENABLED=false`
- `AUTH_MODE=microsoft_sso`
- `DIRECTORY_PROVIDER=graph`
- `ENTRA_JIT_PROVISIONING_ENABLED=false`
- `AUTH_SSO_ALLOW_EMAIL_LINK=false`
- `SECRET_KEY_FILE` resolves to a value with length at least `32`
- `SECRET_KEY_FILE` must not resolve to a blocked weak default (`dev-secret-key-not-for-production-use`, `changeme`, `dev-secret`, `test-secret`, `secret`)
- explicit `CORS_ORIGINS`
- access-token bearer auth requires RiskHub access-token claims (`type=access`, `iss=riskhub`, `aud=riskhub-api`)
- explicit `DATABASE_URL_FILE`
- one valid Entra confidential credential mechanism for Graph directory access
- reachable `REDIS_URL_FILE`
- `/docs` and `/openapi.json` disabled in production
- browser isolation headers (`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`) intentionally omitted in the current baseline because RiskHub does not require cross-origin isolated browser capabilities
- smoke checks fail if:
  - `scheduler_job_runs` or `app_outbox_events` is missing
  - the scheduler runtime is not represented by exactly one running `__scheduler_runtime__` row
  - dead-letter outbox rows exist
