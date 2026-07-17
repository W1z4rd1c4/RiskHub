# ADR-016 Governed Mutation Proposal and Impact-Lock Contract

## Status

Accepted

## Context

RiskHub's existing approvals are lifecycle envelopes for Risk, Control, and KRI
delete/edit requests. Protected ICT-register changes need a stronger contract:
the proposal must remain reviewable without changing operational truth, every
impacted record must be locked once, derived impact must be reproducible, and
approval must never apply a stale or only partially valid change.

The first complete tracer is a Process business-data edit where the Process's
current or proposed derived CIF is `Ano` (Yes). The same seam must later support
protected Asset and Vendor changes, accountability reassignment, creation,
relationships, archive, and Composite cascade impacts without redefining
proposal identity or transaction ownership.

## Decision

### Approval envelope and immutable proposal identity

`ApprovalRequest` remains the queue/lifecycle envelope. A governed request has
exactly one immutable `GovernedMutationProposal`, addressed by a generated UUID
`proposal_id` plus a positive integer `proposal_version`. The pair is unique and
never reused. Version 1 is the only Process-tracer version; a later revision is
a new immutable version and never an update of the stored snapshots.

Proposal payload columns are insert-only after the submission transaction:

- schema version and fixed mutation kind;
- scenario key, enabled state, and approver-role snapshot;
- primary resource type and business-safe identity;
- base resource versions;
- permission-neutral before and proposed after business snapshots;
- before/after derived-impact snapshot;
- normalized proposed field/link operations;
- complete impacted-resource identities and base versions;
- requester and UTC-aware creation timestamp.

Lifecycle fields remain on `ApprovalRequest`; proposal content is not rewritten
on approve, reject, cancel, or stale expiry. APIs project proposal content only
through actor-specific safe-label and capability filters. Raw hidden linked IDs
or labels are never returned merely because they occur in a proposal.
SQLAlchemy rejects persisted proposal updates/deletes, and PostgreSQL repeats
that insert-only invariant with a table trigger so Core SQL and other writers
cannot rewrite audit evidence.

### Resource versions and impacted-resource locks

Governed operational records carry a monotonically increasing
`governance_version`. Each applied business-state mutation increments it once.
Comments, evidence, and activity entries do not increment it because they are
explicitly outside the business mutation lock.

Submission stores every impacted `(resource_type, resource_id,
base_governance_version)` and acquires an active `GovernedMutationImpactLock`.
The database enforces at most one active lock per impacted resource with a
partial unique index. A lock points to one proposal version and is released only
when its approval reaches approved, rejected, cancelled, or expired. The
Process tracer acquires exactly one Process lock; later Composite changes use
the same table for all Process, Asset, Vendor, Contract, Sub-outsourcing, and
link impacts.

### Protection and submission rules

The fixed Process scenario key is `protected_process_edit`. Its immutable rule
is `current derived CIF == Ano OR proposed derived CIF == Ano`. Current and
proposed derivations use the same locked readable graph and parameter snapshot,
so lowering a classification input cannot bypass governance.

When the scenario is enabled, a protected Process business edit is submitted,
not applied. A non-empty request reason is mandatory. When it is disabled, the
same authorized edit applies directly. Disabled scenarios do not weaken
ordinary authorization or validation. A Process with an active impact lock
rejects later business edits with a stable conflict response while comments,
evidence, and activity remain available. Until the protected-archive scenario
ships separately, direct Process archive and restore remain delete-authorized
lifecycle actions. They acquire the same owner-identity then Process-row locks
as edit intake, reject an active governed mutation with
`process_pending_mutation`, and advance `governance_version` exactly once on
success.

Submission fails when no active independent User exists in at least one
configured `risk_manager` or `cro` role. `risk_owner` and all other roles are
invalid for this fixed scenario. Senior requesters receive no bypass.

### Independent resolution and stale revalidation

Exactly one active configured Risk Manager or CRO who is not the requester and
has current Process visibility (or global approval-resolution authority) may
approve or reject. The same predicate controls submission availability,
approval queues (including history and badge counts), detail, notification
inbox list/count/read operations, and direct resolution. Requesters
may cancel but cannot approve or reject. Rejection requires a non-empty reason.
The no-self rule is evaluated at submission and again at resolution; role,
active-user, Process visibility, and scenario eligibility are also revalidated
at resolution.

One `process_identity.py` module owns the canonical writer, strict object
parser, and dialect-aware SQL identity predicate for the exact
`mutation_kind = process.edit` and `primary_resource_type = process` workflow.
SQLite and PostgreSQL parity tests require SQL membership to equal object-parser
validity for the same payload, including the scenario, versions, snapshots,
operation, impacted identity, requester, and resource identity. Set-based queue
and notification SQL classifies the fixed workflow only from that correlated
immutable `GovernedMutationProposal`; the mutable approval envelope never
decides whether generic privileged legacy behavior applies.

Dispatch has three fail-closed states. A strictly valid exact Process proposal
uses the governed path. An approval with no proposal may use a legacy path. Any
unsupported proposal kind/type, and any malformed exact Process proposal, is
excluded from both paths. Such rows cannot enter queue/detail projection,
capabilities, notification inbox list/count/read operations, delivery,
approve/reject/cancel execution, or outbox delivery. The resolver arm uses the
snapshotted `scenario_approver_roles`, requires the immutable proposal's Process
to exist, and applies the same global-authority-or-Process-visibility rule before
pagination or counting. One canonical pending-query predicate feeds the main
queue, My Approvals, badge count, and User shell-summary count. Terminal history
keeps configured scoped resolvers and requesters visible after approval,
rejection, expiry, or cancellation. The requester arm remains independent of
resource scope. Resource-type filters and governed snapshot access use the
proposal's immutable `primary_resource_type` and `primary_resource_id`, never
the mutable envelope fields. Generic privileged, primary-approver, and legacy
scenario arms remain available only when no proposal exists.

Approval locks the approval envelope, immutable proposal, active impact locks,
and every impacted operational row. Before mutation it revalidates:

- pending lifecycle and intact proposal identity/version;
- requester/approver separation and current resolver authority;
- live scenario identity and compatible fixed policy;
- current authorization and reference eligibility;
- each stored base `governance_version`;
- current protection and a fresh proposed derivation against current parameters;
- exact normalized before values and impacted-resource membership.

After a strict immutable identity has been established, any mismatch in the
mutable approval envelope, locks, operational row, or current policy expires
the approval without applying the proposal. Expiry is a terminal lifecycle
distinct from rejection, releases all active locks, records a safe audit event,
and routes the outcome notification. It never overwrites approved operational
truth. An unsupported or malformed immutable proposal cannot establish the
trusted identity needed to release locks; resolution instead fails closed and
leaves the request pending for explicit integrity remediation.

All Process-governance paths use one deterministic lock order: approval
envelope, proposal, impact locks ordered by resource identity, Process-owner
advisory identities ordered by User ID, User rows ordered by ID, the distinct
requester, resolver, and proposed-owner Role rows ordered by Role ID, Department
rows ordered by ID, Process row, workbook-parameter rows ordered by config key,
then the fixed approval-scenario row. The locked Role rows serialize current permission
revalidation with role configuration updates; RolePermission and Permission
relationships are refreshed only after those locks are acquired. User rows
include each primary actor's snapshotted immediate manager, and manager links
are verified unchanged after locking. This serializes resolver
`access_scope`, `department_id`, and manager-fallback visibility with the
approval decision and avoids lazy relationship reads during authorization. Submission
enters the shared suffix at the already locked Process row. Scenario and
workbook-parameter PATCHes lock the same canonical rows before mutation, so
policy or parameter changes either commit before a governed decision derives
its result or wait until that decision commits. Orphaned Process reassignment
uses the owner-advisory lock before the Process row, rejects an active impact
lock with `process_pending_mutation`, and increments `governance_version` on
success.

Current and proposed protection are derived from one in-memory graph loaded in
the transaction and one uncached, row-locked workbook-parameter set. The
parameter locks are retained through the submission or resolution commit; a
single decision can therefore never compare current state under one parameter
version with proposed state under another.

### Atomic transaction ownership

Submission is one service-owned transaction containing proposal insertion,
approval-envelope insertion, all impact locks, audit entry, and outbox event.
Resolution is one service-owned transaction containing revalidation, optional
business mutation, version increment, lifecycle transition, lock release, audit
entry, and outbox event. Endpoints do not commit. The workflow uses
`commit_service_boundary`; outbox storage remains flush-only. Failure at any
step rolls back the entire transaction. Partial Composite application is forbidden.

Postgres concurrency tests are authoritative for the partial unique lock,
row-lock ordering, simultaneous submissions, submit-versus-resolve races,
requester-permission update versus approval races, and proposed-owner role
assignment versus approval races, plus resolver scope/department updates versus
approval races. A permission or scope update that
locks first is visible to approval revalidation; an approval that locks first
applies under that locked old authority before the permission update proceeds.
SQLite tests characterize API behavior but do not prove concurrency.

### Lifecycle, projections, capabilities, and audit

Process lifecycle (`active`/`archived`) remains separate from approval state.
An approved Process remains the effective operational row while a proposal is
pending. Lists and detail may show `Pending change`, but list facets, counts,
exports, relationships, and derivations continue to use approved state.

Backend capabilities are authoritative. Process projections expose whether a
pending change exists, whether business editing is blocked, whether the actor
may request a change, view its safe diff, or cancel it. Approval projections
expose proposal snapshots only when the actor may read the proposal's immutable
Process identity or is a resolver satisfying the shared proposal-backed policy.
Frontend gates mirror these capabilities and never infer approval power from
roles alone.

Audit records proposal submission, approval, rejection, cancellation, expiry,
application, scenario change, and lock release with proposal identity/version
and safe Process identifiers. Audit descriptions do not contain unrestricted
free-text snapshots or hidden linked-record data.

### Notifications and timers

Two default-on User preferences are canonical:

- `governed_approval_action_required` for submission, cancellation, and expiry
  events relevant to an eligible approver;
- `governed_approval_request_updates` for approval, rejection, cancellation,
  and expiry outcomes of the requester's own proposal.

Linked approval notifications use the same fixed-workflow SQL predicate for
inbox pagination, unread counts, single-item read, and read-all. A stored
notification cannot be recovered or mutated merely because its owner has
generic global approval authority under a role excluded by the proposal
snapshot.

Preferences suppress notification delivery only. Approval queues, My Requests,
capabilities, and unread work calculations remain authoritative and visible.
The governed-mutation seam adds no due date, SLA, reminder, overdue state,
automatic decision, or timer-driven escalation.

## Public Process Tracer Contract

The existing `PATCH /api/v1/processes/{process_id}` accepts an optional
`request_reason` alongside Process update fields. It returns the normal Process
read model when direct application is allowed or HTTP 202 with the normalized
approval-queued response when governance is required. A protected submission
without a non-blank reason is rejected. A second business edit while locked
returns HTTP 409 with code `process_pending_mutation` and the approval identity.

`ProcessRead` carries a nullable permission-scoped `pending_change` projection.
`ProcessCapabilities` carries request, cancel, pending, and business-edit-lock
flags. Approval list/detail projections carry an optional governed-mutation
projection with proposal identity/version, safe before/after values, derived
impact, and impacted resources.

Risk Hub continues to use `GET /api/v1/riskhub/approval-scenarios` and
`PATCH /api/v1/riskhub/approval-scenarios/{key}`. For
`protected_process_edit`, only enabled state and the non-empty subset of
`risk_manager`/`cro` approver roles are editable. The threshold, covered edit
action, and no-self rule are returned as fixed policy and cannot be patched.

## Alternatives Rejected

- Mutating the Process before approval and storing a rollback copy: rejected
  because unapproved data would enter operational queries and rollback can lose
  concurrent work.
- Reusing only `ApprovalRequest.pending_changes`: rejected because it lacks
  immutable proposal identity, complete derived snapshots, impacted-resource
  versions, and Composite locks.
- One boolean `has_pending_change` on Process: rejected because it cannot lock
  multiple impacts atomically or preserve proposal/version evidence.
- Privileged direct bypass: rejected because it violates the independent
  two-person control.
- Application-only duplicate checks: rejected because concurrent Postgres
  submissions can both pass before either commits.
- Timer-driven expiry: rejected; expiry occurs only during explicit submission,
  decision, cancellation, or read-side stale reconciliation.

## Migration Impact

Add forward-only proposal and impact-lock tables plus a Process
`governance_version` initialized to 1. Extend approval resource/status contracts
additively for Process and expired governed requests. Seed the fixed Process
scenario default-on with Risk Manager and CRO roles. Existing Risk, Control,
and KRI approvals retain their legacy envelope behavior and do not require a
backfilled governed proposal.

## Rollback Strategy

The schema migration is forward-only after governed proposals exist. Feature
rollback disables `protected_process_edit`, leaves immutable proposal/audit
history intact, releases no lock without a terminal transition, and restores
direct Process edits only after a consistency check confirms no active lock.

## Invariant Tests

- ADR and architecture locks pin proposal identity/version immutability,
  service-owned transaction boundaries, stable Process API fields, and the
  absence of endpoint commits.
- API tests cover current/proposed protection, mandatory reasons, missing
  independent approvers, no-self, pending lock, capabilities, and safe diffs.
- The current Process domain has no comment or evidence-write endpoint. The
  tracer therefore adds no fictional channel; it proves that the pending lock
  applies to business mutations while Process detail and the independent,
  read-only Activity Log remain available.
- Resolution tests cover all stale inputs and prove expired requests never
  mutate approved state.
- Postgres tests race concurrent submissions and approval/application against
  competing edits and assert one active lock and atomic rollback.
- Authz contract tests bind service enforcement, Process/approval capability
  schemas, frontend gates, and documentation.
- Timezone tests require UTC-aware proposal, resolution, and lock timestamps.

## ADR Cross-References

- ADR-001: backend capabilities remain authoritative.
- ADR-002: submission and resolution are service-owned atomic transactions.
- ADR-003: domain conflicts, authorization failures, and validation failures use
  the canonical exception taxonomy.
- ADR-004: every governed-mutation instant is UTC-aware.
- ADR-005: Process lifecycle remains separate from approval lifecycle.
- ADR-007: the governed-mutation Module owns proposal and lock policy while
  domain Modules own Process validation/derivation.
- ADR-008: current and proposed CIF derive from the canonical ICT parameter set.
- ADR-010: proposal/lock migrations are rehearsed forward-only on Postgres.
