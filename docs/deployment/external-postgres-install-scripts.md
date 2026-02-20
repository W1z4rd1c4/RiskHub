# Production Install Scripts (External PostgreSQL)

> **Last Updated**: 2026-02-16  
> **Audience**: IT / DevOps / Platform Engineering  
> **Scope**: single-host Docker deployment with externally managed PostgreSQL (no DB container)

If you want a full end-to-end installation guide (including prerequisites, Entra redirect URI, and uninstall), start with:

- `docs/deployment/installation-manual.md`

If you prefer a guided one-command install wizard, run:

- `./scripts/setup.sh --mode prod` (recommended)
- `scripts/prod/setup.sh` (direct production wizard)

This deployment path uses the Phase 500 scripts in `scripts/prod/`:

- **backend**: FastAPI API server in its own container (not published on host by default)
- **frontend**: nginx serving the SPA and reverse-proxying `/api/*` to the backend
- **postgresql**: external / managed (provisioned outside RiskHub)
- **redis**: required in production and installed as a container by the scripts

## Topology (single host)

- Docker network: `riskhub-network`
- Containers:
  - `riskhub-redis` (network alias `redis`)
  - `riskhub-backend` (API; network alias `backend`)
  - `riskhub-backend-scheduler` (scheduler-only; `--workers 1`)
  - `riskhub-frontend` (published on `FRONTEND_HOST_PORT`)

The backend is reachable only via the frontend reverse proxy by default:

- `http://<host>/` -> frontend SPA
- `http://<host>/api/*` -> backend API (proxied to `http://backend:8000` on the Docker network)

Optional (ops/debug only): you can publish the backend API to localhost by passing:

- `--publish-backend 127.0.0.1:8000:8000` (API instance only)

## Prerequisites

- Docker Engine 20.10+ (or Docker Desktop) installed and running.
- An externally managed PostgreSQL database + user already provisioned.
  - Ensure the Docker host can reach the DB over the network.
  - Ensure `DATABASE_URL` uses `postgresql+asyncpg://...`.
- Microsoft Entra ID app registration (tenant ID + client ID) for `AUTH_MODE=microsoft_sso`.
- TLS termination is expected to be handled outside the containers (reverse proxy / ingress / load balancer).

## 1) Create production env files

The Phase 500 scripts use **split env files**:

- backend: `backend.env`
- frontend: `frontend.env`

Recommended host paths:

```bash
sudo mkdir -p /etc/riskhub
sudo cp scripts/prod/config/backend.env.example /etc/riskhub/backend.env
sudo cp scripts/prod/config/frontend.env.example /etc/riskhub/frontend.env
```

Edit `/etc/riskhub/backend.env` and set real values for at minimum:

- `DATABASE_URL` (external PostgreSQL; must not be the default placeholder and must not use hostname `db`)
- `SECRET_KEY` (>= 32 chars)
- `CORS_ORIGINS` (explicit allowlist JSON array; never `*`)
- `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`
- `REDIS_PASSWORD`

### Redis URL note (important)

Docker `--env-file` does **not** expand `${VARS}`.

For this reason, the Phase 500 scripts compute and inject `REDIS_URL` for backend containers as:

- `redis://:<REDIS_PASSWORD>@redis:6379/0`

Keep the `REDIS_URL` key present in `backend.env` (it may be empty).

## 2) Bootstrap admin + CRO (required for SSO safety)

In production SSO mode (`AUTH_MODE=microsoft_sso` with `DEBUG=false`), just-in-time provisioning assigns a safe default role.

To avoid admin/CRO lockout and ensure CRO-only config endpoints are reachable, set these in `/etc/riskhub/backend.env`:

- `BOOTSTRAP_ADMIN_EMAIL` (must match the Entra user email)
- `BOOTSTRAP_ADMIN_ROLE` (`admin` recommended)
- `BOOTSTRAP_ADMIN_ACCESS_SCOPE` (`global`, `department`, or `manager`)
- `BOOTSTRAP_CRO_EMAIL` (must match the Entra user email)
- `BOOTSTRAP_CRO_ACCESS_SCOPE` (`global`, `department`, or `manager`)

Note: the CRO bootstrap role is fixed to `cro` (no `BOOTSTRAP_CRO_ROLE` key).

On first successful SSO login, RiskHub binds the Entra `external_id` (OID) to the existing user row by email.

## 3) First install (build images locally + deploy)

Run a dry-run first (no mutations):

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

Deploy order (enforced by the scripts):

1. preflight (including DB connectivity check)
2. install/ensure redis container
3. build backend image locally
4. run DB migrations (`alembic upgrade head`)
5. seed RBAC + departments, and bootstrap initial admin user
6. install backend API container
7. install backend scheduler container (single worker)
8. build frontend image locally
9. install frontend container
10. smoke test

## 4) Verify

- Frontend: `http://localhost:<FRONTEND_HOST_PORT>/`
- Backend health (via frontend proxy): `http://localhost:<FRONTEND_HOST_PORT>/api/v1/health`

You can also run:

```bash
scripts/prod/status.sh
scripts/prod/smoke_test.sh --frontend-env /etc/riskhub/frontend.env
scripts/prod/verify_runtime.sh
```

## Upgrades

Upgrades build new images locally, run migrations/bootstrap, then replace containers:

```bash
scripts/prod/upgrade.sh \
  --backend-env /etc/riskhub/backend.env \
  --frontend-env /etc/riskhub/frontend.env \
  --tag 1.0.1 \
  --yes
```

`upgrade.sh` records the previous image refs as container labels (`com.riskhub.previous_image`) for rollbacks.

## Rollback (containers only)

Rollbacks do **not** downgrade the database.

```bash
scripts/prod/rollback.sh \
  --backend-env /etc/riskhub/backend.env \
  --frontend-env /etc/riskhub/frontend.env \
  --i-understand-db-wont-downgrade \
  --yes
```

For database rollback posture and best practices, see `docs/deployment/migrations.md`.

## Operations

- View container status: `scripts/prod/status.sh`
- Tail logs: `scripts/prod/logs.sh`
- Stop containers (keeps volumes): `scripts/prod/stop.sh`

## Troubleshooting notes

- If `preflight.sh` fails on DB connectivity:
  - validate `DATABASE_URL`
  - validate network reachability from the Docker host to PostgreSQL
  - confirm PostgreSQL allows connections from this host (firewall / security groups / pg_hba.conf)
- If users can SSO login but lack admin rights:
  - confirm `BOOTSTRAP_ADMIN_*` and `BOOTSTRAP_CRO_*` values
  - re-run `scripts/prod/bootstrap_db.sh` (it is idempotent)
- If scheduled jobs run twice:
  - ensure only `riskhub-backend-scheduler` runs with `ENABLE_SCHEDULER=true` and `--workers 1` (scripts enforce this)
