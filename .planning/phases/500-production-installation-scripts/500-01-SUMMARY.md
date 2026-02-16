# Plan 500-01 Summary: Deployment Contract + External-PostgreSQL Env Templates

## Completed: 2026-02-16

### Scope Delivered

- Added Phase 500 split env templates for production installs with external PostgreSQL.
- Documented the external-DB topology (no DB container) and the Redis requirement in production mode.
- Added explicit bootstrap knobs to avoid SSO admin lockout (pre-provision by email).
- Added an operator note for `REDIS_URL`: scripts compute/inject it because `docker --env-file` does not expand `${VARS}`.

### Files Changed

| File | Change |
|------|--------|
| `.env.example` | MODIFY |
| `scripts/prod/config/backend.env.example` | NEW |
| `scripts/prod/config/frontend.env.example` | NEW |
| `scripts/prod/config/README.md` | NEW |

### Verification

- `scripts/prod/preflight.sh --backend-env scripts/prod/config/backend.env.example --frontend-env scripts/prod/config/frontend.env.example --dry-run` → `Preflight: OK`
- `rg -n "DATABASE_URL|AUTH_MODE|SECRET_KEY|REDIS_URL" .env.example scripts/prod/config/backend.env.example` → contract present

### Outcome

Operators have a decision-complete configuration contract (`backend.env` + `frontend.env`) for the Phase 500 install path.

