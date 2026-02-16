# Plan 500-02 Summary: Backend Install + Redis + Migrations + DB Bootstrap

## Completed: 2026-02-16

### Scope Delivered

- Added a production Redis container installer (`riskhub-redis`) with password protection and persistence.
- Added backend installer supporting two instances:
  - API (`riskhub-backend`, network alias `backend`, scheduler disabled, optional host publish)
  - Scheduler (`riskhub-backend-scheduler`, scheduler enabled, workers forced to 1)
- Added a migrations runner that executes `alembic upgrade head` as an explicit step against external PostgreSQL.
- Added a DB bootstrap runner that:
  - seeds RBAC roles/permissions,
  - seeds departments,
  - bootstraps an initial SSO user by email (idempotent upsert).
- Added `backend/scripts/bootstrap_sso_user.py` (idempotent, role/scope validation, optional department resolution; preserves `external_id`).

### Files Changed

| File | Change |
|------|--------|
| `scripts/prod/install_redis.sh` | NEW |
| `scripts/prod/install_backend.sh` | NEW |
| `scripts/prod/run_migrations.sh` | NEW |
| `scripts/prod/bootstrap_db.sh` | NEW |
| `backend/scripts/bootstrap_sso_user.py` | NEW |

### Verification

- `cd backend && ./venv/bin/python -m compileall scripts/bootstrap_sso_user.py` → success
- `make verify-prod-install-scripts` → passed (`bash -n`, dockerized `shellcheck`, `tests/test_production_hardening.py`)

### Outcome

The backend install path is fully scripted for external PostgreSQL, including Redis provisioning, schema migrations, and RBAC/admin bootstrap required for safe SSO production operations.

