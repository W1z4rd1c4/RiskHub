# ADR-016 Governed Mutation Proposal and Impact-Lock Contract

## Status

Accepted

## Context

RiskHub's existing approvals are lifecycle envelopes for Risk, Control, and KRI
delete/edit requests. Protected ICT-register changes need a stronger contract:
the proposal must remain reviewable without changing operational truth, every
impacted record must be locked once, derived impact must be reproducible, and
approval must never apply a stale or only partially valid change.

The first complete tracer was a Process business-data edit where the Process's
current or proposed derived CIF is `Ano` (Yes). The contract now also covers
protected Process creation, Process relationship mutations, and archive. Ticket
#86 extends the same contract to protected Asset create/edit/link/archive and
Composite Process-to-Asset consequences. Ticket #87 extends it to protected
Vendor create/edit/archive, Contract and Sub-outsourcing child mutations,
Vendor-managed Risk/Control/KRI links, and Composite Process/Asset-to-Vendor
consequences. Ticket #88 adds a fourth fixed scenario,
`accountability_reassignment`, for actual accountable-user or Owning Department
deltas on Process, Asset, Vendor, and Threat records, including Governance
orphan resolution.

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
- base resource versions (empty for a rowless `process.create` proposal);
- permission-neutral before and proposed after business snapshots;
- before/after derived-impact snapshot;
- normalized proposed field/link operations;
- complete impacted-resource identities and base versions (an empty collection
  for rowless `process.create`, because no operational Process exists yet);
- requester and UTC-aware creation timestamp.

Lifecycle fields remain on `ApprovalRequest`; proposal content is not rewritten
on approve, reject, cancel, or stale expiry. APIs project proposal content only
through actor-specific safe-label and capability filters. Raw hidden linked IDs
or labels are never returned merely because they occur in a proposal.
SQLAlchemy rejects persisted proposal updates/deletes, and PostgreSQL repeats
that insert-only invariant with a table trigger so Core SQL and other writers
cannot rewrite audit evidence.

Revision `n4o5p6q7r8s9` encodes rowless Process creation without weakening the
identity contract for any existing-row workflow. It adds the PostgreSQL
`approval_action_type` enum member `CREATE` (and the equivalent constrained
SQLite enum value), makes `approval_requests.resource_id` and
`governed_mutation_proposals.primary_resource_id` physically nullable, and
then narrows those nulls with two named database checks:

- `ck_approval_requests_process_create_resource_identity` permits a null
  `resource_id` exactly for Process, Asset, or Vendor `CREATE`; every other envelope
  must have a resource ID.
- `ck_governed_mutation_process_create_resource_identity` permits a null
  `primary_resource_id` exactly for `process.create`, `asset.create`, or
  `vendor.create`; every
  other proposal must have a primary resource ID.

The migration is forward-only under ADR-010. PostgreSQL release evidence must
include both a blank-database zero-to-head rehearsal and a representative
`m3n4o5p6q7r8`-to-head rehearsal; application test startup is not a substitute
for either migration proof.

Revision `o5p6q7r8s9t0` extends the same fixed envelope to Asset create, edit,
archive, and typed relationship mutations. Its ADR-010 evidence is automated
in `tests/backend/pytest/migrations/test_governed_asset_migration_rehearsal.py`
for both blank zero-to-head and `n4o5p6q7r8s9`-to-head PostgreSQL lanes.

Revision `p6q7r8s9t0u1` adds Vendor as an approval resource, gives Vendor rows a
monotonic `governance_version`, permits rowless `vendor.create`, and seeds the
fixed `protected_vendor_edit` scenario. Its forward-only PostgreSQL rehearsal
lives in
`tests/backend/pytest/migrations/test_governed_vendor_migration_rehearsal.py`.

### Resource versions and impacted-resource locks

Governed operational records carry a monotonically increasing
`governance_version`. Each applied business-state mutation increments it once.
Comments, evidence, and activity entries do not increment it because they are
explicitly outside the business mutation lock.

For mutations of existing rows, submission stores every impacted
`(resource_type, resource_id, base_governance_version)` and acquires an active
`GovernedMutationImpactLock`.
The database enforces at most one active lock per impacted resource with a
partial unique index. A lock points to one proposal version and is released only
when its approval reaches approved, rejected, cancelled, or expired. Process
edit/archive acquires one Process lock and relationship proposals lock every
impacted Process in deterministic order. A pending Process creation has no
operational row and therefore no impact lock; its approval ID and immutable
proposal UUID are its only identities until approval creates the row.

Ticket #85 governs the Process mutation itself: its normalized Risk, Asset, or
Vendor relationship operation, every Process whose approved relationship state
or primary designation changes, and the corresponding Process impact locks and
versions. It deliberately does not classify the counterpart Asset or Vendor as
a governed resource. Ticket #86 adds protected Asset mutation policy and the
downstream Process-to-Asset derivation/Composite approval, including Asset
impacts and locks. Ticket #87 adds Vendor cascade governance, Vendor impacts,
and Vendor locks. These extensions add resource descriptors and rederivation to the same operation-plan
seam; they do not reinterpret or weaken the exact #85 Process-link identity.

The fixed Asset scenario is `protected_asset_edit`. An Asset is protected when
current or proposed CIF is Yes, or current or proposed resulting criticality is
Critical. Protected Asset create/edit/archive and Asset-managed Asset/Vendor
link changes use one immutable proposal and deterministic Asset locks. A
Process-to-Asset operation whose Process or Asset consequence is protected uses
one Composite proposal, locks both resource types, rederives the full graph at
approval, and applies all effects or none.

The fixed Vendor scenario is `protected_vendor_edit`. A Vendor is protected
when its current or proposed derived tier is Critical or Significant. Protected
Vendor create/edit/archive, Contract and Sub-outsourcing create/edit/archive,
and Vendor-managed Risk/Control/KRI link add/remove operations
use the same immutable proposal envelope. Existing Vendor changes lock the
Vendor; rowless creation does not create a Vendor record until approval.
Composite Process/Asset changes include every affected Vendor tier snapshot
and lock, then rederive and apply the whole graph atomically. Asset-to-Vendor
and Process-to-Vendor relationship changes retain their governed
`asset.link.vendor.*` and `process.link.vendor.*` composite identities.

### Protection and submission rules

The fixed Process scenario key is `protected_process_edit`. An edit is protected
by the invariant `current derived CIF == Ano OR proposed derived CIF == Ano`; a
create is protected when proposed CIF is Yes;
an archive when current CIF is Yes; and a relationship mutation when any
impacted Process has current CIF Yes. Derivations use the same locked readable
graph and parameter snapshot so classification changes cannot bypass governance.

When enabled, a protected create/edit/link/archive is submitted, not applied,
and requires a non-empty reason. Creation inserts no placeholder row or F-code;
approval performs the insert and then assigns `F<id>`. Pending proposals are
visible only to their requester and eligible independent approvers and remain
absent from operational lists, exports, counts, graph derivation, and formal
outputs. When disabled, the same authorized mutation applies directly. Restore
always remains direct. Active impact locks reject overlapping business changes
with `process_pending_mutation` while comments, evidence, and activity remain
available.

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

`process_identity.py` owns the strict `process.edit` identity while
`process_mutations.py` owns strict identities for `process.create`,
`process.archive`, and normalized `process.link.*` operations. Queue SQL admits
only the corresponding scenario/action/resource envelope before strict object
projection.
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
business-mutation execution, or ordinary outcome delivery. For a malformed
proposal of a recognized extended Process kind, a direct resolution action may
only invoke the bounded integrity-terminalization path described below. The
resolver arm uses the snapshotted `scenario_approver_roles`. Existing-row
proposals require the Process identified by the immutable proposal to exist;
rowless creation reconstructs its non-operational Process scope from the
immutable proposed `after` payload. Both apply the same
global-authority-or-Process-visibility rule before pagination or counting. One
canonical pending-query predicate feeds the main queue, My Approvals, badge
count, and User shell-summary count. Terminal history
keeps configured scoped resolvers and requesters visible after approval,
rejection, expiry, or cancellation. The requester arm remains independent of
resource scope. Resource-type filters and governed snapshot access use the
proposal's immutable `primary_resource_type` and `primary_resource_id`, never
the mutable envelope fields. Generic privileged, primary-approver, and legacy
scenario arms remain available only when no proposal exists.

Approval locks the approval envelope and immutable proposal. For an
existing-row mutation it also locks the active impact locks and every impacted
operational row. A rowless `process.create` has neither an impact lock nor a
Process row; resolution instead locks and revalidates its referenced owner,
Department, roles, parameters, and scenario before inserting the Process. Before
mutation every applicable path revalidates:

- pending lifecycle and intact proposal identity/version;
- requester/approver separation and current resolver authority;
- live scenario identity and compatible fixed policy;
- current authorization and reference eligibility;
- each stored base `governance_version` (none for rowless creation);
- current protection and a fresh proposed derivation against current parameters;
- exact normalized before values and impacted-resource membership.

After a strict immutable identity has been established, any mismatch in the
mutable approval envelope, locks, operational row, or current policy expires
the approval without applying the proposal. Expiry is a terminal lifecycle
distinct from rejection, releases all active locks, records a safe audit event,
and routes the outcome notification. It never overwrites approved operational
truth. An unsupported or malformed immutable proposal cannot establish the
trusted identity needed for business execution. An unsupported proposal
kind/type remains excluded from resolution. A malformed proposal of a
recognized extended Process kind instead fails closed through a bounded
authorization path: it leaves the immutable proposal unchanged, applies no
business mutation, moves the approval to terminal `EXPIRED`, releases every
active impact lock associated with the proposal, records a safe expiry audit
event, and enqueues the terminal expiry outbox event. The mutable envelope may
be consulted only for bounded reviewer-scope authorization; it never supplies
proposal identity or business-mutation data.

Existing-row Process-governance paths use one deterministic lock order: approval
envelope, proposal, impact locks ordered by resource identity, Process-owner
advisory identities ordered by User ID, User rows ordered by ID, the distinct
requester, resolver, and proposed-owner Role rows ordered by Role ID, Department
rows ordered by ID, Process rows ordered by ID, downstream Asset rows ordered by
ID, workbook-parameter rows ordered by config key, then fixed approval-scenario
rows ordered by key. Rowless creation follows the same prefix
and reference-row order but omits impact-lock and Process-row locks because
neither exists. The locked Role rows serialize current permission
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

Generic edit and extended archive/relationship resolution delegate the shared
existing-row suffix to `_governed_mutations/resolution_lock_plan.py`; rowless
creation delegates its applicable reference/parameter/scenario suffix without
inventing a Process-row lock. An architecture lock prevents either resolver
from reintroducing an independent lock state machine.

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

Postgres concurrency tests are authoritative for existing-row partial unique
locks and row-lock ordering, rowless-creation duplicate serialization,
simultaneous submissions, submit-versus-resolve races,
requester-permission update versus approval races, and proposed-owner role
assignment versus approval races, plus resolver scope/department updates versus
approval races. A permission or scope update that
locks first is visible to approval revalidation; an approval that locks first
applies under that locked old authority before the permission update proceeds.
SQLite tests characterize API behavior but do not prove concurrency.

### Lifecycle, projections, capabilities, and audit

Process lifecycle (`active`/`archived`) remains separate from approval state.
An approved Process remains effective while edit/link/archive is pending, and
a pending creation is a proposal only. Lists and detail may show actor-scoped
pending state, but list facets, operational counts, exports, relationships, and
derivations continue to use approved state.

Backend capabilities are authoritative. Process projections expose whether a
pending change exists, whether business editing is blocked, whether the actor
may request a change, view its safe diff, or cancel it. Approval projections
expose proposal snapshots only when the actor may read the proposal's immutable
Process identity or is a resolver satisfying the shared proposal-backed policy.
Frontend gates mirror these capabilities and never infer approval power from
roles alone.

Audit records proposal submission, approval, rejection, cancellation, expiry,
application, scenario change, and every applicable lock release with proposal
identity/version and safe Process identifiers. Governed relationship domain
audits store safe relationship type/business labels instead of numeric target
IDs; automatic primary-Process demotion records the resolver and both the link
state and demoted Process version in the same transaction. Audit descriptions do
not contain unrestricted free-text snapshots or hidden linked-record data.

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

## Public Vendor Contract

Vendor create and update accept `request_reason`; Vendor archive accepts the
reason in the DELETE body. Direct operations return the ordinary Vendor/empty
response. Protected operations return HTTP 202 with the shared
`approval_required` envelope and leave approved Vendor truth unchanged.
Contract, Sub-outsourcing, and Vendor-managed link endpoints use the same
typed 202 envelope when their Vendor impact is protected. Restore remains
direct.

`VendorRead` carries `governance_version` and a permission-scoped nullable
`pending_change`. Vendor capabilities expose whether the current operation
requires approval, whether the actor can request/cancel it, whether a proposal
is pending, and whether business edits are blocked. The requester and an
eligible independent resolver see localized safe-label diffs in Vendor detail,
Approvals, and My Requests; other Vendor readers receive only the redacted
pending banner contract. No raw database identifier is a display fallback.

Risk Hub exposes `protected_vendor_edit` as fixed policy: enabled state and the
non-empty `risk_manager`/`cro` role subset are editable; the
current-or-proposed Critical/Significant threshold, covered Vendor/child/link
actions, and no-self rule are read-only.

## Public Accountability Reassignment Contract

`accountability_reassignment` is a fixed, default-on scenario covering actual
changes to Process Owner or Owning Department; Asset Business Owner, ICT Owner,
or Owning Department; Vendor Outsourcing Owner; and Threat Steward. An
unchanged-accountability edit does not trigger this scenario. A governed delta
requires a localized, non-blank `request_reason`, returns the shared typed HTTP
202 envelope, creates exactly one pending request, and leaves approved truth
unchanged.

The immutable proposal and impacted-resource lock use the existing ADR-016
contract. Only an independent configured Risk Manager or CRO may approve or
reject; the requester may view the proposal in My Requests and cancel it.
Approval applies the complete accountability delta atomically. Rejection,
cancellation, expiry, or stale revalidation preserves the original approved
accountability.

Governance orphan resolution uses the same contract. The orphan and ordinary
edit lock remain until approval applies the replacement. If the scenario is
disabled, the same endpoint may return the typed direct-resolution response;
authorization, active-user, Department, and resource-specific validation still
apply. CROs may change only enabled state and the non-empty Risk Manager/CRO
resolver-role subset; trigger, covered edit action, and no-self-approval policy
are immutable.

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
additively for Process and expired governed requests. Revision
`n4o5p6q7r8s9` adds `CREATE` and the nullable-but-check-constrained rowless
identity described above; it does not permit null identities for edit,
archive, relationship, or legacy approvals. Seed the fixed Process scenario
default-on with Risk Manager and CRO roles. Existing Risk, Control, and KRI
approvals retain their legacy envelope behavior and do not require a backfilled
governed proposal.

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
  competing edits, assert one active lock per impacted existing row, serialize
  duplicate rowless creation, and prove atomic rollback.
- ADR-010 release evidence records successful zero-to-head and
  `m3n4o5p6q7r8`-to-head PostgreSQL rehearsals for `n4o5p6q7r8s9`, including
  the `CREATE` enum label, both nullable columns, both named checks, zero check
  violations, and the final Alembic head.
- The governed Asset migration rehearsal independently proves zero-to-head and
  `n4o5p6q7r8s9`-to-head, with final head `s8t9u0v1w2x3`, on disposable
  PostgreSQL databases.
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
