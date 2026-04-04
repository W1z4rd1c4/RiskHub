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

```bash
./scripts/install.sh production --target docker --version v1.2.3
```

or

```bash
./scripts/install.sh production --target linux --bundle ./riskhub-linux-v1.2.3.tar.gz
```

The guided installer initializes config if needed, prompts for the required non-secret values, reuses `./scripts/deploy.sh secrets-edit ...` for secret capture, then runs `preflight`, `deploy`, `status`, and `smoke`.

Advanced/manual config scaffolding remains available:

```bash
./scripts/deploy.sh init --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
./scripts/deploy.sh init --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

`init` creates the non-secret config, the secret-file scaffold, and the persistent runtime directory under `/etc/riskhub/runtime` (or your configured runtime path).

Edit `/etc/riskhub/riskhub.env` for non-secrets and then run:

```bash
./scripts/deploy.sh secrets-edit --target docker --secret-dir /etc/riskhub/secrets
```

or

```bash
./scripts/deploy.sh secrets-edit --target linux --secret-dir /etc/riskhub/secrets
```

`ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` stay in the non-secret config. Database credentials, `SECRET_KEY`, and the Redis password live in `/etc/riskhub/secrets/`. `init` scaffolds both optional Entra secret files so the secret directory layout is ready for either confidential-credential mode. For Entra Graph credentials, production supports either `ENTRA_CLIENT_SECRET_FILE` or the preferred certificate mode: `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT` in `riskhub.env` plus the PEM private key at `/etc/riskhub/secrets/entra_client_certificate_private_key`. `secrets-edit` keeps its temporary edit buffer on the same host-managed deployment path as the secret directory, not under `/tmp`, and remains line-based, so certificate PEM material should be managed directly in the dedicated secret file rather than pasted into `secrets-edit`. The unused optional Entra file may remain on its scaffold placeholder; preflight validates only the credential mode selected by `riskhub.env`.

## 3. Run Preflight

```bash
./scripts/deploy.sh preflight --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

```bash
./scripts/deploy.sh preflight --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

Preflight validates the config, target prerequisites, secret directory permissions, placeholder-secret removal for required secrets, the active Entra confidential credential mode, and the frontend bind port.

## 4. Deploy

Docker target:

```bash
./scripts/deploy.sh deploy --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --version v1.2.3
```

If you need explicit image refs instead of version-derived GHCR refs:

```bash
./scripts/deploy.sh deploy \
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
./scripts/deploy.sh deploy \
  --target linux \
  --config /etc/riskhub/riskhub.env \
  --secret-dir /etc/riskhub/secrets \
  --bundle ./riskhub-linux-v1.2.3.tar.gz
```

Linux deployments install releases under `/opt/riskhub/releases/<version>`, switch `/opt/riskhub/current`, render systemd/nginx files, run migrations/bootstrap, and restart services. The unpacked release keeps the long-running runtime lane under `backend/` and the DB/bootstrap lane under `backend_db/`.

## 5. Verify

```bash
./scripts/deploy.sh status --target docker
./scripts/deploy.sh smoke --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

```bash
./scripts/deploy.sh status --target linux
./scripts/deploy.sh smoke --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

Logs:

```bash
./scripts/deploy.sh logs --target docker --service all --tail 200
./scripts/deploy.sh logs --target linux --service all --tail 200
```

The smoke step now also validates reliability runtime state:

- `scheduler_job_runs` exists
- `app_outbox_events` exists
- exactly one running `__scheduler_runtime__` row is present
- dead-letter outbox count is `0`

If smoke fails on reliability checks, inspect the scheduler first:

```bash
./scripts/deploy.sh logs --target docker --service scheduler --tail 200
./scripts/deploy.sh logs --target linux --service scheduler --tail 200
```

For Docker maintainer diagnostics, you can also run:

```bash
scripts/prod/verify_runtime.sh
```

## 6. Upgrade

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

## 7. Rollback

Docker target:

```bash
./scripts/deploy.sh rollback --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --service all
```

Linux target:

```bash
./scripts/deploy.sh rollback --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

Rollback does not downgrade the database. Use forward-fix migrations and backups/PITR for database incidents.
