# Production Install Scripts (Phase 500)

These scripts implement a production install path where:

- Backend runs in its own Docker container (not published by default).
- Frontend runs in its own Docker container (published on `FRONTEND_HOST_PORT`).
- PostgreSQL is external (RiskHub scripts do not start a DB container).
- Redis is installed as a separate Docker container and is required for production mode.

Installation manual (recommended): `docs/deployment/installation-manual.md`

## Guided Setup (recommended)

If you want a single command that prompts for configuration, generates secrets, writes env files, runs preflight, and then deploys/updates:

```bash
scripts/prod/setup.sh
```

Dry-run (previews actions only):

```bash
scripts/prod/setup.sh --dry-run
```

## Common Flags

Most scripts support:

- `--backend-env /path/backend.env`
- `--frontend-env /path/frontend.env`
- `--dry-run`
- `--yes`
- `--verbose`

## Quick Start (new host)

```bash
scripts/prod/deploy.sh \
  --backend-env /etc/riskhub/backend.env \
  --frontend-env /etc/riskhub/frontend.env \
  --tag 1.0.0 \
  --yes
```

## Script Linting (no host shellcheck required)

```bash
docker run --rm -v "$PWD":/work -w /work koalaman/shellcheck:stable \
  -x scripts/prod/*.sh
```

## Notes

- Rollbacks do not downgrade the database. Use forward-fix migrations + backups/PITR.
- Scheduler is deployed as a dedicated backend container with `ENABLE_SCHEDULER=true` and `--workers 1`.
- For SSO safety, production deploy bootstraps privileged users by email. Configure `BOOTSTRAP_ADMIN_*` and `BOOTSTRAP_CRO_*` in your `backend.env`.
