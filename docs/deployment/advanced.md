# Deployment Advanced Notes

> **Last Updated**: 2026-04-04
> **Audience**: Maintainers / release engineering

## Internal Script Mapping

The public production surface is `./scripts/install.sh production --target docker|linux`.

The advanced/manual admin interface underneath it is `./scripts/deploy.sh`.

Internal implementation details:

- Docker executor wraps the existing `scripts/prod/*` lifecycle:
  - `preflight.sh`
  - `install_redis.sh`
  - `run_migrations.sh`
  - `bootstrap_db.sh`
  - `install_backend.sh`
  - `install_frontend.sh`
  - `smoke_test.sh`
  - `rollback.sh`
  - `status.sh`
  - `logs.sh`
  - `verify_runtime.sh`
  - runtime image for API/scheduler plus DB image for preflight, migrations, and bootstrap
- Linux executor manages:
  - release unpack under `/opt/riskhub/releases/<version>`
  - runtime `venv` plus DB-task `db-venv` creation from the bundled wheelhouse
  - nginx render + validation
  - systemd unit render + install
  - migrations, base seed, SSO bootstrap from `backend_db/`

## Release Artifacts

The release workflow publishes:

- `ghcr.io/<owner>/riskhub-backend:<version>`
- `ghcr.io/<owner>/riskhub-backend-db:<version>`
- `ghcr.io/<owner>/riskhub-frontend:<version>`
- `ghcr.io/<owner>/riskhub-redis:<version>`
- `riskhub-linux-<version>.tar.gz`

Linux bundle contents:

- `backend/` runtime lane with app source, Alembic files, and runtime requirements
- `backend_db/` DB/bootstrap lane with the retained bootstrap scripts and DB requirements
- shared offline Python wheelhouse
- `venv` and `db-venv` are created at install time from that shared wheelhouse
- frontend `dist`
- deploy templates
- manifest with version metadata

Builder:

```bash
scripts/release/build_linux_bundle.sh --version v1.2.3
```

The builder is Linux-only so the bundled wheelhouse matches the Linux deployment target.

Maintainer note:

- rendered `metadata.env` is intentionally shell-sourced by deploy helpers and must remain safe to `source`, including when paths contain spaces
- `install-state.json` is the public-wrapper lifecycle state file and should stay JSON-only, additive, and safe for machine reads

## Linux Runtime Topology

- nginx serves the SPA and proxies `/api` to `127.0.0.1:8000`
- `riskhub-backend.service` runs the API on `127.0.0.1:8000`
- `riskhub-scheduler.service` runs a separate singleton app instance on `127.0.0.1:8001`
- `riskhub-redis.service` runs local Redis using the host secret file
- the runtime service lane reads from `current/backend` with `current/venv`
- DB lifecycle tasks run from `current/backend_db` with `current/db-venv`
