# Production Security Checklist

> **Last Updated**: 2026-02-15  
> **Audience**: DevOps / Security Engineering

---

## Configuration (must-pass guards)

Backend startup enforces these when `DEBUG=false`:

- `DEBUG=false`
- `MOCK_AUTH_ENABLED=false`
- `AUTH_MODE=microsoft_sso`
- `SECRET_KEY` length ≥ 32
- `DATABASE_URL` is explicitly set (not the default placeholder)
- `CORS_ORIGINS` is an explicit allowlist (no `*`)
- `REDIS_URL` is set and reachable
- `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` set
- If `DIRECTORY_WEBHOOK_ENABLED=true`, `WEBHOOK_SECRET` is required

## Network

- Terminate TLS in front of the frontend (Ingress/Reverse Proxy).
- Do not expose PostgreSQL/Redis to the public internet.
- Restrict backend API exposure to internal traffic where possible (frontend reverse proxy is the intended entry point).

## Authentication

- Production runs SSO-only (`microsoft_sso`).
- Confirm the Entra app is configured for your tenant and intended audience.
- If you do not use directory webhooks, set `DIRECTORY_WEBHOOK_ENABLED=false`.

## Scheduler

- `ENABLE_SCHEDULER=true` must run in exactly one backend process (otherwise jobs duplicate).
- Prefer a dedicated scheduler deployment/pod with one worker.

## Secrets handling

- Store `SECRET_KEY`, DB passwords, Redis password, and `WEBHOOK_SECRET` in a secret manager or Kubernetes `Secret`.
- Never commit real secrets into `.env` files.

## Backups

- Ensure regular PostgreSQL backups (and test restore).
- Prefer PITR (WAL archiving) for production databases.

