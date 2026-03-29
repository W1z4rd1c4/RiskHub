# RiskHub Deployment

> **Last Updated**: 2026-03-29
> **Audience**: IT / DevOps / Platform Engineering

Back to tree: [`../DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

Development Docker startup is documented separately in [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/development/README.md`](../development/README.md). This document remains production-only.

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
- Scheduler ownership is enforced in-app with a Postgres advisory lock and recorded in `scheduler_job_runs`.
- Post-commit side effects are dispatched from the transactional outbox table `app_outbox_events`.
- Production runs with `DEBUG=false`, `MOCK_AUTH_ENABLED=false`, `AUTH_MODE=microsoft_sso`.

## Read This First

| Doc | Purpose |
|---|---|
| [production.md](./production.md) | Operator quickstart for install, doctor, upgrade, logs, and rollback |
| [reference.md](./reference.md) | Config keys, derived values, command reference, runtime defaults |
| [advanced.md](./advanced.md) | Maintainer details, release artifacts, and internal implementation mapping |
| [migrations.md](./migrations.md) | Migration strategy and rollback posture |
| [security-checklist.md](./security-checklist.md) | Hardening checklist before and after go-live |

## Public Interface

```bash
./scripts/deploy.sh <install|upgrade|doctor|logs|rollback> --target docker|linux
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
- `./scripts/deploy.sh doctor ...` validates frontend/API readiness, disabled docs endpoints, reliability tables, one active scheduler runtime row, and zero dead-letter outbox rows.
