# Database Migrations (Alembic)

> **Last Updated**: 2026-03-29  
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
2. Run migrations as an explicit install or upgrade step.
   - `./scripts/deploy.sh install --target docker ...` or `./scripts/deploy.sh upgrade --target docker ...` runs migrations and bootstrap before the API/frontend rollout.
   - `./scripts/deploy.sh install --target linux ...` or `./scripts/deploy.sh upgrade --target linux ...` runs migrations and bootstrap before service restart.
3. Roll out the backend/API runtime only after migrations succeed.

The long-running runtime lane still keeps Alembic assets so schema-guard checks can resolve the current head at startup, but it does not own the production migration/bootstrap execution path.

## Rollback posture

Some migrations are not trivially reversible (data transforms, enum/constraint changes).

Recommended rollback plan:
- Prefer **forward-fix** migrations for production incidents.
- Take DB backups before applying new migrations (or use PITR).
- When a rollback is required, treat it as a controlled DB operation, not an automatic app action.

## Operational checks

Before `install` or `upgrade`:
- confirm the target DB is reachable with the production `DATABASE_URL`
- confirm `alembic upgrade head` succeeds in a staging environment
- confirm the release artifact version matches the intended application release

After `install` or `upgrade`:
- verify backend health endpoint `GET /api/v1/health`
- check logs for startup guard failures (secrets/CORS/auth mode)
