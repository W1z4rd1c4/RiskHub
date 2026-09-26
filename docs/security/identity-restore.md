# Identity-safe backup, restore and rollback

Owner: RiskHub Maintainer / Security and Operations

This procedure extends the installed DB-task maintenance tools and ordinary
PostgreSQL custom-format backups. It creates no separate backup service. Native
production admission remains gated by #208; these operations are independently
rehearsed against disposable PostgreSQL and Redis. Cross-provider or cross-tenant
conversion is not a restore operation.

## Maintenance and protected evidence

Stop incoming application traffic, all API writers, the scheduler/outbox worker and
other database clients. `--maintenance-confirmed` confirms that action; it does not
stop services. Commands reject other connected PostgreSQL clients and concurrent
restore tooling. Keep the maintenance boundary closed until the final checks below.
Use the installed DB-task image or DB virtual environment with its existing
non-debug configuration. `pg_dump` and `pg_restore` must be available and compatible
with the server. Docker's DB-task image and the PostgreSQL 15 CI drill use the
PostgreSQL 16 client, avoiding incompatible newer-client restore directives. A Linux operator must
provide a suitable PostgreSQL client. No live Linux or real Entra-tenant journey is
claimed by this delivery; those environment tests were skipped by the owner.

Run as the owner of the installed signing file. Use absolute paths without symlinks,
0700 directories and owner-only regular files. Mount the security and operation
**directories**, not individual writable files, for maintenance containers: atomic
file replacement requires replacing directory entries. Regular services continue to
receive read-only file mounts. Scope writable mounts to the maintenance command.

Keep four separate protected sets:

1. PostgreSQL dump and signed nonsecret manifest.
2. Retained TOTP/delivery/action keyring and recovery public-key registration,
   following [key recovery](identity-recovery.md). Private approver keys remain on
   the independent approvers' workstations.
3. The restore evidence key, outside database/configuration rollback snapshots.
4. A new operation directory outside the rollback snapshot, containing the current
   signed security checkpoint, pre-restore database snapshot, configuration summary,
   restart journal and new signing authority. Protect it like credential material.

Do not restore an old JWT signing secret from generic key escrow. Every restore
creates a new sole signing authority; factor encryption keys remain unchanged.
The checkpoint contains keyed credential commitments, access/eligibility state,
role/permission and business-relationship commitments, and audit references. It does
not contain plaintext passwords, factor seeds or grants. It is captured from the
stopped current database by the command; arbitrary historical checkpoint files
cannot be supplied as current authority. A changed business graph conservatively
requires explicit access review even when some individual relationships are intact.

## Backup and validation

The paths below are examples; provision their owner-only parent directories first.
Store immutable application identity in `application.json`: either
`{"source_commit":"40-lowercase-hex-commit"}`, a `linux_bundle_sha256`, or all four
`backend`, `backend_db`, `frontend`, `redis` digest-pinned image references. Replace
placeholders with verified actual release identities. Keep existing installer
configuration/runtime backups alongside the operator's normal backup inventory.

```bash
python -m scripts.identity_restore init-evidence-key --output /secure/evidence/key
python -m scripts.identity_restore --maintenance-confirmed backup \
  --dump /secure/backups/installation.dump --manifest /secure/backups/installation.json \
  --evidence-key-file /secure/evidence/key --application-identity /secure/evidence/application.json
```

Native initial Admin/CRO enrollment must be complete before a restorable backup is
created. The signed manifest binds installation/profile/tenant, identity and restore
contracts, exact Alembic revision, immutable application identities, supported
password/factor formats, referenced encryption-key IDs, timestamp and dump SHA-256.
Grant-key references are evaluated at the signed backup capture time, so normal
grant expiry cannot make an unchanged backup incompatible. It contains no key
material. Legacy unsigned dumps and unknown/older schema formats
are refused; migrate and create a verified backup with the compatible release.

A dry run restores only into a **separate empty disposable PostgreSQL database**.
Put its URL in a protected file. The tool checks actual binding, hashes and actual
decryption of restored factors/delivery data, not just key names. Wrong profile,
tenant, digest, schema or key material fails before the destination is replaced.
The validation database remains for inspection; delete/recreate it explicitly
before another dry run. Never point it at another application's database.

```bash
python -m scripts.identity_restore --maintenance-confirmed verify-backup \
  --dump /secure/backups/installation.dump --manifest /secure/backups/installation.json \
  --evidence-key-file /secure/evidence/key --installation-id INSTALLATION_UUID \
  --validation-database-url-file /secure/evidence/validation-database-url
```

## Planned and unplanned restore

Create a new 0700 operation directory and another empty validation database. Keep
current runtime configuration and deployment artifacts in the existing installer
backup; the command snapshots the current database and a nonsecret configuration
summary before replacement. It first repeats validation, captures current security
state, records a pending startup marker beside `SECRET_KEY_FILE`, replaces that
file atomically, restores the destination, reconciles authority and invalidates old
sessions, grants, recovery codes and encrypted delivery envelopes. Shared Redis
cleanup affects only this installation's local-auth namespace; SSO challenge keys
are bound to installation and new signing authority. Unrelated Redis data remains.

```bash
python -m scripts.identity_restore --maintenance-confirmed restore \
  --dump /secure/backups/installation.dump --manifest /secure/backups/installation.json \
  --evidence-key-file /secure/evidence/key --installation-id INSTALLATION_UUID \
  --validation-database-url-file /secure/evidence/validation-database-url \
  --operation-dir /secure/operations/restore-001 --source INC-RESTORE-001
```

Add `--unplanned` when the current security state is unavailable/untrustworthy.
An empty replacement database is permitted only with this mode and the exact
signed installation identity. Every restored account is quarantined; old local
passwords and factors are removed and require recovery. No administrator is created.
A bootstrap completion remains completed; bootstrap and doctor cannot regain access.

A planned restore preserves current suspension/access only when the checkpoint's
identity, permissions and business graph match. Replaced passwords/factors cannot
be proved current from an older backup and require recovery. Entra users always
require fresh upstream eligibility plus explicit local access review. Factor counters
advance to at least the UTC cutover's current 30-second step, and retained confirmed
factors remain mandatory under optional MFA. All old recovery-code sets are consumed;
generate a replacement after full authentication or recovery. No effective native
administrator means ordinary restored access remains quarantined pending recovery.

If interrupted, keep traffic and workers stopped. Re-run the **same** restore command
with `--resume`; it checks the exact journal, manifest, checkpoint, key fingerprints
and database epoch. It never rolls the signing key back. An interruption after key
replacement, after database restore, after committed reconciliation, or after ready
marker publication can be resumed. If evidence is missing/mismatched, stop and retain
all artifacts for incident review. A journal written before its pending marker is
published is an unstarted operation: retain it, verify the untouched installation,
and start a new operation; do not edit marker/journal files to force admission.

## Existing administrator recovery and explicit access review

Use the existing [dual-controlled recovery ceremony](identity-recovery.md#privileged-or-last-admin-recovery)
with `credential_and_factor_recovery` for unknown native credentials. Recovery keeps
the same User ID and does not clear restore quarantine. A suspended account must
first have its current suspension decision explicitly reviewed. Access review may
precede credential recovery; login remains denied while recovery is pending.

```bash
python -m scripts.identity_restore review-status --user-id 42
python -m scripts.identity_restore --maintenance-confirmed reconcile-user \
  --review-file /secure/operations/review-42.json
```

`review-status` returns nonsecret technical IDs, current epoch/version, role and
business-graph digests. Independently check current role/permissions, department,
manager, scope, ownership and suspension against authoritative business records.
Create the protected review JSON with exactly `epoch`, `user_id`,
`expected_token_version`, `role_id`, `role_digest`, `ownership_digest`,
`access_scope`, `department_id`, `manager_id`, `suspended`, `reason`, `reviewer`, and
`incident_reference`. Omit the status-only `restore_quarantined` and
`credential_recovery_pending` fields. Use JSON null for absent department/manager.
Do not blindly copy a stale backup's permissions. A changed epoch, version or
business graph invalidates the review. This command cannot elevate an ordinary
account to Admin/CRO. Review and recover the existing Admin before ordinary access.
Entra reconciliation queries the exact provisioned subject in the configured tenant;
email matching and password fallback are never used.

An incomplete ordinary invitation can be reviewed and then reissued through account
administration. Recovery of enrolled privileged accounts always retains the existing
two-approver requirement. Every access review records its reviewer, reason, incident,
reviewed scope and evidence digests in the existing audit trail.

## Resume and compatible rollback

```bash
python -m scripts.identity_restore verify-cutover
python -m scripts.identity_preflight --restore-contract 1
```

`verify-cutover` checks matching database/external epoch and active signing authority;
`administrator_recovery_required=true` means keep ordinary admission closed and
finish existing-admin recovery/review. Recreate **all** API and scheduler containers
from the compatible immutable release after replacing signing files. Restarting an
old container can retain an old file inode. New managed mounts include the protected
restore marker. Start a bounded recovery-only window when recipients must finish
recovery; quarantine and recovery-pending accounts have no ordinary authority.
Then prove initial admin login, expected access, negative old-token/refresh replay,
completed bootstrap, binding/key/Redis checks, and bounded business smoke before
reopening ordinary traffic and scheduler/outbox work.

Managed upgrade and rollback preflight requires `--restore-contract 1`; older
packages lacking that protocol refuse the flag. Current packages verify restored
cutover evidence, schema, binding, native hash formats and decryption before replacing
services. Use the existing `install.sh upgrade --target docker` with all four pinned
compatible artifacts; never roll back one native container, switch providers,
disable MFA, downgrade hashes or restore session rows to recover availability.
A release that cannot read the current contracts requires maintenance and roll-forward.
The explicit Linux and real Entra environment-test skips are not evidence those
operational journeys were executed.
