# Production Quickstart

> **Last Updated**: 2026-03-29
> **Audience**: Production administrators

## Choose A Target

- `docker`: use on a single Linux server with Docker available
- `linux`: use on an Azure Linux VM or generic Linux VM without Docker

Both targets follow the same operator flow:

1. prepare the host
2. create `/etc/riskhub/riskhub.env` and `/etc/riskhub/secrets/` from the target's shipped examples
3. run `install` from the target's deploy surface
4. run `doctor` and inspect `logs` if needed
5. use `upgrade` for new releases
6. use `rollback` only for application release rollback

Both targets require:

- external PostgreSQL
- a public RiskHub URL
- Microsoft Entra app credentials, including one confidential credential method for Graph (`client secret` or `certificate credential`)
- access to the release assets for the version you want to deploy
- an encrypted host disk or encrypted mount for `/etc/riskhub`

## 1. Prepare The Host

Shared requirements:

- Linux host
- outbound access to the release source you plan to use
- TLS termination already handled on the host or upstream

Target-specific requirements:

- `docker`
  - Docker Engine running
  - outbound access to `ghcr.io`
- `linux`
  - `systemd`
  - `python3.13`
  - `nginx`
  - `redis-server`
  - `curl`

## 2. Create The Operator Config

Use the shipped examples as your starting point:

- Docker: repo `scripts/deploy/templates/riskhub.env.example` and `scripts/deploy/templates/secrets/README.md`
- Linux: extract the release tarball and use the bundled `scripts/deploy/templates/riskhub.env.example` and `scripts/deploy/templates/secrets/README.md`

Copy `riskhub.env.example` to `/etc/riskhub/riskhub.env`, then create the required files under `/etc/riskhub/secrets/` using the matching example files without the `.example` suffix.

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

`ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` stay in the non-secret config. Database credentials, `SECRET_KEY`, and the Redis password live in `/etc/riskhub/secrets/`. The unused Entra file may be absent. If both Entra files are present, certificate mode is preferred only when `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT` is set. Certificate PEM material should stay in its dedicated secret file and should never be pasted into non-secret config.

## 3. Install

The public install flow is the same for both targets:

- pass the shared operator inputs: `--config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets`
- add the release input for your target
- run `install`

Docker target:

```bash
./scripts/deploy.sh install --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --version v1.2.3
```

Linux target:

```bash
tar -xzf riskhub-linux-v1.2.3.tar.gz
cd riskhub-linux-v1.2.3
./scripts/deploy.sh install --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --bundle ../riskhub-linux-v1.2.3.tar.gz
```

Keep the extracted Linux bundle directory on the host. The bundled `./scripts/deploy.sh` is the supported CLI for later `doctor`, `logs`, `upgrade`, and `rollback` runs against that target.

`install` runs config validation, target rollout tasks, and the built-in doctor checks automatically.

Maintainer note:

- Docker also supports explicit image overrides instead of `--version`. That path is kept for release engineering and is documented in [reference.md](./reference.md) and [advanced.md](./advanced.md), not as the primary operator quickstart.
- For Docker, the backend image owns API, scheduler, DB preflight, migrations, and bootstrap tasks. There is no separate Docker DB-task image in the public release contract.
- Linux installs releases under `/opt/riskhub/releases/<version>`, switches `/opt/riskhub/current`, renders systemd/nginx files, runs migrations/bootstrap, and restarts services.

## 4. Verify

Run `doctor` for the same target you installed:

```bash
./scripts/deploy.sh doctor --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
cd riskhub-linux-v1.2.3
./scripts/deploy.sh doctor --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

If you need runtime output, use `logs` for the same target:

```bash
./scripts/deploy.sh logs --target docker --service all --tail 200
cd riskhub-linux-v1.2.3
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

Use the same target-specific release input shape you used for `install`:

```bash
./scripts/deploy.sh upgrade --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --version v1.2.4
tar -xzf riskhub-linux-v1.2.4.tar.gz
cd riskhub-linux-v1.2.4
./scripts/deploy.sh upgrade --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --bundle ../riskhub-linux-v1.2.4.tar.gz
```

The upgrade path keeps database migrations explicit and preserves rollback metadata for the application release only.

## 6. Rollback

Run `rollback` against the same target:

```bash
./scripts/deploy.sh rollback --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --service all
cd riskhub-linux-v1.2.4
./scripts/deploy.sh rollback --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

Rollback does not downgrade the database. Use forward-fix migrations and backups/PITR for database incidents.
