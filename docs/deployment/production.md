# Production Quickstart

> **Last Updated**: 2026-04-05
> **Audience**: Production administrators

## Choose A Target

- `docker`: use on a single Linux server with Docker available
- `linux`: use on an Azure Linux VM or generic Linux VM without Docker

Both targets require:

- external PostgreSQL
- a public RiskHub URL
- Microsoft Entra app credentials, including one confidential credential method for Graph (`client secret` or `certificate credential`)
- Enterprise App assignment required enabled for the RiskHub application before first production sign-in
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
./scripts/install.sh production \
  --target docker \
  --backend-image ghcr.io/<owner>/riskhub-backend:v1.2.3@sha256:<64-hex-digest> \
  --backend-db-image ghcr.io/<owner>/riskhub-backend-db:v1.2.3@sha256:<64-hex-digest> \
  --frontend-image ghcr.io/<owner>/riskhub-frontend:v1.2.3@sha256:<64-hex-digest> \
  --redis-image ghcr.io/<owner>/riskhub-redis:v1.2.3@sha256:<64-hex-digest>
```

or

```bash
./scripts/install.sh production --target linux --bundle ./riskhub-linux-v1.2.3.tar.gz
```

The guided installer initializes config if needed, prompts for the required non-secret values, reuses `./scripts/deploy.sh secrets-edit ...` for secret capture, refuses unresolved placeholders, then runs `preflight`, `deploy`, `status`, and `smoke`. `./scripts/install.sh` remains the supported operator surface even though the lifecycle control plane now runs through `scripts/install_cli.py` and `scripts/install_lib/`.

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

`ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, and the production `ALLOWED_HOSTS` allowlist stay in the non-secret config. Database credentials, `SECRET_KEY`, and the Redis password live in `/etc/riskhub/secrets/`. `init` scaffolds both optional Entra secret files so the secret directory layout is ready for either confidential-credential mode. For Entra Graph credentials, production supports either `ENTRA_CLIENT_SECRET_FILE` or the preferred certificate mode: `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT` in `riskhub.env` plus the PEM private key at `/etc/riskhub/secrets/entra_client_certificate_private_key`. `secrets-edit` keeps its temporary edit buffer on the same host-managed deployment path as the secret directory, not under `/tmp`, and remains line-based, so certificate PEM material should be managed directly in the dedicated secret file rather than pasted into `secrets-edit`. The unused optional Entra file may remain on its scaffold placeholder; preflight validates only the credential mode selected by `riskhub.env` and warns when production still uses client-secret mode.

If you enable read-only Entra business-role metadata in RiskHub, set `ENTRA_BUSINESS_ROLE_ATTRIBUTE_NAME=riskhubBusinessRole` in `/etc/riskhub/riskhub.env`, create that directory extension on the RiskHub app registration, and add the matching optional ID-token claim before rollout.

For Entra credential rotation, follow the rolling restart runbook in `docs/deployment/runbooks/entra-credential-rotation.md`. `ENTRA_CREDENTIAL_FINGERPRINT` is a cache-key hint, not a substitute for restarting workers.

Rendered production runtime config is intentionally opinionated:

- `DIRECTORY_PROVIDER=graph`
- `ENTRA_JIT_PROVISIONING_ENABLED=false`
- `AUTH_SSO_ALLOW_EMAIL_LINK=false`
- `AD_DEPROVISION_CHECK_INTERVAL_MINUTES=15`

That 15-minute deprovision interval is the current Entra disablement revocation SLA floor. A disabled Entra user is revoked in RiskHub on the next deprovision check plus any remaining access-token lifetime.

Bootstrap users are now pre-linked to Entra before first login. The bootstrap script resolves an exact directory match by email or UPN, sets `external_id`, and fails closed when zero or multiple exact matches are found.

## 3. Run Preflight

```bash
./scripts/deploy.sh preflight --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

```bash
./scripts/deploy.sh preflight --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

Preflight validates the config, target prerequisites, explicit production `ALLOWED_HOSTS`, secret directory permissions, placeholder-secret removal for required secrets, the active Entra confidential credential mode, Graph-only production invariants, and the frontend bind port.

## 4. Deploy

Docker target:

```bash
./scripts/deploy.sh deploy \
  --target docker \
  --config /etc/riskhub/riskhub.env \
  --secret-dir /etc/riskhub/secrets \
  --backend-image ghcr.io/<owner>/riskhub-backend:v1.2.3@sha256:<64-hex-digest> \
  --backend-db-image ghcr.io/<owner>/riskhub-backend-db:v1.2.3@sha256:<64-hex-digest> \
  --frontend-image ghcr.io/<owner>/riskhub-frontend:v1.2.3@sha256:<64-hex-digest> \
  --redis-image ghcr.io/<owner>/riskhub-redis:v1.2.3@sha256:<64-hex-digest>
```

Docker deploy and upgrade require immutable image references for backend, backend DB, frontend, and redis. Tag-only refs and `--version` defaults are refused unless a future digest manifest resolves them to `@sha256:<64-hex-digest>` refs.

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

## 4.1 SSO Compatibility Cutover

The SSO challenge flow is mandatory for every deployment. Once the stricter build is live, revoke legacy refresh rows:

```bash
python -m scripts.revoke_refresh_sessions --reason sso_absolute_expiry_cutover
```

This revokes active refresh sessions without mass-bumping `token_version`, so already-issued access tokens expire naturally.

## 5. Verify

```bash
./scripts/install.sh status --mode production --target docker
./scripts/install.sh verify --mode production --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

```bash
./scripts/install.sh status --mode production --target linux
./scripts/install.sh verify --mode production --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

Logs:

```bash
./scripts/install.sh logs --mode production --target docker --tail 200 --follow
./scripts/install.sh logs --mode production --target linux --tail 200 --follow
```

The smoke step now also validates reliability runtime state:

- `scheduler_job_runs` exists
- `app_outbox_events` exists
- exactly one running `__scheduler_runtime__` row is present
- dead-letter outbox count is `0`

If verification or runtime state looks wrong, start with the doctor command:

```bash
./scripts/install.sh doctor --mode production --target docker
./scripts/install.sh doctor --mode production --target linux
```

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
./scripts/install.sh upgrade \
  --target docker \
  --config /etc/riskhub/riskhub.env \
  --secret-dir /etc/riskhub/secrets \
  --backend-image ghcr.io/<owner>/riskhub-backend:v1.2.4@sha256:<64-hex-digest> \
  --backend-db-image ghcr.io/<owner>/riskhub-backend-db:v1.2.4@sha256:<64-hex-digest> \
  --frontend-image ghcr.io/<owner>/riskhub-frontend:v1.2.4@sha256:<64-hex-digest> \
  --redis-image ghcr.io/<owner>/riskhub-redis:v1.2.4@sha256:<64-hex-digest>
```

Linux target:

```bash
./scripts/install.sh upgrade \
  --target linux \
  --config /etc/riskhub/riskhub.env \
  --secret-dir /etc/riskhub/secrets \
  --bundle ./riskhub-linux-v1.2.4.tar.gz
```

The upgrade path creates a timestamped non-secret backup under the runtime directory before it runs `preflight`, `upgrade`, `status`, and `smoke`.

Before release changes:

- back up secret material through your normal operator-managed process
- take a database backup or ensure PITR is available
- keep the non-secret runtime backup created by `install.sh upgrade` for rollback and forensic context

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
