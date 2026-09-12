# Native credentials — group 2 developer and operator contract

Scope: native backend credentials for #197–#200, including optional MFA,
administrator-created invitations and user-managed passwords. **Native production
is not enabled yet**: ADR-018 retains the release admission guard until #208.
Read [identity foundations](identity-foundations.md) before schema changes; #210
builds on #209. Candidate-specific review and CI evidence lives in the PRs.

## Runtime and data ownership

Select `AUTH_MODE=password` and `DIRECTORY_PROVIDER=none` together for native
component verification. Existing Entra and hybrid development flows retain their
separate behavior. No environment variable bypasses the production-release guard.
Use a correctly bound installation; native mode refuses directory-linked users.
Native debug startup connects to configured Redis and fails before starting runtime
services if Redis is missing or unavailable. Hybrid demo mode retains its existing
single-worker in-memory development behavior.

One RiskHub User, authorization policy and access/refresh session lineage remain.
The additive migration `u0v1w2x3y4z5` follows `t9u0v1w2x3y4`: purpose grants,
encrypted factors/delivery envelopes, backup-code verifiers, verified-email time
and native authentication metadata on existing refresh rows. It infers no verified
email or MFA from old data. User IDs and business/audit foreign keys are unchanged.
Invited accounts have no ordinary access. Password-only accounts may complete
enrollment and sign in when deployment policy is optional.

## Required nonsecret configuration and protected inputs

| Input | Meaning |
|---|---|
| `LOCAL_MFA_POLICY` | `required` (default) or `optional`; optional permits password-only users/admins while retaining MFA for accounts that enabled it |
| `PUBLIC_URL` | Explicit allowed origin used for links; HTTPS outside debug; never inferred from Host |
| `LOCAL_AUTH_KEYRING_FILE` | Owner-only regular, non-symlink JSON file with independent 32-byte keys for delivery, TOTP and action commitments |
| `LOCAL_SMTP_HOST`, `LOCAL_SMTP_PORT` | Explicit relay; default port 587 |
| `LOCAL_SMTP_SECURITY` | `starttls` or `tls`; no plaintext or certificate-validation bypass |
| `LOCAL_SMTP_SENDER` | Valid envelope/display sender address |
| `LOCAL_SMTP_USERNAME`, `LOCAL_SMTP_PASSWORD_FILE` | Optional authenticated relay; password read from an owner-only regular file |
| `LOCAL_SMTP_CA_FILE` | Optional private-CA trust bundle; defaults to platform trust |
| `LOCAL_SMTP_TIMEOUT_SECONDS` | Bounded socket timeout, default 10, maximum 30 |
| `LOCAL_PASSWORD_BLOCKLIST_FILE` | Optional operator additions to the packaged offline list |
| `LOCAL_KDF_MEMORY_BUDGET_MIB` | Deployment memory allowance; default 1024, must cover two 64-MiB slots per configured API worker |
| Shared Redis | Required for native rate/abuse state even in component tests; no per-worker fallback |

Keyring schema (placeholders below are **not keys**, and fail validation):

```json
{"version":1,"purposes":{
  "delivery":{"active":"v1","keys":{"v1":"BASE64_OF_RANDOM_32_BYTES"}},
  "totp":{"active":"v1","keys":{"v1":"DIFFERENT_RANDOM_32_BYTES"}},
  "action":{"active":"v1","keys":{"v1":"THIRD_RANDOM_32_BYTES"}}
}}
```

Generate every key independently with a cryptographic random generator. Do not
reuse JWT SECRET_KEY or reuse one purpose's key in another purpose. Mount/read as
the service user with owner-only permissions. Key IDs and purpose/installation/
User/artifact context are authenticated by AES-GCM or a purpose-separated HMAC.
Unknown/missing/corrupt keys fail closed. Use the [factor recovery and key-rotation runbook](identity-recovery.md) for
automated rotation and privileged lost-factor recovery; do not remove an active factor to recover
access. Retain protected key backups separately from ordinary database backups.

## Deployment policy and account ownership

| Deployment/account state | Enrollment and sign-in | Credential management |
|---|---|---|
| Required MFA (default), including admins | Verify invitation, choose password, confirm factor; password then factor at login | Current password plus factor for recent proof |
| Optional MFA, no confirmed factor | Verify invitation and choose password; password-only login | Current password for recent proof; factor field may be omitted |
| Optional MFA, confirmed factor | Password plus existing factor at login | Current password plus factor; optional policy never bypasses enabled MFA |

An authenticated platform administrator creates an invitation with name, email, role,
department and manager. The recipient chooses the permanent password. Explicit Admin
invitations receive canonical global platform scope, so completed enrollment can make
them an effective replacement administrator; pending invitations do not count. Business
accounts start at department scope, with later business scope changes governed by CRO.
Admin is still excluded from business data by the shared role policy.

Users change their own password through recent authentication followed by the exact
password-change operation, or recover a forgotten password through the generic email
reset request and a single-use link. Administrators cannot set permanent native passwords
through legacy user edits. Password reset preserves enrolled factors and revokes old
sessions; it is not lost-factor recovery. Email changes use the separate verified-address
workflow. Account-security and Admin invitation/lifecycle screens consume these backend
contracts. See the [operator runbook](../admin/user-management.md); production
admission remains gated by #208.

Changing `LOCAL_MFA_POLICY` from optional to required rejects existing password-only
access/refresh credentials; the next login enters factor enrollment. Switching to
optional permits eligible accounts without a confirmed factor, including admins, while
confirmed factors remain required. Restart all replicas with one consistent policy;
configuration changes do not delete factors or erase revocation history.

## Passwords and admission

New hashes use the maintained pwdlib/Argon2id implementation: 64 MiB, 3 iterations,
parallelism 1. Two admitted KDF jobs per API process are enforced before executor
submission; overload returns 503 and cancellation does not release a running job's
slot. Total slot memory is worker count × 128 MiB, plus ordinary process memory.
The host benchmark script records actual runtime data; supported deployment-target
resource/latency acceptance still needs the final operational gate.

Native writes accept 15–128 Unicode code points, preserve spaces/case exactly,
reject ill-formed Unicode and never truncate. They use the packaged checksum-pinned
SecLists 10k common-password list and optional operator additions, without external
password queries. The list is a bounded denylist, **not an exhaustive breach corpus**.
MIT license and pinned source/checksum are beside the data. Missing/corrupt required
policy data prevents credential setting. Composition rules and periodic expiry are
not imposed. Legacy bcrypt hashes verify only within the 72-byte input limit and
are upgraded after valid, policy-compliant verification; a concurrent authority
change prevents stale rehash persistence. Noncompliant legacy credentials require
controlled reset/enrollment, not implicit adoption into native production.

## HTTP state machine and transaction boundaries

See [generated API contract](identity-local-auth.openapi.json). It marks #198–#201 and #205 handlers implemented for component verification;
none implies production release.
All credential mutations require allowed Origin/Referer and double-submit CSRF.
Preauthentication uses a separate HttpOnly/SameSite-strict browser-binding cookie,
which carries no ordinary authentication authority. Obtain CSRF through the existing
`GET /api/v1/auth/csrf`. Secret JSON is bounded before parsing (including chunked
bodies); validation errors never echo inputs. Auth responses use no-store/no-referrer;
credential-route query strings are suppressed in request logs.

| Transition | Authority / resulting state |
|---|---|
| Admin invitation | Existing platform-admin authority; create inactive `invited` User, no password, 24h grant |
| Enrollment start | Single-use invite + compliant password verifies the address; required policy → `password_set` + 5m challenge; optional policy → completed `enrolled` account, no session until login |
| MFA setup/confirm | Restricted challenge + real TOTP confirmation → `enrolled`; ten display-once backup codes; **no ordinary token yet** |
| Password login | Confirmed factor or required policy → HTTP 202 MFA/enrollment challenge; optional policy without a factor → shared TokenResponse and refresh session |
| Optional MFA enrollment | Password-only bearer + recent `factor_enroll` proof → restricted enrollment/setup challenge; confirmation enables MFA and revokes existing sessions |
| Factor login completion | Password challenge + current TOTP/unused backup code → common access/refresh session |
| Account security status | Current native bearer → own MFA enabled/required policy only; no seeds, codes or target selector |
| Recent authentication | Current password + factor when enabled/required → 5m single-use proof bound to actor/target/operation/exact keyed intended change |
| Reset request | Generic HTTP 202 for present/absent/ineligible target; does not lock account or revoke sessions |
| Reset completion | Valid 30m grant + compliant password → revoke sessions/other proofs, retain MFA, require login |
| Password change | Current bearer + action-bound proof → credential change/revocation; identical no-op does not churn authority |
| Email change | Recent proof → separate pending address, new-address verification and old-address notice; old address stays current |
| Email confirmation | Bearer + new recent proof + 30m address grant → atomic unique-address change and revocation |

Tokens/grants are random 256-bit secrets with hashed verifiers, bound to purpose,
installation, User and current version; source secrets never live in ordinary outbox
metadata. Failed attempts at a known grant selector revoke it at the configured
threshold. GET/scanner requests do not consume grants. Reissue supersedes the old
purpose grant. Suspension, credential changes and authority invalidation revoke all
pending proofs through the common invalidation boundary.

Factors use maintained PyOTP RFC-6238 verification, six digits, 30-second periods
and an adjacent-step tolerance. Accepted counters increase monotonically per factor
generation; parallel uses cannot reuse the same step. Backup codes contain 128 random
bits each, are stored as domain-separated digests and consumed atomically. TOTP is
not phishing-resistant and does not provide Entra Conditional Access/device policy.

Lock order: existing lifecycle/ownership guards when needed → ordered User rows →
grants → factor/code state → refresh state. KDF/SMTP/Redis admission work occurs
before decisive row locks; auth issuance keeps factor consumption and common refresh
insertion in the same service-owned transaction. There are no endpoint commits.

## Session lifetime and revocation

Native full authentication is bounded at eight hours. Its immutable origin/expiry,
authentication method, factor generation when applicable, and installation ID are
signed and verified against existing refresh metadata/current factor. Password-only
sessions carry `auth_method=local_password` and null factor generation; MFA sessions
carry `auth_method=local_mfa` and a confirmed generation. Rotation copies the original context, never now+8h.
Ordinary/admin access TTLs remain 30/15 minutes and are capped at the remaining full
authentication lifetime. The existing near-expiry, replay containment, CSRF, logout
and token-version controls remain. Missing or inconsistent method/context is rejected.
Required policy rejects password-only bearer/refresh authority; enabling a factor
also revokes password-only sessions. Apply policy configuration consistently to every
API/scheduler process. Changing optional to required forces password-only users
through enrollment at their next login. Changing required to optional does not remove
existing factors or bypass them. Changing credentials
or completing reset invalidates old sessions; resetting a password does not reset MFA.

## Abuse and availability policy

Shared Redis fixed-window admission uses installation-scoped hashed identifiers:
login 30/source/15m, five failed passwords/account/15m then a 15m lock; factors
30/source/15m, ten/account/15m and five failures/challenge; invitation three/target/h
and 30/actor/h; reset three/target/h and 30/source/h; redemption ten/source/15m;
email-change requests three/user/h. Required backend failure returns 503, never
in-memory fallback. Suppressed target reset sends still return generic 202.
KDF capacity is separately bounded. These are product policy defaults, not compliance
claims; proxy trust must be correct so source admission is meaningful.

## Delivery and operator status

Existing transactional outbox event `local_auth.deliver` contains only a delivery
ID. A short-lived encrypted envelope holds recipient/link until verified-TLS SMTP
succeeds or expiry cleanup removes it. Delivery happens after the account transaction
commits, using the existing retry/backoff/claim mechanism. Ambiguous SMTP acceptance
can cause a duplicate email carrying the same grant, never a second user or a secretly
regenerated credential. A revoked grant is skipped; if revocation overlaps a network
send, the message may arrive but redemption still fails. No User/grant row lock is
held across SMTP. Delivery exceptions are sanitized.

`GET /api/v1/users/{id}/local-auth/status` is Admin-only and returns only enrollment,
suspension, active projection and delivery disposition. Pending, sent, failed,
expired and cancelled are distinct. Failure is derived from the existing outbox
retry/dead-letter state. SMTP outage is not password-only fallback and does not end
unrelated valid sessions. UI and full installation diagnostics ship in later groups.

## Verification and downstream work

`test_local_identity.py` covers actual API enrollment, MFA, session/reset/email
journeys and misuse. `test_local_identity_delivery.py` uses a real TLS SMTP test
server and real crypto. `test_local_identity_postgres.py` uses independent HTTP/DB
transactions and observed database lock waits. `test_local_identity_redis.py` uses
a real Redis instance when `TEST_REDIS_URL` is set. Skipped external infrastructure
checks are not acceptance evidence. The PR records commands and exact candidate
identity; no result in this document is inferred from a test's existence.

The [recovery backend](identity-recovery.md) extends these interfaces with factor
replacement, governed recovery and key rotation. Directory isolation/capabilities
(#202), privileged bootstrap (#203) and installer selection (#204) have separate implementation contracts in this tree. Group 4 implements UI, safe restore and final production admission. Do not
replay bootstrap, reset factors through SQL, add hybrid fallback, or recreate another
session/crypto/mail framework. Rollback must retain Argon2/factor decryptability,
suspension and all revocations, or disable native authentication and roll forward
under maintenance. Migration downgrade intentionally refuses destructive credential
loss. The Entra-only production guard remains authoritative.

## Native browser experience (#205)

One frontend reads the runtime identity contract. Native password-only completion
and HTTP 202 challenges have distinct paths; only HTTP 200 completed sessions enter
the existing session coordinator. Native completed UserBrief responses include the
same authoritative capabilities as `/auth/me`. `GET /api/v1/auth/local/account`
requires a current eligible native actor and returns only `mfa_enabled`,
`factor_required` and `mfa_policy`; it does not grant mutation authority.

Public routes are `/login` and `/auth/local/{enroll,reset-password,recover,recover-email}`.
The Settings link opens `/auth/local/security`; new-address confirmation uses
`/auth/local/verify-email`. The latter asks users to sign in and reopen their link
when necessary. These credential screens have no QueryClient. They sit outside the
principal cache boundary so their own session invalidation can retain display-once
backup codes until acknowledgment. Protected application data retains the existing
principal boundary; changing owners cancels old work, and same-owner refresh keeps
its client. Exiting the protected scope also disposes its cached data.

Fragments are captured before paint, removed from browser and router history, and
redeemed only by explicit POST. Passwords, setup keys, challenges, proofs and codes
remain in component/request memory. Owner changes, cancellation and expiry discard
pending work. A lost single-use response does not trigger an automatic retry.
Password/email/factor completion clears the prior session before normal login;
backup codes can be acknowledged after that clearing. No web privileged-recovery
override or public registration is provided. EN/CS forms use shared accessible
controls and preserve the cold-login dependency gate. The native production guard
remains closed until #208.
