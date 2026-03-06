# Database Migrations (Alembic)

> **Last Updated**: 2026-02-15  
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
   - Docker target: `scripts/deploy.sh deploy|upgrade --target docker ...` runs migrations before the API/frontend rollout.
   - Linux target: `scripts/deploy.sh deploy|upgrade --target linux ...` runs migrations from the unpacked release bundle before service restart.
3. Roll out the backend/API runtime only after migrations succeed.

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
