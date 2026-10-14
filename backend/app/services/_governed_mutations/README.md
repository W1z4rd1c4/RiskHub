# Governed mutations

This package owns immutable, versioned proposals for protected business
mutations defined by [ADR-016](../../../../docs/adr/ADR-016-governed-mutation-proposals.md).

## Current scope

- `process_identity.py` owns the exact `process.edit` identity. The companion
  `process_mutations.py` owns strict `process.create`, `process.archive`, and
  `process.link.*` proposal identities and intake.
- `process_updates.py` evaluates both the current and proposed Process CIF
  state for the fixed `protected_process_edit` scenario.
- Protected creates, edits, relationship mutations, and archive requests
  require a reason and an independent active Risk Manager or CRO. They create
  an immutable proposal, safe audit event, and transactional outbox event
  instead of changing operational truth immediately. Creates have no Process
  row, F-code, or impact lock until approval; links lock every impacted Process.
- A pending impact lock blocks overlapping Process business edits until the
  proposal is applied, rejected, cancelled, or expires as stale.
- `asset_mutations.py` owns the fixed `protected_asset_edit` workflow. Current
  or proposed CIF Yes and resulting criticality Critical protect Asset
  create/edit/link/archive. Existing-row proposals lock every affected Asset;
  creation remains rowless.
- Ticket #86 extends ticket #85's immutable Process relationship plan with
  Process-to-Asset simulation. One Composite approval locks Process and Asset
  impacts, rederives the full graph at resolution, and applies all effects or
  none. Vendor governance beyond Asset-managed link consequences remains later
  scope.
- When the fixed scenario is disabled, the ordinary Process lifecycle remains
  the transaction owner and applies the authorized mutation directly. Restore
  remains a direct delete-authorized lifecycle action.
- Proposal dispatch is fail closed. A valid exact Process proposal uses the
  governed path; a row without any proposal may use a legacy path; every
  unsupported or malformed proposal is excluded from both. Unsupported
  proposal kinds/types remain absent from queues, counts, inbox operations,
  notifications, execution, and outbox delivery and cannot be resolved as a
  different workflow. A malformed proposal of a recognized Process
  kind also cannot execute or be reclassified as legacy; an authorized direct
  resolution attempt may only move its approval to terminal `EXPIRED`, apply
  no business mutation, release every active impact lock associated with the
  proposal, and emit the safe expiry audit/outbox facts in the same transaction.
- Extended queue and notification membership uses one eager-loaded candidate
  query and one `strict_extended_process_identity()` pass. Its validated ID
  set becomes the SQL classifier reused by counts and pages. This bounded
  parse pass avoids per-row queries, keeps SQLite and PostgreSQL behavior
  identical, and prevents corrupt rows from consuming pagination offsets.

- `resolution_guards.py` owns pending-state admission, non-blank rejection
  reasons, and common envelope integrity. `resolution_envelope.py` owns refreshed
  approval/proposal/impact-lock loading and terminal response reloads. A corrupt
  unresolved proposal may only expire through its family's authorized bounded
  cleanup; terminal replay cannot create a second audit/outbox suffix.

## Operational application and versions

The Vendor-domain `apply_vendor_edit` step owns Vendor edit fields, their
governance-version change, and completion of an already-validated orphan. It
is used by ordinary direct edits, approved replay, and direct orphan repair.
Authorization, reference validation, locking, stale checks, audits, approval
terminal transitions, outbox events, and transaction completion remain with
the existing entry points.

An accepted ordinary or approved Vendor edit advances the Vendor version once.
Ordinary direct no-op edits return before application. Direct orphan ownership
repair advances the version only when the owner changes, while a same-owner
repair still completes the orphan. This distinction is intentional and is not
a new no-op policy for other mutations.

## Boundaries

- Proposal intake and proposal-specific lifecycle behavior belong here.
- Approval queue authorization and projection stay in `_approval_queue` and
  `approval_scenario_policy.py`.
- Notification delivery is triggered through `services/outbox`; notification
  preferences suppress delivery only and never remove approval queue work.
- Service boundaries flush audit facts and commit once through the canonical
  transaction helpers. Endpoint modules must not commit.

Keep this README aligned when another protected resource or mutation kind is
added.
