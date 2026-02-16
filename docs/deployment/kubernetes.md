# Kubernetes Deployment

> **Last Updated**: 2026-02-15  
> **Audience**: Platform Engineering / DevOps  
> **Note**: This repo does not ship Kubernetes manifests. This doc describes the recommended shape.

---

## Components

Run these components in your cluster:

- **PostgreSQL**: managed service or StatefulSet (persistent volume required)
- **Redis**: managed service or StatefulSet (persistent volume recommended)
- **Backend**: Deployment (`uvicorn app.main:app`)
- **Frontend**: Deployment (nginx serving SPA + `/api` reverse proxy)

## Required Environment Variables (Backend)

Use `.env.example` as the full template. In production (`DEBUG=false`) these are enforced by startup guards:

- `DEBUG=false`
- `MOCK_AUTH_ENABLED=false`
- `AUTH_MODE=microsoft_sso`
- `DATABASE_URL` (must not be the default placeholder)
- `SECRET_KEY` (≥ 32 chars)
- `CORS_ORIGINS` (explicit allowlist; no `*`)
- `REDIS_URL` (must be reachable)
- `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`
- `DIRECTORY_WEBHOOK_ENABLED` + `WEBHOOK_SECRET` (secret required when enabled)

Recommended: store secrets in a Kubernetes `Secret` and non-sensitive values in a `ConfigMap`.

## Probes

Backend:
- Readiness/Liveness: `GET /api/v1/health`

Frontend:
- Readiness/Liveness: `GET /`

## Migrations Strategy

Do **not** auto-run migrations in the backend container startup.

Recommended pattern:
- Create a Kubernetes `Job` (or Helm hook) that runs:
  - `alembic upgrade head`
- Gate backend rollout on successful migrations.

See [Migrations](./migrations.md).

## Scheduler Strategy (Avoid Duplicate Jobs)

The APScheduler jobs are enabled only when `ENABLE_SCHEDULER=true`.

Important: scheduler runs **per process**. If you run multiple backend replicas or multiple server workers, you will get duplicate jobs unless you isolate it.

Recommended pattern:

1) **API Deployment**
- `ENABLE_SCHEDULER=false`
- scale replicas as needed
- can run multiple workers per pod

2) **Scheduler Deployment (single replica)**
- `ENABLE_SCHEDULER=true`
- **one pod replica**
- run **one server worker** (override args to `--workers 1`)

This keeps scheduled jobs singleton-safe without needing distributed locks.

## Ingress / TLS

Terminate TLS at the ingress controller or an external load balancer.

Set:
- `CORS_ORIGINS=["https://your-domain"]`
- (optional) `ALLOWED_HOSTS=["your-domain"]` (if omitted, derived from CORS origins)

## Logging

Backend logs are written to `/app/logs`. In Kubernetes, prefer:
- stdout/stderr collection via your cluster logging pipeline, or
- a persistent volume if you require file-based retention.

