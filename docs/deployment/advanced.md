# Deployment Advanced Notes

> **Last Updated**: 2026-03-06
> **Audience**: Maintainers / release engineering

## Internal Script Mapping

The public production surface is `scripts/deploy.sh`.

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
- Linux executor manages:
  - release unpack under `/opt/riskhub/releases/<version>`
  - virtualenv creation from the bundled wheelhouse
  - nginx render + validation
  - systemd unit render + install
  - migrations, base seed, SSO bootstrap

## Release Artifacts

The release workflow publishes:

- `ghcr.io/<owner>/riskhub-backend:<version>`
- `ghcr.io/<owner>/riskhub-frontend:<version>`
- `ghcr.io/<owner>/riskhub-redis:<version>`
- `riskhub-linux-<version>.tar.gz`

Linux bundle contents:

- backend app source
- Alembic files
- backend operational scripts
- offline Python wheelhouse
- frontend `dist`
- deploy templates
- manifest with version metadata

Builder:

```bash
scripts/release/build_linux_bundle.sh --version v1.2.3
```

The builder is Linux-only so the bundled wheelhouse matches the Linux deployment target.

## Linux Runtime Topology

- nginx serves the SPA and proxies `/api` to `127.0.0.1:8000`
- `riskhub-backend.service` runs the API on `127.0.0.1:8000`
- `riskhub-scheduler.service` runs a separate singleton app instance on `127.0.0.1:8001`
- `riskhub-redis.service` runs local Redis using the host secret file

## Legacy / Non-Primary Paths

These are not first-class production paths anymore:

- Docker Compose with dockerized PostgreSQL
- Kubernetes guidance without repo-managed manifests
- direct operator use of `scripts/prod/*`

Keep them only for historical context or maintainer migration work, not as the recommended admin flow.
