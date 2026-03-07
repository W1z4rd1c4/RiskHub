# RiskHub Deployment

> **Last Updated**: 2026-03-06
> **Audience**: IT / DevOps / Platform Engineering

Back to tree: [`../DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

## Production Model

RiskHub has one production deployment model with two supported targets:

- `docker`: single Linux host with Docker, external PostgreSQL, Redis container, frontend/API same-origin on one host/domain
- `linux`: Azure Linux VM or generic Linux VM without Docker, external PostgreSQL, local Redis managed by `riskhub-redis.service`, nginx + systemd

Common rules across both targets:

- External PostgreSQL is mandatory.
- Operators edit `/etc/riskhub/riskhub.env` for non-secrets and `/etc/riskhub/secrets/` for secrets.
- The admin entrypoint is `./scripts/deploy.sh`.
- The frontend serves the SPA and proxies `/api` on the same origin.
- The scheduler runs as a separate singleton runtime.
- Production runs with `DEBUG=false`, `MOCK_AUTH_ENABLED=false`, `AUTH_MODE=microsoft_sso`.

## Read This First

| Doc | Purpose |
|---|---|
| [production.md](./production.md) | Operator quickstart for install, upgrade, smoke, logs, and rollback |
| [reference.md](./reference.md) | Config keys, derived values, command reference, runtime defaults |
| [advanced.md](./advanced.md) | Maintainer details, release artifacts, legacy/internal script mapping |
| [migrations.md](./migrations.md) | Migration strategy and rollback posture |
| [security-checklist.md](./security-checklist.md) | Hardening checklist before and after go-live |

## Public Interface

```bash
./scripts/deploy.sh <init|secrets-init|secrets-edit|secrets-check|preflight|deploy|upgrade|status|logs|smoke|rollback> --target docker|linux
```

Release inputs:

- `docker`: pull versioned GHCR images (`riskhub-backend:<version>`, `riskhub-frontend:<version>`, `riskhub-redis:<version>`)
- `linux`: deploy `riskhub-linux-<version>.tar.gz`

## Runtime Notes

- Redis is required in production.
- `/docs` and `/openapi.json` must stay disabled in production.
- The scheduler must run exactly once:
  - Docker target: dedicated scheduler container
  - Linux target: dedicated `riskhub-scheduler.service`

## Legacy Notes

The public operator surface is `./scripts/deploy.sh`.

Retained internal Docker helper layer:

- `scripts/prod/preflight.sh`
- `scripts/prod/install_redis.sh`
- `scripts/prod/run_migrations.sh`
- `scripts/prod/bootstrap_db.sh`
- `scripts/prod/install_backend.sh`
- `scripts/prod/install_frontend.sh`
- `scripts/prod/smoke_test.sh`
- `scripts/prod/rollback.sh`
- `scripts/prod/status.sh`
- `scripts/prod/logs.sh`
- `scripts/prod/verify_runtime.sh`

Retired legacy orchestration entrypoints:

- `scripts/prod/setup.sh`
- `scripts/prod/deploy.sh`
- `scripts/prod/upgrade.sh`
- `scripts/prod/stop.sh`

Those retired wrappers are deprecated, unsupported, and kept only as redirect stubs to `./scripts/deploy.sh`.
