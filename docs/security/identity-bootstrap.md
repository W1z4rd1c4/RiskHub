# Native initial Admin and CRO bootstrap

This is the backend/operator contract for #203. The native production web startup
guard remains closed until #208; the managed Docker/Linux installer integration is
#204. These commands do not bypass that guard or deploy an application. Entra
bootstrap continues through its trusted directory-linked command.

## Prerequisites and recovery registration

Use the installed non-debug native configuration: `AUTH_MODE=password`,
`DIRECTORY_PROVIDER=none`, `DEBUG=false`, `MOCK_AUTH_ENABLED=false`, PostgreSQL,
shared Redis, the protected local keyring, and the HTTPS public origin/CORS
configuration from [native credentials](identity-local-credentials.md). Complete
the forward migrations and explicitly establish/verify the immutable installation
binding in maintenance before bootstrap. A mismatched profile or tenant is refused.

Register at least two separately accountable recovery approvers before onboarding.
Follow [recovery key registration](identity-recovery.md#privileged-or-last-admin-recovery)
for the protected version-1 JSON trust file at `LOCAL_RECOVERY_APPROVERS_FILE`.
Each approver generates their own Ed25519 private key on their own protected
workstation. Transfer only the raw 32-byte public key, base64 encoded, into the
trust file. IDs, normalized accountable names and public keys must be distinct.
The application never generates, stores or backs up approver private keys.
The keyring and trust file must be regular, non-symlink, owner-only files.
The safe ephemeral fixture in `test_local_bootstrap.py` is test data generation,
not an operator key-distribution procedure.

Prepare a separate directory owned by the UID that executes the command, mode
`0700`. Pass two different absolute file paths within it; files are created with
mode `0600`. Path traversal, symlink components, unsafe writable ancestry, unsafe
ownership/modes and unrelated existing files are refused. Do not use a shared
world-readable handoff directory or publish files through the web server.

The Docker DB-task image runs as UID/GID `10001`. Provision the mounted handoff
directory for that UID; a root-owned `0700` directory is intentionally inaccessible.
On Linux, use the configured service/operator UID that runs the DB-task virtualenv.
Use `install -d -m 0700 -o <operator-uid> -g <operator-gid> <absolute-directory>`
under the host's normal administrator procedure. The same Python service handles
both transports; it does not change ownership automatically.

## Create and inspect

Load protected configuration through the existing DB-task environment. Run from
the packaged `backend_db` environment on Linux or the DB-task image with the
protected configuration and handoff volume mounted. Do not place passwords,
grants, private keys or full enrollment links in environment overrides, Docker
arguments, shell traces or command arguments. The command accepts only addresses,
safe artifact paths and non-secret change references.

```bash
python -m scripts.bootstrap_local_users start --dry-run \
  --admin-email admin@example.org --cro-email cro@example.org \
  --admin-file /etc/riskhub/handoff/admin.json \
  --cro-file /etc/riskhub/handoff/cro.json

python -m scripts.bootstrap_local_users --maintenance-confirmed start \
  --admin-email admin@example.org --cro-email cro@example.org \
  --admin-file /etc/riskhub/handoff/admin.json \
  --cro-file /etc/riskhub/handoff/cro.json

python -m scripts.bootstrap_local_users status
```

`--maintenance-confirmed` means the operator has stopped/drained writers; it does
not stop services itself. Dry-run and status perform no seeding, account changes
or file writes. Fresh creation seeds only the canonical roles, permissions and
required departments. It creates exactly two new Users with canonical Admin/CRO
roles and global scope, no external IDs, no passwords and inactive invitation
state. Any pre-existing unknown User is a conflict, never an implicit email upsert
or elevation. Concurrent requests serialize using the identity administration
guard and database uniqueness; conflicting identities/paths cannot create extras.

Each protected JSON artifact identifies the installation, exact User, grant,
expiry and one-time credential. Status exposes only artifact IDs, paths and state;
it never prints the credential or identity address. Deliver each file securely to
its intended recipient, separately. Recipients choose their own passwords. With
default `LOCAL_MFA_POLICY=required`, they must confirm a factor before ordinary
session authority becomes available. Explicit `optional` permits completed
password-only enrollment for both Admin and CRO; existing confirmed factors remain
enforced. Backend enrollment endpoints are implemented; the guided browser surface
is delivered in #205. The invitation expires after 24 hours.

No ordinary bearer or refresh session is issued by bootstrap or by possession of
the invitation. A password-set account awaiting its required factor remains
restricted. If factor setup is interrupted, the recipient signs in with the chosen
password to resume enrollment. Bootstrap cannot reissue or reset that password.

## Interruption, resume and explicit reissue

Principal IDs, initial addresses, delivery IDs and verified destinations are
persisted in `local_bootstrap_targets`, bound to the installation. The migration
`w2x3y4z5a6b7` is forward-only. The database stores a verifier digest and a
short-lived encrypted delivery envelope, never the raw grant in plaintext.
The grant transaction commits before filesystem delivery. File publication uses
an owner-only temporary file, file fsync, atomic no-overwrite rename and directory
fsync. Handoff acknowledgement then commits and clears the encrypted envelope.

If a volume is unavailable after the database commit, retain that database and
the delivery decrypt key. Run the identical `start` command after repairing the
destination. It writes the same still-valid grant; it does not create another User
or rotate credentials. If publication succeeded but acknowledgement failed, the
existing file must match the saved encrypted envelope exactly. A process crash
before rename can leave an owner-only `.bootstrap-*` temporary file in the protected
directory; remove such retained temporary artifacts through the operator's protected
cleanup procedure after reconciliation. The same grant expiry applies to them.

Repeating `start` after a successful handoff reports status. If a never-enrolled
grant is lost, expired, revoked or explicitly aborted, use a reasoned reissue and
a new destination; old files are never overwritten:

```bash
python -m scripts.bootstrap_local_users --maintenance-confirmed reissue \
  --slot cro --output /etc/riskhub/handoff/cro-reissued.json \
  --reason 'INC-203: lost sealed handoff, recipient identity reverified'
```

Reissue revokes the old invitation and destroys its pending delivery envelope.
Retain audit evidence and securely remove superseded operator files. Future
`start` invocations must use the newly persisted path for that slot. A completed
Admin target is never reissued while a pending CRO target resumes.

## Completion, abort and diagnostics

Full enrollment permanently records `completed_at` in the same transaction as
credential completion. Later demotion, suspension, scope changes or recovery do
not erase that record. Install/upgrade reruns never restore roles or active status,
replace passwords/factors, or issue bootstrap credentials to a completed target.
Use [governed recovery](identity-recovery.md) after enrollment.

For an unlaunched installation that is being abandoned:

```bash
python -m scripts.bootstrap_local_users --maintenance-confirmed abort \
  --reason 'CHG-203: unlaunched installation cancelled'
```

Abort first revokes unused invitations and clears pending encrypted envelopes,
then removes only current handoff files whose installation/User/grant and verifier
match. Completed or password-set accounts are preserved. Unrelated files are never
deleted. Inspect `cleanup_failed`, remove superseded/temporary artifacts through
protected operator cleanup, and retain the database/audit evidence. Do not delete
and recreate enrolled Users or discard the progress table to regain privilege.

| Status | Meaning |
| --- | --- |
| `infrastructure-ready` | Binding/security dependencies are valid; bootstrap has not created its targets. |
| `admin-enrollment-pending` | Initial Admin has not completed enrollment. |
| `cro-enrollment-pending` | Admin completed; CRO is still pending. |
| `completed` | Both initial targets completed enrollment historically. |
| `handoff-failed` | A committed pending handoff needs delivery, repair or explicit reissue; `enrollment_status` remains separate. |
| `validated-not-written` | Fresh dry-run succeeded without changes. |
| `aborted` | Unused target grants were revoked; inspect file cleanup results. |

`operational_admin` reports whether the initial Admin is currently eligible under
its role/scope/suspension/enrollment/MFA state; historical completion alone is not
operational readiness. These details are operator-only. Public health exposes
neither addresses, grant information nor private identity records.

Exit codes: `0` command succeeded (read enrollment state); `2` validation refused;
`3` security/database state unavailable or interrupted (inspect status before retry);
`4` committed handoff or post-abort file cleanup remains incomplete. A pending
enrollment with exit `0` is not permission to claim production onboarding complete.

## Verification and handoff

Run `test_local_bootstrap.py` with disposable PostgreSQL and Redis. It covers real
CLI concurrency/conflicts, protected filesystem refusal, DB/file interruption,
explicit reissue, and HTTP enrollment with required/optional MFA. Run native
identity/session/recovery, Entra bootstrap, canonical seeding, architecture and
production-packaging contracts alongside it. Docker UID/musl publication is
verified in the DB-task image. Actual managed target installation evidence and
production admission belong to #204/#208; backup retention/recovery drills belong
to #207. No simulated component result substitutes for those release checks.
