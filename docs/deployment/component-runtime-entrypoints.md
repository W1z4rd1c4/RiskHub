# RiskHub Component Runtime Entrypoints

> **Version**: 1.1  
> **Last Updated**: 2026-02-22  
> **Audience**: Engineering, DevOps  
> **Source of Truth**: `frontend/scripts/runtime/`, `backend/scripts/runtime/`, `backend/scripts/runtime/db/`, `scripts/prod/`

This runbook defines component-scoped runtime scripts for frontend, backend, and database lifecycle operations.

Root startup/deployment scripts remain valid and unchanged:
- `scripts/dev.sh`
- `scripts/setup.sh`
- `scripts/prod/*`

## Command Matrix

| Component | Environment | Script | Purpose |
|---|---|---|---|
| Frontend | dev | `frontend/scripts/runtime/dev.sh` | Start frontend dev runtime only (`npm run dev`) |
| Frontend | test | `frontend/scripts/runtime/test.sh` | Start frontend test runtime profile only (`vite --mode test`) |
| Frontend | prod | `frontend/scripts/runtime/prod.sh` | Build frontend image and deploy/upgrade frontend container only |
| Backend | dev | `backend/scripts/runtime/dev.sh` | Start backend dev runtime only (local uvicorn) |
| Backend | test | `backend/scripts/runtime/test.sh` | Start backend test runtime profile only (startup mode, not pytest) |
| Backend | prod | `backend/scripts/runtime/prod.sh` | Build backend image, run DB prod lifecycle, ensure redis, install/upgrade backend API+scheduler |
| Database (backend-owned) | dev | `backend/scripts/runtime/db/dev.sh` | Start compose Postgres only and wait for readiness |
| Database (backend-owned) | test | `backend/scripts/runtime/db/test.sh` | Destructive compose DB reset/start and readiness check |
| Database (backend-owned) | prod | `backend/scripts/runtime/db/prod.sh` | External Postgres lifecycle update: connectivity preflight + migrations + bootstrap |

## Scope and Boundaries

- Scripts are component-scoped and do not auto-start cross-service dependencies.
- Database scripts are backend-owned and live only under `backend/scripts/runtime/db/`.
- `test` runtime scripts are startup profiles only. They do not execute test suites.

## Prerequisites

- Frontend runtime scripts: `node` major `24`, `npm`, `frontend/package.json`.
- Backend runtime scripts: `backend/venv` available for local uvicorn startup.
- DB dev/test scripts: Docker daemon + Docker Compose (`docker-compose` or `docker compose`).
- Prod component scripts: Docker daemon and environment files:
  - backend env default: `/etc/riskhub/backend.env`
  - frontend env default: `/etc/riskhub/frontend.env`

Frontend runtime fail-fast behavior:
- `frontend/scripts/runtime/dev.sh` and `frontend/scripts/runtime/test.sh` enforce Node major `24` and exit non-zero on mismatch.
- `scripts/dev.sh` also enforces Node major `24`, but first auto-prefers detected Node 24 runtimes (`NODE24_BIN`, Homebrew `node@24`, then NVM `v24*`) when available.
- Remediation example: `brew install node@24 && export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.

## Examples

### Frontend

```bash
frontend/scripts/runtime/dev.sh
frontend/scripts/runtime/test.sh -- --port 5174
frontend/scripts/runtime/prod.sh --tag 1.2.3 --yes
```

### Backend

```bash
backend/scripts/runtime/dev.sh
backend/scripts/runtime/test.sh --reload
backend/scripts/runtime/prod.sh --tag 1.2.3 --workers 4 --yes
```

### Database

```bash
backend/scripts/runtime/db/dev.sh
backend/scripts/runtime/db/test.sh --yes
backend/scripts/runtime/db/prod.sh --tag 1.2.3 --yes
```

## Production Notes

- `backend/scripts/runtime/db/prod.sh` wraps:
  - `scripts/prod/run_migrations.sh`
  - `scripts/prod/bootstrap_db.sh`
- `frontend/scripts/runtime/prod.sh` wraps `scripts/prod/install_frontend.sh`.
- `backend/scripts/runtime/prod.sh` wraps:
  - `backend/scripts/runtime/db/prod.sh`
  - `scripts/prod/install_redis.sh`
  - `scripts/prod/install_backend.sh`
