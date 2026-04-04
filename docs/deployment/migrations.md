# Database Migrations (Alembic)

> **Last Updated**: 2026-04-05  
> **Audience**: DevOps / Release Engineering

---

## Source of truth

- Alembic migrations live under `backend/alembic/versions/`.
- The migration runner is Alembic (async SQLAlchemy engine).

## When migrations run

RiskHub does **not** auto-run migrations at backend startup.

This is intentional:
- migration failures should not be hidden by application restarts
- it allows explicit rollout control (especially for irreversible migrations)

## Recommended production strategy

1. Bring up external PostgreSQL.
2. Run migrations as an explicit deployment step.
   - First install: `./scripts/install.sh production --target docker|linux ...`
   - Release change: `./scripts/install.sh upgrade --target docker|linux ...`
   - Underneath the public wrapper, Docker migrations/bootstrap still run from the DB lane (`riskhub-backend-db`) via `./scripts/deploy.sh deploy|upgrade --target docker ...` before the API/frontend rollout.
   - Underneath the public wrapper, Linux migrations/bootstrap still run from the unpacked `backend_db/` lane using `db-venv` via `./scripts/deploy.sh deploy|upgrade --target linux ...` before service restart.
3. Roll out the backend/API runtime only after migrations succeed.

`./scripts/install.sh upgrade ...` also creates a timestamped non-secret runtime backup before the release change. Database backups and secret backups remain operator-managed responsibilities.

The long-running runtime lane still keeps Alembic assets so schema-guard checks can resolve the current head at startup, but the public operator surface is `./scripts/install.sh` while the production migration/bootstrap execution path remains target-specific under `./scripts/deploy.sh`.

## Rollback posture

Some migrations are not trivially reversible (data transforms, enum/constraint changes).

Recommended rollback plan:
- Prefer **forward-fix** migrations for production incidents.
- Take DB backups before applying new migrations (or use PITR).
- When a rollback is required, treat it as a controlled DB operation, not an automatic app action.

## Operational checks

Before deploying:
- confirm the target DB is reachable with the production `DATABASE_URL`
- confirm `alembic upgrade head` succeeds in a staging environment
- confirm the release artifact version matches the intended application release

After deploying:
- verify backend health endpoint `GET /api/v1/health`
- check logs for startup guard failures (secrets/CORS/auth mode)
