# Database Migrations (Alembic)

> **Last Updated**: 2026-09-12
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

## Identity schema adoption

`t9u0v1w2x3y4` adds installation identity and separates local suspension from directory
eligibility. Drain all writers before applying it. Fresh installation binds before
user bootstrap; populated databases require the explicit `adopt-entra` report/dry-run
and verification sequence in [identity foundations](../security/identity-foundations.md).
The upgrade wrapper does not infer or repair a missing binding. User identities,
business ownership and revocation history must survive the migration.

Run `python -m scripts.identity_installation verify` in the release DB-task environment
before resuming API/scheduler instances. A failed check is a maintenance stop, not a
reason to enable debug, change tenant/provider, or downgrade the identity schema.

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
- verify backend readiness endpoint `GET /api/v1/readyz`
- verify diagnostic health endpoint `GET /api/v1/health`
- check logs for startup guard failures (secrets/CORS/auth mode)

The subsequent native migration `u0v1w2x3y4z5` adds grants, encrypted delivery/factors
and refresh metadata. It does not infer verified email or enrollment for existing users.
Its downgrade refuses credential loss. Preserve key backups, revocations and suspension
when restoring; the complete native restore/release acceptance remains #207/#208.
