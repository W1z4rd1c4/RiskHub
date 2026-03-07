# Production Quickstart

> **Last Updated**: 2026-03-06
> **Audience**: Production administrators

## Choose A Target

- `docker`: use on a single Linux server with Docker available
- `linux`: use on an Azure Linux VM or generic Linux VM without Docker

Both targets require:

- external PostgreSQL
- a public RiskHub URL
- Microsoft Entra app credentials
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
./scripts/deploy.sh init --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

or

```bash
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

`ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` stay in the non-secret config. Database credentials, `SECRET_KEY`, `ENTRA_CLIENT_SECRET`, and the Redis password live in `/etc/riskhub/secrets/`. `secrets-edit` keeps its temporary edit buffer on the same host-managed deployment path as the secret directory, not under `/tmp`.

## 3. Run Preflight

```bash
./scripts/deploy.sh preflight --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

```bash
./scripts/deploy.sh preflight --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

Preflight validates the config, target prerequisites, secret directory permissions, placeholder-secret removal, and the frontend bind port.

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
  --frontend-image ghcr.io/<owner>/riskhub-frontend:v1.2.3 \
  --redis-image ghcr.io/<owner>/riskhub-redis:v1.2.3
```

Linux target:

```bash
./scripts/deploy.sh deploy \
  --target linux \
  --config /etc/riskhub/riskhub.env \
  --secret-dir /etc/riskhub/secrets \
  --bundle ./riskhub-linux-v1.2.3.tar.gz
```

Linux deployments install releases under `/opt/riskhub/releases/<version>`, switch `/opt/riskhub/current`, render systemd/nginx files, run migrations/bootstrap, and restart services.

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
