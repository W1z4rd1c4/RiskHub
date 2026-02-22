# RiskHub Installation Manual (Single-Host Docker)

> **Version**: 1.1  
> **Last Updated**: 2026-02-20  
> **Audience**: IT / DevOps / Platform Engineering  
> **Scope**: on-prem single-host install; TLS termination handled outside containers

This manual covers installing RiskHub on a single Docker host with the recommended topology:

- **backend** in its own container (not published on the host by default)
- **frontend** in its own container (nginx serving SPA and proxying `/api/*` to backend)
- **PostgreSQL** externally managed (not dockerized by RiskHub scripts)
- **Redis** required in production and installed as a container by the scripts

## Choose Your Install Path

RiskHub supports two single-host Docker paths:

1. **External PostgreSQL (recommended for production)**: Phase 500 scripts in `scripts/prod/`.
   - Use when a DBA team manages PostgreSQL separately, or when PostgreSQL must run outside Docker.
2. **All-in-one Docker Compose**: `docker-compose.yml` + `docker-compose.prod.yml`.
   - Use when you want PostgreSQL and Redis dockerized on the same host.

This manual documents the **External PostgreSQL** path end-to-end, and links to Compose docs for the alternative path.

## Architecture (External PostgreSQL)

- Docker network: `riskhub-network`
- Containers:
  - `riskhub-redis` (network alias `redis`)
  - `riskhub-backend` (API; network alias `backend`)
  - `riskhub-backend-scheduler` (scheduler-only; `--workers 1`)
  - `riskhub-frontend` (published on `FRONTEND_HOST_PORT`)
- Volumes:
  - `riskhub-redis-data` (Redis persistence)
  - `riskhub-backend-logs` (backend log persistence)

The frontend proxies:

- `http://<host>/api/*` -> `http://backend:8000` (Docker network alias, internal-only)

Optional (ops/debug only): publish backend to localhost with `--publish-backend 127.0.0.1:8000:8000`.

## System Requirements

Minimums depend on your workload. As a baseline, the repository’s production Compose limits are:

- backend: up to 2 CPU / 2 GB RAM
- frontend: up to 1 CPU / 512 MB RAM

You must also budget for:

- Redis memory + persistence
- OS overhead
- external PostgreSQL (separately provisioned)

## Prerequisites

### 1) Docker host

- Docker Engine 20.10+ (or Docker Desktop) installed and running.
- You can run `docker ps` as the deploying user.
- Host firewall allows inbound traffic to the chosen frontend port (typically 80/443 via a TLS terminator).

### 2) External PostgreSQL (managed outside Docker)

- Recommended: **PostgreSQL 16** (matches `docker-compose.yml`).
- A database and user created ahead of time (RiskHub scripts do not create DB/users).
- Network reachability from the Docker host to PostgreSQL.

Example SQL (run as a Postgres admin):

```sql
CREATE USER riskhub WITH PASSWORD '<strong-password>';
CREATE DATABASE riskhub OWNER riskhub;
GRANT ALL PRIVILEGES ON DATABASE riskhub TO riskhub;
```

### 3) Microsoft Entra ID (SSO)

Production mode is SSO-only:

- `DEBUG=false`
- `AUTH_MODE=microsoft_sso`

You need:

- `ENTRA_TENANT_ID`
- `ENTRA_CLIENT_ID`
- `ENTRA_CLIENT_SECRET`

Redirect URI required by the frontend (MSAL):

- `https://<your-domain>/auth/sso/callback`

## Installation Steps (External PostgreSQL via Phase 500 Scripts)

### Unified wizard (recommended)

Run the unified admin setup wizard from the repo root:

```bash
./scripts/setup.sh --mode prod
```

This delegates to the Phase 500 production guided installer (`scripts/prod/setup.sh`) and will:

- prompt for the required production values (public URL, external `DATABASE_URL`, Entra IDs + client secret, bootstrap admin + CRO emails)
- generate strong secrets automatically (never printed to the terminal)
- write `/etc/riskhub/backend.env` and `/etc/riskhub/frontend.env` with `0600` permissions
- run `scripts/prod/preflight.sh`
- preview the deploy actions, then deploy after confirmation

Dry-run (writes env files to temp paths, cleans them on exit, and previews deploy/upgrade only):

```bash
./scripts/setup.sh --mode prod --dry-run
```

You can also run the production wizard directly:

```bash
scripts/prod/setup.sh
```

If you prefer the manual steps (editing env files yourself), follow the steps below.

### Step 1: Get the code onto the host

On the Docker host, place a RiskHub source checkout (or release bundle) so Docker can build images locally:

- backend Docker build context: `./backend`
- frontend Docker build context: `./frontend`

### Step 2: Create env files on the host

Phase 500 uses split env files:

- `backend.env` for backend + DB + SSO + Redis + bootstrap configuration
- `frontend.env` for frontend published port configuration

Recommended host paths:

```bash
sudo mkdir -p /etc/riskhub
sudo cp scripts/prod/config/backend.env.example /etc/riskhub/backend.env
sudo cp scripts/prod/config/frontend.env.example /etc/riskhub/frontend.env
```

Secure permissions (recommended):

```bash
sudo chmod 600 /etc/riskhub/backend.env /etc/riskhub/frontend.env
```

### Step 3: Configure `/etc/riskhub/backend.env`

At minimum, set real values for:

- `DATABASE_URL` (external PostgreSQL; must not use the default placeholder; must not use hostname `db`)
- `SECRET_KEY` (>= 32 chars)
- `CORS_ORIGINS` (explicit JSON array allowlist; never `*`)
- `REDIS_PASSWORD`
- `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`
- `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_ROLE`, `BOOTSTRAP_ADMIN_ACCESS_SCOPE`
- `BOOTSTRAP_CRO_EMAIL`, `BOOTSTRAP_CRO_ACCESS_SCOPE`

#### Redis URL note (important)

Docker `--env-file` does **not** expand `${VARS}`.

For this reason, Phase 500 scripts compute and inject `REDIS_URL` for backend containers as:

- `redis://:<REDIS_PASSWORD>@redis:6379/0`

Keep the `REDIS_URL` key present in `backend.env` (it may be empty).

### Step 4: Configure `/etc/riskhub/frontend.env`

Set:

- `FRONTEND_HOST_PORT=80` (or another port if you run behind a reverse proxy/terminator that forwards to a non-80 port)
- `SERVER_NAME=riskhub.example.com` (used by host-aware smoke checks and backend trusted-host validation)

### Step 5: Preflight validation (no changes)

```bash
scripts/prod/preflight.sh \
  --backend-env /etc/riskhub/backend.env \
  --frontend-env /etc/riskhub/frontend.env
```

### Step 6: Deploy (build images locally + run migrations + bootstrap + start containers)

Pick an image tag (typically your release version). The scripts will build:

- `riskhub-backend:<TAG>`
- `riskhub-frontend:<TAG>`

Dry-run first:

```bash
scripts/prod/deploy.sh \
  --backend-env /etc/riskhub/backend.env \
  --frontend-env /etc/riskhub/frontend.env \
  --tag 1.0.0 \
  --dry-run \
  --yes
```

Then deploy:

```bash
scripts/prod/deploy.sh \
  --backend-env /etc/riskhub/backend.env \
  --frontend-env /etc/riskhub/frontend.env \
  --tag 1.0.0 \
  --yes
```

Deploy order is enforced:

1. preflight (including external DB connectivity check)
2. install/ensure Redis container
3. build backend image
4. run migrations (`alembic upgrade head`)
5. seed RBAC + departments and bootstrap the initial admin + CRO users by email
6. install backend API container
7. install backend scheduler container (`--workers 1`)
8. build frontend image
9. install frontend container
10. smoke test

## Component-Scoped Runtime Entrypoints (Optional Operations)

Root orchestrators remain canonical for full-stack operations:
- `scripts/dev.sh`
- `scripts/setup.sh`
- `scripts/prod/*`

When you need to launch or update only one surface, use component entrypoints:

- Frontend: `frontend/scripts/runtime/{dev,test,prod}.sh`
- Backend: `backend/scripts/runtime/{dev,test,prod}.sh`
- Database (backend-owned): `backend/scripts/runtime/db/{dev,test,prod}.sh`

See full command matrix and usage examples in:
- `docs/deployment/component-runtime-entrypoints.md`

## First Login and Bootstrap Users (SSO Safety)

In production SSO mode, just-in-time provisioning assigns a safe default role.

To avoid admin/CRO lockout, Phase 500 deploy runs a bootstrap step that:

- seeds RBAC roles/permissions
- seeds departments
- pre-creates (or updates) the initial admin user by email
- optionally pre-creates (or updates) the initial CRO user by email

On the first successful Entra login, RiskHub binds the Entra OID (`external_id`) to the pre-provisioned user row by email.

## Verify Installation

- Frontend: `http://localhost:<FRONTEND_HOST_PORT>/`
- Backend health (via frontend proxy): `http://localhost:<FRONTEND_HOST_PORT>/api/v1/health`

Operator commands:

```bash
scripts/prod/status.sh
scripts/prod/logs.sh --service all --tail 200
scripts/prod/smoke_test.sh --frontend-env /etc/riskhub/frontend.env --backend-env /etc/riskhub/backend.env
scripts/prod/verify_runtime.sh
```

`smoke_test.sh` resolves request host in this order:
1. `--host-header`
2. `SERVER_NAME` from `frontend.env`
3. first value in `ALLOWED_HOSTS` from `backend.env`

## Upgrades

```bash
scripts/prod/upgrade.sh \
  --backend-env /etc/riskhub/backend.env \
  --frontend-env /etc/riskhub/frontend.env \
  --tag 1.0.1 \
  --yes
```

Upgrades:

- build new images locally
- run migrations + bootstrap before swapping containers
- record previous image refs as docker labels (`com.riskhub.previous_image`) for rollback

## Rollback (Containers Only)

Rollbacks do **not** downgrade the database.

```bash
scripts/prod/rollback.sh \
  --backend-env /etc/riskhub/backend.env \
  --frontend-env /etc/riskhub/frontend.env \
  --i-understand-db-wont-downgrade \
  --yes
```

Database rollback posture is forward-fix + backups/PITR:

- `docs/deployment/migrations.md`

## Uninstall (Optional)

Stop and remove containers:

```bash
scripts/prod/stop.sh --rm --yes
```

Remove Phase 500 volumes and network (destructive):

```bash
docker volume rm riskhub-redis-data riskhub-backend-logs
docker network rm riskhub-network
```

## Troubleshooting

### Preflight fails on `DATABASE_URL`

- Ensure it is not the default placeholder:
  - `postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub`
- Ensure hostname is not `db` (Compose smell). Phase 500 requires external PostgreSQL.
- Ensure the DB is reachable from the Docker host network.

### Preflight fails on `CORS_ORIGINS`

- Must be a JSON array string in the env file, for example:
  - `CORS_ORIGINS=["https://riskhub.example.com"]`
- Must not contain `*` in production.

### SSO login loops or fails after deployment

- Confirm Entra app redirect URI:
  - `https://<your-domain>/auth/sso/callback`
- Confirm `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` are correct.
- Check backend logs:
  - `scripts/prod/logs.sh --service backend --follow`

### Users can login but no admin can access admin operations

- Confirm bootstrap keys:
  - `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_ROLE`, `BOOTSTRAP_ADMIN_ACCESS_SCOPE`
  - `BOOTSTRAP_CRO_EMAIL`, `BOOTSTRAP_CRO_ACCESS_SCOPE` (recommended so CRO-only config endpoints are reachable)
- Re-run DB bootstrap (idempotent):
  - `scripts/prod/bootstrap_db.sh --backend-env /etc/riskhub/backend.env --backend-image riskhub-backend:<TAG> --yes`

### Scheduled jobs execute twice

- Ensure only the scheduler container runs with `ENABLE_SCHEDULER=true`.
- The scripts enforce `--workers 1` for the scheduler container.

## Alternative Path (Docker Compose)

If you want PostgreSQL + Redis dockerized on the same host, use:

- `docs/deployment/docker-compose-prod.md`
