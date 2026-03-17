# Production Security Checklist

> **Last Updated**: 2026-03-17
> **Audience**: DevOps / Security Engineering

## Config And Startup Guards

RiskHub production deploys must satisfy these invariants:

- `DEBUG=false`
- `MOCK_AUTH_ENABLED=false`
- `AUTH_MODE=microsoft_sso`
- `SECRET_KEY` secret file length at least `32`
- explicit external PostgreSQL `database_url` secret file
- explicit `CORS_ORIGINS`
- reachable `REDIS_URL`
- valid `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, and one supported Entra Graph credential mechanism
- reviewed `TRUSTED_PROXIES` when traffic passes through non-default proxy networks

## Network

- Terminate TLS on the host or an upstream reverse proxy.
- Do not expose PostgreSQL or Redis publicly.
- Use the frontend same-origin entrypoint as the public surface.
- Linux target:
  - nginx is the public listener
  - backend API stays on `127.0.0.1:8000`
  - scheduler stays on `127.0.0.1:8001`
- Docker target:
  - frontend container is the public listener
  - backend is not intended to be directly exposed

## Authentication

- Production is SSO-only.
- Validate the Microsoft Entra app registration and redirect URIs before go-live.
- Keep bootstrap admin/CRO emails distinct.

## Scheduler

- Run the scheduler exactly once.
- Docker target: use the dedicated scheduler container.
- Linux target: use the dedicated `riskhub-scheduler.service`.
- Confirm scheduler ownership is actually held:
  - Admin Console `/admin` shows scheduler lock held and a current owner instance.
  - deploy smoke shows exactly one running `__scheduler_runtime__` row.

## Runtime Hardening

- Backend and frontend runtime processes must run as non-root.
- Keep `/docs` and `/openapi.json` disabled in production.
- Keep Redis enabled because rate limiting and account lockout depend on it.
- Treat any dead-letter outbox event as an operational incident until triaged.
- After deploy, verify outbox backlog is healthy:
  - dead-letter count is `0`
  - dispatcher status is succeeding
  - backlog is not growing unexpectedly

## Secrets Handling

- Treat `/etc/riskhub/secrets/` and `/etc/riskhub/runtime/redis_url` as sensitive.
- Keep `/etc/riskhub/riskhub.env` non-secret only.
- Never commit production secrets.
- Keep `/etc/riskhub` on an encrypted disk or encrypted mount.
- `./scripts/deploy.sh secrets-edit ...` keeps its temporary edit workspace on the same host-managed deployment path as `--secret-dir`, not under `/tmp`.
- Store `SECRET_KEY`, database credentials, Redis password, and the active Entra confidential credential material in a secret manager when possible.
- `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` are not secret values.
- Prefer file-backed certificate credential mode over shared client secret when your Entra app registration supports it.
- Keep certificate PEM material only in `/etc/riskhub/secrets/entra_client_certificate_private_key`; do not inline it into non-secret env files.
- Do not print secrets into shell history or CI logs.

## Supply Chain

- Python baseline is `3.13`.
- Docker target should pull only published release images.
- Linux target should use only published `riskhub-linux-<version>.tar.gz` bundles.
- Validate release artifacts in CI before publishing.

## Backups And Rollback

- Take regular PostgreSQL backups and test restore.
- Prefer PITR for production databases.
- Application rollback does not downgrade the database.
- Treat migration rollback as a controlled database operation or a forward-fix.
