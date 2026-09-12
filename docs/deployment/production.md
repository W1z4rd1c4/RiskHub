# Production Quickstart

> **Last Updated**: 2026-09-12
> **Audience**: Production administrators

## Choose A Target

- `docker`: use on a single Linux server with Docker available
- `linux`: use on an Azure Linux VM or generic Linux VM without Docker

Both targets require:

- external PostgreSQL
- a public HTTPS RiskHub URL
- for Entra: app credentials with one confidential Graph credential (`client secret` or `certificate credential`)
- for Entra: Enterprise App assignment required before first production sign-in
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

RiskHub does not terminate TLS itself. Both targets serve plaintext listeners
(the frontend public listener plus a loopback backend), so a TLS-terminating
reverse proxy or load balancer MUST sit in front of RiskHub in any environment
reachable by untrusted clients. Provision TLS before first production sign-in;
see [Reference TLS-terminating reverse proxy](security-checklist.md#reference-tls-terminating-reverse-proxy)
for a concrete nginx example and certificate-acquisition pointers.

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

`ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, and the production `ALLOWED_HOSTS` allowlist stay in the non-secret config. Database credentials, `SECRET_KEY`, and the Redis password live in `/etc/riskhub/secrets/`. For the Entra profile, `init` scaffolds both optional Entra secret files so the secret directory layout is ready for either confidential-credential mode. For Entra Graph credentials, production supports either `ENTRA_CLIENT_SECRET_FILE` or the preferred certificate mode: `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT` in `riskhub.env` plus the PEM private key at `/etc/riskhub/secrets/entra_client_certificate_private_key`. `secrets-edit` keeps its temporary edit buffer on the same host-managed deployment path as the secret directory, not under `/tmp`, and remains line-based, so certificate PEM material should be managed directly in the dedicated secret file rather than pasted into `secrets-edit`. The unused optional Entra file may remain on its scaffold placeholder; preflight validates only the credential mode selected by `riskhub.env` and warns when production still uses client-secret mode.

If you enable read-only Entra business-role metadata in RiskHub, set `ENTRA_BUSINESS_ROLE_ATTRIBUTE_NAME=riskhubBusinessRole` in `/etc/riskhub/riskhub.env`, create that directory extension on the RiskHub app registration, and add the matching optional ID-token claim before rollout.

For Entra credential rotation, follow the rolling restart runbook in `docs/deployment/runbooks/entra-credential-rotation.md`. `ENTRA_CREDENTIAL_FINGERPRINT` is a cache-key hint, not a substitute for restarting workers.

Rendered production runtime config is intentionally opinionated:

- `DIRECTORY_PROVIDER=graph`
- `ENTRA_JIT_PROVISIONING_ENABLED=false`
- `AUTH_SSO_ALLOW_EMAIL_LINK=false`
- `REFRESH_TOKEN_MIGRATION_GRACE=false`
- `ACCESS_TOKEN_EXPIRE_MINUTES=30`
- `PLATFORM_ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES=15`
- `AD_DEPROVISION_CHECK_INTERVAL_MINUTES=15`

That 15-minute deprovision interval is the current Entra disablement revocation SLA floor. A disabled Entra user is revoked in RiskHub on the next deprovision check plus any remaining access-token lifetime.

When the managed-production access-token lifetimes change from 60 minutes to 30 minutes for ordinary users and 15 minutes for platform administrators, already issued tokens retain their signed expiry and age out naturally. No mass `token_version` bump or refresh-session revocation is required. Rollback must revert the runtime guard, renderer, preflight checks, and managed config together; changing only the environment values back to 60 fails closed.

Bootstrap users are pre-linked to Entra before first login:

- Without `BOOTSTRAP_ADMIN_EXTERNAL_ID` or `BOOTSTRAP_CRO_EXTERNAL_ID`, RiskHub uses an exact email/UPN Graph lookup and fails closed unless exactly one match is found.
- When an external ID is supplied, Graph lookup is skipped and the value is treated as a trusted operator assertion. RiskHub does not verify its correspondence to the configured email/UPN.

Before deployment, source each supplied `oid` from the configured Entra tenant and independently verify its correspondence to the configured email/UPN.

## 3. Run Preflight

```bash
./scripts/deploy.sh preflight --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

```bash
./scripts/deploy.sh preflight --target linux --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
```

Preflight validates the config, target prerequisites, explicit production `ALLOWED_HOSTS`, secret directory permissions, placeholder-secret removal for required secrets, the active Entra confidential credential mode, the selected identity profile and shared production invariants, and the frontend bind port.

## Identity migration prerequisite

Before upgrading an existing unbound installation, back up the database, configuration
and secrets, drain all API/scheduler writers, and complete the
[identity adoption procedure](../security/identity-foundations.md) with the new
release's DB-task tooling. Fresh installs initialize the empty database automatically
before profile-specific bootstrap. Production admission still permits Entra only; local MFA is a staged
native feature awaiting the remaining identity release gates.

Managed upgrades stop API/scheduler writers before migrations. If migration, identity
verification or bootstrap fails, keep maintenance active and fix forward before
resuming. Additional replicas and external writers remain the operator's responsibility.

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

## Native installation preparation and release boundary

The shared installer accepts `--user-management entra|custom` on both targets.
Fresh interactive setup offers Entra by default; unattended setup without a choice
retains Entra semantics. The only persisted identity selector is the canonical
`AUTH_MODE`/`DIRECTORY_PROVIDER` tuple. Existing installations retain that tuple and
native MFA policy on reruns/upgrades. Conflicting options, tenant/profile changes,
and missing recorded configuration are refused before replacing services.

The custom profile is implemented for component verification, but **production
admission remains closed until #208**. Deploy/upgrade reports that boundary;
there is no runtime bypass. Do not enable debug/mock authentication to work around it.
The following prepares its files without deploying an application:

```bash
./scripts/deploy.sh init --target docker --user-management custom --mfa-policy optional \
  --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets
# The same interface accepts --target linux. Omit --mfa-policy for required MFA.
```

For an accepted release, add `--user-management custom --mfa-policy optional` to the
public `install.sh production` command with its normal pinned images or Linux bundle.
`required` is the default. Optional policy permits password-only users and admins
after verified invitation/password setup; accounts with a confirmed factor still
require it. On upgrade omit those options to preserve the recorded policy. Changing
a recorded MFA policy is an explicit config edit applied consistently to all workers;
read [session implications](../security/identity-local-credentials.md#session-lifetime-and-revocation).

Use `scripts/deploy/templates/riskhub-native.env.example` for the non-secret inputs.
Configure the real HTTPS origin, distinct admin/CRO emails, SMTP hostname/port,
verified `starttls` or `tls`, sender and username. Allow 128 MiB of KDF budget per API
worker, within the deployment's available memory. The packaged password blocklist,
15–128-character policy and eight-hour full-authentication limit remain mandatory.
An optional additional blocklist or SMTP CA uses the documented protected file path.

Native secret preparation creates separate random keyring keys once and leaves
existing files untouched, including unused Entra files. It creates no Entra
credential placeholders or mounts for native services. Populate `local_smtp_password`
and register at least two independent approver public keys in
`local_recovery_approvers`; the initial empty trust file is intentionally unusable.
Follow the [keyring format](../security/identity-local-credentials.md) and
[approver registration](../security/identity-recovery.md#privileged-or-last-admin-recovery).
Keep those three native files owner-only (normally `0400`) and owned by service UID
10001 or the configured Linux service user. Common DB/JWT/Redis files retain their
protected deployment ownership. No private approver keys belong on this server.
If scaffold creation is interrupted, validate existing files; restore a known keyring
instead of rerunning initialization to replace it.

Before service replacement, the candidate DB package performs a read-only check of
profile/binding, schema revision, supported password hashes and actual decryption
with retained key material. A populated unbound database requires explicit Entra
adoption in maintenance; demo/native conversion is never automatic. Fresh empty
installations migrate, bind/verify, then bootstrap. Upgrades drain all API/scheduler
writers before migrations and bootstrap. The database image runs its bootstrap as
UID 10001; Linux uses the application service UID. A protected sibling `handoff/`
directory next to the runtime directory holds separate admin/CRO invitation files.

Deliver each handoff privately to its recipient. They choose their own password
and complete the selected MFA policy. A resumed installer preserves pending handoffs,
including explicitly reissued paths, and never resets completed users. If failure
occurs after grants commit, inspect [bootstrap status and resumable handoff](../security/identity-bootstrap.md)
before retrying. Only the explicit maintenance reissue/abort commands change those
artifacts. Keep writers stopped after a failed migration/bootstrap until reconciled.
Retry the same `install.sh production` command with the same configuration, secret
directory and immutable release inputs after resolving the reported failure. A
recorded partial install resumes through candidate compatibility and bootstrap
checks even if application containers or the Linux `current` link were never
created. Linux removes the unused candidate from a failed attempt so the same
bundle can be extracted again; an activated or previous release is preserved.
If activation succeeded but a later smoke check failed, inspect status first and
use the documented compatible-release upgrade/rollback procedure. Never delete
runtime identity files or handoffs to make an installation appear fresh.

`install.sh status --mode production --target docker|linux --json` includes the
selected identity, MFA policy, external directory applicability, security availability
and initial enrollment state. `doctor --deep` additionally checks SMTP TLS/login
without sending a message. SMTP unreachability is `delivery=degraded`; invalid
security state is `security=unavailable`. Neither probe changes accounts or sessions.
Infrastructure readiness is not completed onboarding: `verify` requires completed
native admin/CRO enrollment and working delivery. `doctor --repair` may restart
valid runtimes and reconstruct metadata, but refuses missing/invalid identity state;
it never changes profiles, regenerates secrets, resets passwords/factors, unsuspends
accounts or bypasses recovery approvals. Restore recorded config/security files through
the documented operator procedure before retrying. Logs retain sanitized failure
categories; never paste handoffs, passwords or secret file contents into support logs.

Back up PostgreSQL and the full retained keyring plus JWT/Redis/SMTP files before
upgrades, with independent recovery public-key registration and protected handoffs.
Native Docker rollback uses `upgrade` with all four pinned artifacts of the intended
compatible release; the per-container previous-image shortcut is refused. Linux
checks the previous release before changing its symlink. Rollback never downgrades
the database: a candidate must support the current schema,
contract, hashes and retained keys. If it cannot, keep maintenance active and roll
forward. The restore/checkpoint release procedure remains #207/#208; do not infer
production restore acceptance from these installer component checks.
