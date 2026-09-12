# Native factor recovery and key operations

Owner: RiskHub Maintainer / Security and Operations

This is the operator contract for the native recovery backend. Native production
admission remains closed until the release verification in #208. These commands
support component verification and the subsequent installer; their presence does
not enable native production. See [native credentials](identity-local-credentials.md)
for configuration, session policy, SMTP and Redis requirements.

## Factor replacement and recovery codes

A signed-in user requests a five-minute recent-auth proof with the current password
and confirmed factor or an unused recovery code. `factor_replace` and `recovery_codes`
are separate operations. The proof is bound to the user, current authority version,
operation and browser, and can be consumed only once.

`POST /api/v1/auth/local/factor/replace` returns a pending provisioning URI and
challenge. The current factor remains usable until
`POST /api/v1/auth/local/factor/confirm` verifies the new TOTP. Confirmation replaces
the factor generation and complete recovery-code set, invalidates all old sessions
and challenges, and returns new recovery codes once. Abandoning setup leaves the
working factor intact. A lost response requires a new authenticated procedure;
it never makes stored raw recovery codes available again.

`POST /api/v1/auth/local/recovery-codes/regenerate` consumes a `recovery_codes` proof,
replaces the whole code set and revokes existing session authority. Both operations
queue a security notice to the verified address. `notification_status` distinguishes
a queued notice from unavailable delivery configuration; SMTP retries run after the
credential transaction. Store the displayed codes securely and sign in again.

Optional MFA permits password-only accounts but never bypasses an existing confirmed
factor. It is not a lost-factor recovery mechanism. Password-only accounts can use
the existing password change/reset flows without entering factor recovery.

## Assisted recovery for ordinary accounts

An active platform administrator independently verifies the person's identity outside
the affected mailbox. Record a reason, incident reference and verification method;
retain identity-document evidence in the organization's approved incident system,
not in RiskHub request fields. The application records the reference but cannot
prove that this human verification occurred.

Read `GET /api/v1/users/{user_id}/local-auth/status` as the administrator and use its
nonsecret `authority_version` as `expected_token_version`. Obtain an
`assisted_recovery` recent-auth proof for that exact target/version, approved operation
and proposed address when relevant. Refresh status and repeat verification when a
concurrent account change invalidates that version. Submit it to
`POST /api/v1/users/{user_id}/recovery` with matching values. Admin creation/reset
permissions do not permit a direct password or factor overwrite. Admin, CRO and
accounts with global access/recovery-management authority require the offline
procedure below; this web endpoint rejects them.

Supported operations:

- `factor_recovery`: the recipient must still prove the current password.
- `credential_and_factor_recovery`: explicitly permits choosing a new compliant
  password and new factor together.
- `verified_address_recovery`: requires the current password, new factor and a
  separate single-use verification grant sent to the approved new address.

Initiation revokes sessions and partial artifacts and sets `recovery_pending`.
Ordinary login, refresh and API access remain denied, including under optional MFA.
The recovery grant expires after 15 minutes; the browser-bound setup challenge lasts
at most five minutes and never outlives that grant. `/auth/local/recovery/start` and
`/auth/local/recovery/confirm` require the approved proofs before restoring ordinary
eligibility. Completion retains the same User and all business assignments. Suspension,
role changes or other authority changes invalidate the pending recovery. Expiry does
not reactivate the account; initiate a newly verified recovery when appropriate.

## Privileged or last-admin recovery

Use the installed DB-task image or Linux DB virtual environment containing
`scripts.local_recovery`. Stop/drain API and scheduler writers. Load the same installed
non-debug configuration, installation binding, native keyring and shared Redis. Native
commands reject Entra installations. `--maintenance-confirmed` records the operator's
confirmation; it does not stop services automatically.

Configure `LOCAL_RECOVERY_APPROVERS_FILE` as an owner-only regular, non-symlink JSON
file. Two separately accountable humans retain independent Ed25519 private keys
outside the application, database, image and normal backup keyring. The trust file
contains only raw 32-byte public keys encoded as base64:

```json
{"version":1,"approvers":[
  {"id":"operator-a","name":"First accountable person","public_key":"BASE64_RAW_ED25519_PUBLIC_KEY"},
  {"id":"operator-b","name":"Second accountable person","public_key":"OTHER_BASE64_RAW_ED25519_PUBLIC_KEY"}
]}
```

The placeholders are invalid key material. Generate private keys on each approver's
protected workstation with `umask 077; openssl genpkey -algorithm ED25519 -out approver.pem`.
Export the public key using cryptography's `public_bytes_raw()` and base64 encoding;
PEM/DER public-key headers are not the trust-file representation. Never share or copy
private keys into the application host. Map every trust entry to an independently
accountable person. A host/root administrator can replace trusted configuration;
this boundary requires organizational control outside the application.

Prepare the request only after independent verification, then obtain both signatures
within its 15-minute lifetime. Replace the example user ID and incident details with
the inspected target. Technical IDs belong in operator tooling, not end-user screens.

```bash
python -m scripts.local_recovery status --maintenance-confirmed --target-user-id 42
python -m scripts.local_recovery prepare --maintenance-confirmed --target-user-id 42 \
  --operation factor_recovery --incident INC-2026-001 --verification in-person \
  --reason "Verified loss of authenticator" --output request.json
```

Each approver inspects all request fields and signs on their own workstation:

```bash
python -m scripts.local_recovery sign --envelope request.json \
  --private-key-file approver.pem --signer-id operator-a --output approval-a.json
```

The second person uses their own key, ID and output file. Transfer only the request
and public signature files back to the operator. The signed content is the exact
version-one schema serialized as UTF-8 JSON with sorted keys, compact separators and
ASCII escaping. It includes installation, target, expected authority version,
operation, optional proposed email, single-use nonce, integer issue/expiry times,
incident, verification method and reason. Altering any field invalidates approvals.

```bash
python -m scripts.local_recovery verify --maintenance-confirmed --envelope request.json \
  --approval approval-a.json --approval approval-b.json
python -m scripts.local_recovery recover --maintenance-confirmed --envelope request.json \
  --approval approval-a.json --approval approval-b.json --output recovery-grant.json
```

`prepare`, `status` and `verify` do not modify database authority. `recover` rechecks
approvals and locked account state, records the incident and approvers, and writes a
single-use grant to a new mode-0600 file. It never prints the grant or overwrites an
existing output. One signer, duplicate people/keys, unknown keys, changed payload,
wrong installation/version, expiry and replay are refused. Two typed names alone
are insufficient. The narrowly scoped last-admin exception recovers the existing
account; it creates no User, password fallback or application bearer token.

Deliver the grant through the organization's protected operator channel when the
mailbox is unavailable. Resume the compatible runtime to finish enrollment, verify
the same user's access, then dispose of grant files and close the incident. Keep audit
evidence and public approvals according to retention policy, without raw grants,
passwords, seeds, private keys or recovery codes. All-factor recovery still enrolls
a new factor under optional policy. Synchronize host and authenticator clocks.

## Key rotation

`LOCAL_AUTH_KEYRING_FILE` has independent `totp`, `delivery` and `action` purposes,
one active write key per purpose and retained decrypt keys. The JWT secret is separate.
Run these commands with the installed non-debug native configuration and maintenance
confirmation. Their stdout is one JSON result; audit logs remain on stderr and in
configured audit files. Never place raw key material in arguments or logs.

```bash
python -m scripts.local_auth_keys --maintenance-confirmed verify
python -m scripts.local_auth_keys --maintenance-confirmed add --purpose totp --key-id v2
python -m scripts.local_auth_keys --maintenance-confirmed activate --purpose totp --key-id v2
python -m scripts.local_auth_keys --maintenance-confirmed reencrypt --batch-size 100 --after-user-id 0
```

Repeat `reencrypt` with the returned `next_after_user_id` until `done` is true. Repeat
for delivery/action purposes as needed. Each user batch locks current state and commits
independently; interruption can resume, and repeating an already completed batch is
safe. Re-encryption covers confirmed/pending factors, pending recovery passwords and
mail envelopes while retaining factor generations and consumed TOTP counters. Switching
the action key invalidates old recent-auth proofs; users must authenticate again for
the intended action.

Distribute the same protected keyring to every API/scheduler/DB-task process. Before
retirement, stop/drain all writers that may still hold an old keyring, re-encrypt again
from user zero, and run `verify`. Verification actually decrypts retained live secrets;
a matching key ID alone is insufficient. Keep old keys while any live secret or
retained backup needs them.

The protected backup inventory for retirement is explicit:

```json
{"version":1,"retained_backups":[
  {"id":"backup-before-rotation","key_ids":{"totp":["v1"],"delivery":["v1"],"action":["v1"]}}
]}
```

Use the real inventory, including offline copies. An empty list means there are no
retained backups requiring any key. The integrated backup/restore tooling is owned
by #207; until it exists, operations maintains and verifies this inventory.

```bash
python -m scripts.local_auth_keys --maintenance-confirmed retire --purpose totp --key-id v1 \
  --retained-backups-file retained-backups.json
```

Retirement refuses active write keys, referenced live keys and keys named by retained
backups. Keep encrypted key escrow separate from database and recovery-approver private
keys. If a TOTP decrypt key is lost, restore its protected backup or perform governed
individual factor recovery; do not clear factors globally. For suspected compromise,
add fresh independent purpose keys, rotate/re-encrypt, investigate exposure and revoke
or recover affected credentials as required. Replace an approver public key only under
a separately recorded organization-controlled maintenance change and reapprove any
outstanding request. Neither key rotation nor recovery changes the provider or tenant.

## Verification and rollback

`test_local_recovery.py` exercises HTTP journeys, real Ed25519 CLI approvals and key
operations on PostgreSQL; `test_local_recovery_postgres.py` checks independent request
serialization and suspension during recovery. Run alongside the native identity,
session, access-management and architecture suites. Record the actual commit/tree,
commands and outcomes in the delivery PR; test existence is not verification evidence.

Rollback must retain recovery-pending denial, decrypt/verification capability and all
revocations. Disable initiation when a compatible recovery runtime is unavailable,
then roll forward under maintenance. Never replay bootstrap, drop the pending flag,
restore consumed codes, bypass approvals or remove the production admission guard to
recover availability.
