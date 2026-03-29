# Production Script Internals

`scripts/prod/` is now an internal implementation layer for the public deployment CLI:

```bash
./scripts/deploy.sh <install|upgrade|doctor|logs|rollback> --target docker|linux
```

Admins should use [`docs/deployment/production.md`](../../docs/deployment/production.md) and `./scripts/deploy.sh`.

## Retained Internal Helpers

- Docker-target component installs for backend, frontend, redis, migrations, and bootstrap flows.
- Internal runtime contracts consumed by `./scripts/deploy.sh --target docker`.
- Maintainer diagnostics such as `verify_runtime.sh`.

## Important Contract Change

- These scripts no longer accept raw secret values in `backend.env`.
- `backend.env` must contain only non-secret settings plus file references such as:
  - `DATABASE_URL_FILE`
  - `SECRET_KEY_FILE`
  - `ENTRA_CLIENT_SECRET_FILE`, or
  - `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT`
  - `ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE`
  - `REDIS_URL_FILE`
- Secret material lives outside this directory under the host-managed secret/runtime paths selected by `./scripts/deploy.sh`.

## Common Flags

Retained internal helper scripts still commonly support:

- `--backend-env /path/backend.env`
- `--frontend-env /path/frontend.env`
- `--dry-run`
- `--yes`
- `--verbose`

## Internal Notes

- Rollbacks do not downgrade the database. Use forward-fix migrations plus backups/PITR.
- Scheduler stays a dedicated backend container with `ENABLE_SCHEDULER=true` and `--workers 1`.
- Docker containers mount host secret and runtime directories instead of receiving secret values through container environment metadata.
- `smoke_test.sh` now validates reliability runtime invariants in addition to basic health:
  - `scheduler_job_runs` and `app_outbox_events` exist
  - exactly one active scheduler runtime row exists
  - dead-letter outbox count is zero
