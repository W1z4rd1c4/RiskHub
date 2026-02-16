# Docker Compose (Production)

> **Last Updated**: 2026-02-16  
> **Audience**: IT / DevOps  
> **Scope**: single-host, Docker-based on-prem deployment

---

## Choose the Right Deployment Path

This document describes the **Docker Compose** production setup that includes a dockerized PostgreSQL container (`db`) and Redis.

If your PostgreSQL database is externally managed (no DB container), use the Phase 500 install scripts instead:

- `docs/deployment/installation-manual.md` (recommended starting point)
- `docs/deployment/external-postgres-install-scripts.md` (script-focused runbook)

## Files

- `docker-compose.yml` — development baseline (service definitions)
- `docker-compose.prod.yml` — production overrides (secrets + hardening)
- `.env.example` — production env template (copy to `.env`)

## Prerequisites

- Docker Engine 20.10+ (or Docker Desktop)
- A DNS name for the frontend (recommended) and TLS termination (recommended via a reverse proxy/ingress)
- Microsoft Entra ID app registration (tenant ID + client ID)

## 1) Create your production `.env`

From repo root:

1. `cp .env.example .env`
2. Edit `.env` and set **real values** for at minimum:
   - `DATABASE_URL`
   - `SECRET_KEY` (≥ 32 chars)
   - `CORS_ORIGINS` (explicit allowlist; never `*`)
   - `REDIS_PASSWORD` and `REDIS_URL`
   - `AUTH_MODE=microsoft_sso`
   - `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID`
   - `TRUSTED_PROXIES` if your reverse proxy hops are outside the default private ranges

## 2) Start database + Redis first

This ensures migrations can run before the API is considered healthy:

- `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d db redis`

## 3) Run migrations (Alembic)

- `docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm backend alembic upgrade head`

Notes:
- Migrations are not auto-run on backend startup.
- If you need a formal migration strategy/rollback posture, see [Migrations](./migrations.md).

## 4) Start backend + frontend

- `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend frontend`

## 5) Verify

- Frontend: `http://<host>/`
- Backend health via frontend proxy: `http://<host>/api/v1/health`
- Direct backend host publish is localhost-only by default: `http://127.0.0.1:8000/api/v1/health`
  (change `backend.ports` intentionally if external direct API exposure is required).

In production (`DEBUG=false`), `/docs` and `/openapi.json` are disabled by design.

## Scheduler (ENABLE_SCHEDULER)

Scheduled jobs run inside the backend process when `ENABLE_SCHEDULER=true`.

To avoid duplicate executions:
- enable `ENABLE_SCHEDULER=true` in **exactly one** backend process, and
- run that process with **a single worker**.

Recommended pattern:
- keep the main `backend` service with `ENABLE_SCHEDULER=false` and multiple workers, and
- run a separate one-off backend instance for scheduler duties with `--workers 1` (Kubernetes doc shows this explicitly).

## Backups & Logs

- Database data: Docker volume `postgres_data`
- Redis data: Docker volume `redis_data`
- Backend logs: Docker volume `backend_logs` (mounted to `/app/logs`)
- Optional host backup folder: `./backups` is mounted into the DB container at `/backups`

## Upgrades

Typical sequence:
1. Pull/build new images.
2. Run migrations (`alembic upgrade head`).
3. Restart backend + frontend.
