# Production Quickstart

> **Last Updated**: 2026-03-29
> **Audience**: Production administrators

## Choose A Target

- `docker`: use on a single Linux server with Docker available
- `linux`: use on an Azure Linux VM or generic Linux VM without Docker

Both targets require:

- external PostgreSQL
- a public RiskHub URL
- Microsoft Entra app credentials, including one confidential credential method for Graph (`client secret` or `certificate credential`)
- access to the release assets for the version you want to deploy
- an encrypted host disk or encrypted mount for `/etc/riskhub`

## 1. Prepare The Host

Docker target:

- Linux host
- Docker Engine running
- outbound access to `ghcr.io`

Linux target:

- Linux host with `systemd`
- `python3.13`
- `nginx`
- `redis-server`
- `curl`

TLS termination is expected to be pre-provisioned on the host or upstream.

## 2. Create The Operator Config

Copy the shipped non-secret example to `/etc/riskhub/riskhub.env`, then create the required files under `/etc/riskhub/secrets/`.

Keep in `riskhub.env`:

- `PUBLIC_URL`
- `ENTRA_TENANT_ID`
- `ENTRA_CLIENT_ID`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_CRO_EMAIL`

Create these required secret files:

- `database_url`
- `secret_key`
- `redis_password`

Choose one Entra confidential credential mode:

- client secret mode: `entra_client_secret`
- certificate mode: `entra_client_certificate_private_key` plus `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT` in `riskhub.env`

`ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` stay in the non-secret config. Database credentials, `SECRET_KEY`, and the Redis password live in `/etc/riskhub/secrets/`. Certificate PEM material should stay in its dedicated secret file and should never be pasted into non-secret config.

## 3. Install

Docker target:

```bash
./scripts/deploy.sh install --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --version v1.2.3
```

If you need explicit image refs instead of version-derived GHCR refs:

```bash
./scripts/deploy.sh install \
  --target docker \
  --config /etc/riskhub/riskhub.env \
  --secret-dir /etc/riskhub/secrets \
  --backend-image ghcr.io/<owner>/riskhub-backend:v1.2.3 \
  --backend-db-image ghcr.io/<owner>/riskhub-backend-db:v1.2.3 \
  --frontend-image ghcr.io/<owner>/riskhub-frontend:v1.2.3 \
  --redis-image ghcr.io/<owner>/riskhub-redis:v1.2.3
```

Docker uses the runtime image for the API and scheduler containers, and the DB image for DB preflight, migrations, and bootstrap seeding.

Linux target:

```bash
./scripts/deploy.sh install \
  --target linux \
  --config /etc/riskhub/riskhub.env \
  --secret-dir /etc/riskhub/secrets \
  --bundle ./riskhub-linux-v1.2.3.tar.gz
```

Linux deployments install releases under `/opt/riskhub/releases/<version>`, switch `/opt/riskhub/current`, render systemd/nginx files, run migrations/bootstrap, and restart services. The unpacked release keeps the long-running runtime lane under `backend/` and the DB/bootstrap lane under `backend_db/`.

`install` runs config validation, target preflight, rollout, and the built-in post-install doctor checks.

## 4. Verify

```bash
./scripts/deploy.sh doctor --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

```bash
./scripts/deploy.sh doctor --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

Logs:

```bash
./scripts/deploy.sh logs --target docker --service all --tail 200
./scripts/deploy.sh logs --target linux --service all --tail 200
```

The doctor step also validates reliability runtime state:

- `scheduler_job_runs` exists
- `app_outbox_events` exists
- exactly one running `__scheduler_runtime__` row is present
- dead-letter outbox count is `0`

If doctor fails on reliability checks, inspect the scheduler first:

```bash
./scripts/deploy.sh logs --target docker --service scheduler --tail 200
./scripts/deploy.sh logs --target linux --service scheduler --tail 200
```

For Docker maintainer diagnostics, you can also run:

```bash
scripts/prod/verify_runtime.sh
```

## 5. Upgrade

Docker target:

```bash
./scripts/deploy.sh upgrade --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --version v1.2.4
```

Linux target:

```bash
./scripts/deploy.sh upgrade \
  --target linux \
  --config /etc/riskhub/riskhub.env \
  --secret-dir /etc/riskhub/secrets \
  --bundle ./riskhub-linux-v1.2.4.tar.gz
```

The upgrade path keeps database migrations explicit and preserves rollback metadata for the application release only.

## 6. Rollback

Docker target:

```bash
./scripts/deploy.sh rollback --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --service all
```

Linux target:

```bash
./scripts/deploy.sh rollback --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

Rollback does not downgrade the database. Use forward-fix migrations and backups/PITR for database incidents.
