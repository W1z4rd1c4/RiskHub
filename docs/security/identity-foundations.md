# Identity foundations — group 1 developer and operator handoff

Scope: #193–#196 in PR #209, under #192. Follow-up groups are #197–#200,
#201–#204, and #205–#208. This is not native production enablement.

## Before adopting this schema

Use the approved change window. Back up the database and installed configuration;
stop/drain old API workers and the scheduler. Apply migrations using the existing
release DB task. Do not leave a pre-change writer running beside the new eligibility
model. Configure the existing Entra production tuple and secrets; do not turn on DEBUG.

From the backend environment using the normal production secret-file configuration:

```bash
python -m scripts.identity_installation eligibility-report
# Empty fresh DB, after required schema/reference seeding and before user bootstrap:
python -m scripts.identity_installation initialize --maintenance-confirmed --source 'operator/change-reference' --dry-run
python -m scripts.identity_installation initialize --maintenance-confirmed --source 'operator/change-reference'
# Existing, reviewed Entra installation (never a demo-to-production shortcut):
python -m scripts.identity_installation adopt-entra --maintenance-confirmed --source 'operator/change-reference' --dry-run
python -m scripts.identity_installation adopt-entra --maintenance-confirmed --source 'operator/change-reference'
python -m scripts.identity_installation verify
```

Choose initialize **or** adopt-entra, not both as an improvised repair. Verify requires
an existing binding and writes nothing. Dry-run establishes no row. Repeating an equal
establishment is idempotent; conflicting profile/tenant/version fails. Exit 2 means
refused input/identity state; exit 3 means unavailable verification infrastructure.
No command creates/rekeys a User or forces provider conversion. Graph outage or a
missing/deleted/unlinked object blocks adoption until an operator reconciles the
trusted mapping. Source identifies accountability, not a credential. Never include
secrets in CLI arguments or the source reference.

Review inactive users and their audit/deprovision history before adoption. The
backfill preserves known upstream denials and explicitly suspends unexplained/manual
inactivity. Ambiguous or incomplete historical intent needs a conservative suspension
and explicit reviewed resumption; do not infer consent from a healthy directory record.
The same operation never rewrites ownership, role, scope or the audit identity.

After verification, start only consistent new API/scheduler instances. An unbound
or mismatched production instance fails before runtime services/jobs; this is deliberate,
not a reason to remove the guard. Validate an existing admin login and scoped business
read before reopening normal traffic. Versionless access credentials require login
again; already modern current-version authority retains its existing semantics.

## Release tooling and maintenance recovery

The Docker DB-task image and Linux `backend_db/scripts/` lane include
`scripts.identity_installation`; the long-running API image does not ship operator
commands. Fresh explicit installation runs `initialize` and `verify` after reference
seeding and before privileged-user bootstrap. Repeating this on an equal binding is
read-only. A populated unbound database is refused: deploy/upgrade never automatically
adopts users or changes provider/tenant.

Docker and Linux upgrades stop their managed API and scheduler before migrations.
Operators must also drain traffic and stop any additional replicas, jobs or external
writers. A failed migration, binding check or bootstrap leaves managed writers stopped;
keep maintenance in place, fix forward, verify the binding and resume the release.
Do not restart an old binary against the changed eligibility schema.

For an existing Entra installation's first upgrade, apply the new migration in the
maintenance window, run the adoption sequence above, and then continue the normal
upgrade. Use the **new release's** DB task environment, production env-file and secret
mounts. Docker's DB-task invocation has this form (substitute the installed paths and
immutable release image):

```bash
docker run --rm --add-host host.docker.internal:host-gateway \
  --env-file /etc/riskhub/runtime/backend.env \
  -v /etc/riskhub/secrets:/etc/riskhub/secrets:ro \
  -v /etc/riskhub/runtime:/etc/riskhub/runtime:ro \
  ghcr.io/<owner>/riskhub-backend-db:<version>@sha256:<digest> \
  python -m scripts.identity_installation verify
```

Use the same invocation for `eligibility-report`, `adopt-entra` and its dry-run,
with the options in the adoption sequence. On Linux use the new release's
`db-venv/bin/python`, working directory `backend_db/`, and
`PYTHONPATH=<release>/backend:<release>/backend_db`; load the installed backend env
with the deployment env-file loader and run as the service identity that can read
its secret files. Never copy secret values into command history.

Managed identity bootstrap selects distinct Entra accounts or protected native invitations. The native
[bootstrap service/CLI](identity-bootstrap.md) now supports protected one-time handoffs
for distinct initial accounts; managed installer selection shares the canonical profile contract. `LOCAL_MFA_POLICY` alone
does not enable native production; #208 owns that admission change.

## Writer and lock inventory

| Writer | Transaction owner / shared behavior |
|---|---|
| Manual `/users/{id}` and `/access/users/{id}` | Lifecycle locks, field policy, last-admin guard, actual-change invalidation and mutation audit in `log_user_update_and_commit` |
| Directory import | Same lifecycle lock for existing users; explicit role/link changes invalidate authority; disabled records enter common deprovisioning |
| Scheduled/manual directory check | Fetch upstream before locking; preserve local suspension; per-user service commit and explicit unavailable/missing outcomes |
| Password login | KDF/lockout work, then locked hash/version/eligibility recheck, shared issuance, auth workflow commit |
| SSO exchange | Verified token/challenge, locked User recheck/profile reconciliation, shared issuance, auth workflow commit |
| Refresh and replay | Existing single-winner rotation/User lock; common version+refresh invalidation on newly confirmed replay; existing audit and commit |
| Logout/admin revoke | Locked User, common revocation, existing audit and service commit |
| Manager cleanup | Org guard plus already ordered subordinate User locks; affected manager assignments invalidate subordinate authority |
| SSO bootstrap | Operator-only bootstrap; production binding must be established first; normal web administration cannot invoke it |
| Demo/seed commands | Existing explicit non-production surfaces; not an accepted adoption path or production credential policy |

Lock details and preserved exceptions are in [ADR-018](../adr/ADR-018-identity-foundations.md).
Only the common workflow primitive advances token_version in application code. It
does not commit: callers retain mutation/audit transaction ownership. Display-only
changes and unchanged access assignments do not create a security transition. Ordinary
manual resumption cannot bypass directory denial, local enrollment or last-admin rules.

## Local HTTP catalogue and release boundary

The generated [OpenAPI catalogue](./identity-local-auth.openapi.json) is **not the live
application OpenAPI**. It records the schema contracts, HTTP methods and implementation
owners; its handler metadata identifies implemented component-verification paths.
The catalogue does not register handlers or admit native production.
Requests/responses and frontend types originate in `app.schemas.local_auth`; run:

```bash
python -m scripts.export_local_auth_contract
python -m scripts.export_local_auth_contract --check
```

Catalogue actions declare their actual GET or POST method. Native operations use
existing service-owned transaction boundaries. The catalogue gives path, input/output schema,
proof/capability requirement, response status and owning implementation issue. A
password-set enrollment remains anonymous until the selected enrollment policy is met.
`LOCAL_MFA_POLICY=required` (default) requires factor enrollment; `optional` permits
password-only accounts after invitation verification and password setup. An already
confirmed factor is always enforced. Recent authentication requires the current
password, a factor when enabled or required, and a typed intended operation; the returned proof is single-use,
version/actor/target/intent bound. Factor recovery for a privileged target is operator-
controlled under #201, not an admin web override.

Ordinary completed login uses the existing 200 TokenResponse; the SSO contract is
unchanged. Implemented `/auth/login` 202 challenges are distinct from completed
sessions and are handled by #199/#205. Public
reset requests return generic 202 for all syntactically valid accounts. Disabled
methods use 403 `AUTH_METHOD_DISABLED`; invalid/expired/replayed proof uses generic
401; authority denial 403; state/last-admin conflict 409; input validation 422;
throttling 429; unavailable security-state enforcement 503. Existing endpoints retain
existing details except the explicitly changed strict-version/last-admin decisions.

### New-password wire bounds

`NewPassword` gives enrollment, reset completion, password change and optional
recovery `new_password` fields one 15–128-code-point wire bound. For requests that
pass the route's origin/CSRF/security-context admission, malformed new-password
length returns a redacted 422 before grant/proof lookup or consumption. This
intentionally precedes the previous invalid-proof 401 outcome for short new values.
A valid-length value still requires valid authority and the shared runtime password
policy (including the blocklist). Current/login password verification and intended
change commitments are separate inputs; their compatibility bounds are unchanged.
Omitted recovery `new_password` retains the current-password recovery branch.

## Threat/control ownership

Each row names one control owner. Integration of a control is a separate row, not
an implicit transfer of its authority.

| Threat | Control | Delivery owner |
|---|---|---|
| Wrong profile/tenant or mixed replicas | Immutable binding and startup checks | #194 |
| Incorrect installer profile translation | Canonical profile selection and validation | #204 |
| Wrong-tenant restore | Restore profile/binding validation | #207 |
| Dormant directory password | Linked-account local-auth denial, no provider fallback | #194 |
| Old-token resurrection | Shared version/refresh revocation and locked issuance | #195 |
| Sync undoes suspension or removes last usable Admin | Independent eligibility and serialized manual availability guard | #196 |
| Invitation theft/replay/enumeration | Purpose-bound invitation and encrypted retryable delivery | #198 |
| Password/reset/address takeover | Verified, bounded reset and address workflows | #200 |
| Password guessing/KDF exhaustion | Offline password policy and bounded KDF admission | #197 |
| Login CSRF | Native browser origin, CSRF and challenge binding enforcement | #199 |
| Cross-worker brute force or security-state outage | Shared rate state and fail-closed 503, without weaker fallback | #199 |
| Partial login mistaken for full authority | Discriminated challenge/session wire contracts | #193 |
| Partial credential used to issue a session | Locked factor completion and common session issuer | #199 |
| Action-proof reuse | Single-use recent proof bound to actor/version/action/intent | #199 |
| Lost-factor/last-Admin takeover | Verified recovery and dual-signature privileged maintenance exception | #201 |
| Delivery-secret leakage | Dedicated encrypted delivery envelopes and expiry/removal | #198 |
| Factor-secret leakage | Context-bound encrypted TOTP state | #199 |
| Key loss or unsafe retirement | Key backup/recovery and checked rotation | #201 |
| Restore revives revoked authority | Signing cutover and current-security-state reconciliation | #207 |
| Browser retains prior principal state | Native frontend principal isolation and challenge handling | #205 |
| Incomplete native production release | Non-configurable admission guard and final release acceptance | #208 |

Trust assumptions: protected host/root administration and secrets, reviewed Entra
configuration, TLS at the public boundary, and independently accountable human recovery
approvers. TOTP is not claimed phishing-resistant. No claim of regulatory certification.

## Verification and closure

Capture public pre-change failures, then run focused HTTP/state tests and the dedicated
PostgreSQL file. PostgreSQL skips are not passes. The PR's foundation workflow executes
both new files and the existing auth/directory regressions against a real database.
Generated-schema parity, production docs, authorization capability parity, architecture
locks, frontend schema/type checks and applicable hosted gates must all be reviewed.

This handoff records requirements and commands, not an assertion that every gate or
independent security review has already passed. The PR description is the candidate-
specific evidence ledger. Do not close the four issues solely because a draft exists.
Preserve native admission denial until #208. Use the normal protected-branch review
and release process; this guide is not candidate-specific approval evidence.

See [native directory isolation](identity-directory-isolation.md) for external service admission, local-directory continuity, capabilities and diagnostics.

## Restore continuity

Follow [identity-safe restore](identity-restore.md) for signed manifests, current security
checkpoints, new signing authority, quarantine, explicit access review and compatible
rollback. Old JWT keys and consumed authentication artifacts must never be reinstated.


### Security-transition evidence and audit facts (#195)

Actual manual/effective-access transitions preserve one existing mutation audit
and project the controlled transition code under `changes.event_type`, plus the
actual refresh-row count under `changes.revoke_count`. Directory eligibility,
deprovision, import and break-glass events, admin revocation, native credential /
factor / recovery events and restore reconciliation carry the equivalent safe
facts in their existing events. Zero means a real transition revoked no remaining
live refresh row; it is not an unavailable count. Logout and replay retain their
existing reason/count projections. No nested session-authority or credential
payload is unredacted and no new audit transaction is introduced.

`test_identity_revocation_acceptance.py` exercises real retained access/refresh
credentials after reactivation and genuine commit failure with a fresh persistence
observer across both manual adapters. `test_identity_transition_evidence.py` adds
strict signed production claim matrices, nonmanual persisted revocation, rejected
and no-op assignment, successful native KDF rehash without authority revocation,
and DB/public/SIEM projection without secret exposure. The existing full native
journeys are reused by `test_identity_audit_projection.py` to compare real primitive
return counts with persisted and streamed audit facts. PostgreSQL issuance/reset /
refresh/replay races remain authoritative; SQLite skips do not prove lock behavior.
The business Activity Log keeps its existing authority boundary, including the
platform-Admin exclusion; operational and SIEM visibility are not broadened.


Manager cleanup records one `manager_deactivated` USER/UPDATE for each genuinely
changed subordinate, with the initiating actor (or truthful system `None`) and
actual refresh-row revoke count. It uses the existing ordered User lock loop and
caller transaction; repeated cleanup has no subordinate rows/events, and a failed
parent commit rolls back manager references, versions, refresh rows and persisted audit rows.
The existing immediate SIEM emission remains an attempted-event record and is not
rolled back with the database transaction.
Existing directory operational check records are preserved separately from this
no-op subordinate guarantee.


### Identity field ownership (#251)

`core/identity_field_ownership.py` classifies known identity fields for the account
and explicit deployment: directory, credential workflow, or administrator. Both
write adapters and access-user capability projection consume that answer. Ownership
does not grant edit permission: Admin/CRO authority, target visibility and Entra
password-endpoint availability remain separate. Visible readers receive the same
owned-field facts; the dialog retains English/Czech explanations and excludes those
fields from requests. Unchanged native email remains a no-op. Early credential
checks intentionally preserve existing denial precedence before generic field checks.

The two refresh eligibility checks and ordered lifecycle actor recheck receive the
caller's explicit deployment Settings, including native workflow context, directory
checks and the offline recovery CLI. The caller inventory covers application and
operator-script Python sources. The eligibility policy, actor/version checks and acquisition/commit order are
unchanged. Native downstream validation remains an independent defense; a missing
settings argument alone was not claimed as a demonstrated authentication bypass.


### Upstream loss of the last platform administrator (#196)

An upstream disabled/missing result still deprovisions the existing Entra account,
revokes its session authority and creates no fallback account. If no effective
platform administrator remains, the existing incident event exposes the fixed code
`platform_admin_unavailable` in persisted and SIEM metadata. Its constant description
“Platform administrator unavailable after upstream revocation; operator recovery
required” appears in persisted, authorized operational and SIEM descriptions.
The event retains its original actor
(or system `None`), target and transaction; its accompanying deprovision event owns
the actual revoke count. Raw provider narratives, target identity fields and
credentials are not made public by this template.

`test_identity_lifecycle_acceptance.py` covers disabled/missing upstream results,
HTTP/system actors, the remaining-administrator negative control, retained-token
denial and absence of fallback. It also preserves local suspension across directory
re-enable and proves rejected manual last-Admin changes have no authority effects.
These cases do not expand web authority or replace the separately verified,
dual-signature offline recovery exception or PostgreSQL concurrency acceptance.


### Ordinary factor policy (#252)

`_local_auth.factor_policy.evaluate_factor_policy` owns confirmed-factor,
factor-required and factorless enrollment-step completion decisions. Login,
session validation, both recent-authentication checks, enrollment, account-security
projection and bootstrap status use its answers. Under optional policy, accounts
with an already-confirmed factor still authenticate with it; accounts without one
retain password-only completion. Required policy with a confirmed factor remains
an operational bootstrap account. Unknown policy raises before a successful transition
commit; normal Settings validation independently rejects unknown values.

The pure answer grants no account authority. Enrollment/readiness, recovery-pending,
verified invite completion, grants, intent binding, factor generation and existing
locks/transactions remain separate. Restore credential-confidence and factor artifact
lifecycle checks retain their own semantics. Native MFA verification continues using
the existing shared session issuers and is now covered by the token-exchange lock.
