# Production Security Checklist

> **Last Updated**: 2026-02-20  
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
- `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, and `ENTRA_CLIENT_SECRET` set
- `TRUSTED_PROXIES` reviewed when deploying behind non-default proxy networks

## Network

- Terminate TLS in front of the frontend (Ingress/Reverse Proxy).
- Do not expose PostgreSQL/Redis to the public internet.
- Restrict backend API exposure to internal traffic where possible (frontend reverse proxy is the intended entry point).
- In Docker Compose flows, backend host publishing is loopback-bound by default (`127.0.0.1:8000:8000`).
- Phase 500 scripts default to **not publishing** the backend container on the host. Use frontend `/api/*` proxy as the entry point.

## Authentication

- Production runs SSO-only (`microsoft_sso`).
- Confirm the Entra app is configured for your tenant and intended audience.

## Scheduler

- `ENABLE_SCHEDULER=true` must run in exactly one backend process (otherwise jobs duplicate).
- Prefer a dedicated scheduler deployment/pod with one worker.

## Container runtime hardening

- Backend and frontend runtime containers should run as non-root users.
- Frontend install path uses `--cap-drop ALL` with `--cap-add NET_BIND_SERVICE` so port `80` binding remains possible without running as root.

## Secrets handling

- Store `SECRET_KEY`, DB passwords, Redis password, and `ENTRA_CLIENT_SECRET` in a secret manager or Kubernetes `Secret`.
- Never commit real secrets into `.env` files.
- When using Phase 500 scripts, keep `/etc/riskhub/backend.env` and `/etc/riskhub/frontend.env` readable only by root or a dedicated ops user.
- Do not echo secrets into shell history or CI logs. The Phase 500 scripts avoid printing `DATABASE_URL`, `SECRET_KEY`, `REDIS_PASSWORD`, and `ENTRA_CLIENT_SECRET`.

## Supply-Chain And Image Gates

- Backend production image baseline is Python `3.13` on Alpine (`backend/Dockerfile`).
- Security CI requires container + SBOM correlation gates:
  - Trivy high/critical gate for built images.
  - Syft SBOM generation and Grype high/critical gate for backend runtime packages.
- Treat scanner discrepancies as open risk:
  - A clean Trivy result does not close risk if Grype reports unresolved high/critical findings.
  - Any suppression in `backend/security/grype-ignore.yaml` must be explicit, time-bound, and owner-attributed.

## Backups

- Ensure regular PostgreSQL backups (and test restore).
- Prefer PITR (WAL archiving) for production databases.

## Rollback posture

- Phase 500 `rollback.sh` rolls back **containers only** (previous image refs recorded as docker labels).
- Do not attempt automatic DB downgrades in incidents. Use forward-fix migrations + backups/PITR (see `docs/deployment/migrations.md`).
