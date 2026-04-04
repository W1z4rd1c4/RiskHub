# RiskHub Deployment

> **Last Updated**: 2026-04-04
> **Audience**: IT / DevOps / Platform Engineering

Back to tree: [`../DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

Development Docker startup is documented separately in [`docs/development/README.md`](../development/README.md). This document remains production-only.

## Production Model

RiskHub has one production deployment model with two supported targets:

- `docker`: single Linux host with Docker, external PostgreSQL, Redis container, frontend/API same-origin on one host/domain
- `linux`: Azure Linux VM or generic Linux VM without Docker, external PostgreSQL, local Redis managed by `riskhub-redis.service`, nginx + systemd

Common rules across both targets:

- External PostgreSQL is mandatory.
- Operators edit `/etc/riskhub/riskhub.env` for non-secrets and `/etc/riskhub/secrets/` for secrets.
- The public guided installer is `./scripts/install.sh production --target docker|linux`.
- The admin entrypoint underneath it is `./scripts/deploy.sh`.
- The frontend serves the SPA and proxies `/api` on the same origin.
- The scheduler runs as a separate singleton runtime.
- Scheduler ownership is enforced in-app with a Postgres advisory lock and recorded in `scheduler_job_runs`.
- Post-commit side effects are dispatched from the transactional outbox table `app_outbox_events`.
- Production runs with `DEBUG=false`, `MOCK_AUTH_ENABLED=false`, `AUTH_MODE=microsoft_sso`.

## Read This First

| Doc | Purpose |
|---|---|
| [production.md](./production.md) | Operator quickstart for install, upgrade, smoke, logs, and rollback |
| [reference.md](./reference.md) | Config keys, derived values, command reference, runtime defaults |
| [advanced.md](./advanced.md) | Maintainer details, release artifacts, and internal implementation mapping |
| [releasing.md](./releasing.md) | Tagging, changelog, and GitHub Release publication flow |
| [migrations.md](./migrations.md) | Migration strategy and rollback posture |
| [security-checklist.md](./security-checklist.md) | Hardening checklist before and after go-live |

## Public Interface

```bash
./scripts/install.sh production --target docker|linux
```

Day 2 lifecycle commands:

```bash
./scripts/install.sh status --mode production --target docker|linux
./scripts/install.sh logs --mode production --target docker|linux --tail 200 --follow
./scripts/install.sh doctor --mode production --target docker|linux [--repair]
./scripts/install.sh upgrade --target docker|linux
```

Advanced/manual admin interface:

```bash
./scripts/deploy.sh <init|secrets-init|secrets-edit|secrets-check|preflight|deploy|upgrade|status|logs|smoke|rollback> --target docker|linux
```

Release inputs:

- `docker`: pull versioned GHCR images (`riskhub-backend:<version>`, `riskhub-backend-db:<version>`, `riskhub-frontend:<version>`, `riskhub-redis:<version>`)
- `linux`: deploy `riskhub-linux-<version>.tar.gz`

## Runtime Notes

- Redis is required in production.
- `/docs` and `/openapi.json` must stay disabled in production.
- The scheduler must run exactly once:
  - Docker target: dedicated scheduler container
  - Linux target: dedicated `riskhub-scheduler.service`
- `./scripts/deploy.sh smoke ...` validates frontend/API readiness, disabled docs endpoints, reliability tables, one active scheduler runtime row, and zero dead-letter outbox rows.
- `./scripts/install.sh upgrade ...` creates a timestamped non-secret backup under the runtime directory before it runs `preflight`, `upgrade`, `status`, and `smoke`.
- Secret files and the database remain operator-managed backup responsibilities before release changes.
