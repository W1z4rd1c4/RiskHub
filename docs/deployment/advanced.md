# Deployment Advanced Notes

> **Last Updated**: 2026-03-29
> **Audience**: Maintainers / release engineering

## Internal Script Mapping

The public production surface is `./scripts/deploy.sh install|upgrade|doctor|logs|rollback`.

Everything below is maintainer-only implementation detail. The internal script names listed here are not part of the public operator contract.

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
  - one backend image for API/scheduler plus DB preflight, migrations, and bootstrap
- Linux executor manages:
  - release unpack under `/opt/riskhub/releases/<version>`
  - one release `venv` creation from the bundled wheelhouse
  - nginx render + validation
  - systemd unit render + install
  - migrations, base seed, SSO bootstrap from `backend/`

## Release Artifacts

The release workflow publishes:

- `ghcr.io/<owner>/riskhub-backend:<version>`
- `ghcr.io/<owner>/riskhub-frontend:<version>`
- `ghcr.io/<owner>/riskhub-redis:<version>`
- `riskhub-linux-<version>.tar.gz`

Linux bundle contents:

- `backend/` with app source, Alembic files, bootstrap scripts, and both runtime + DB requirements
- shared offline Python wheelhouse
- one `venv` is created at install time from that shared wheelhouse
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

## Linux Runtime Topology

- nginx serves the SPA and proxies `/api` to `127.0.0.1:8000`
- `riskhub-backend.service` runs the API on `127.0.0.1:8000`
- `riskhub-scheduler.service` runs a separate singleton app instance on `127.0.0.1:8001`
- `riskhub-redis.service` runs local Redis using the host secret file
- the runtime service lane reads from `current/backend` with `current/venv`
- DB lifecycle tasks run from `current/backend` with `current/venv`
