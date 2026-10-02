# Approval components

Shared presentation primitives for permission-scoped approval data.

- `GovernedMutationDiff.tsx` renders server-projected before/after business
  values, derived impact, and readable impacted-resource labels. Callers must
  only render it when the backend capability permits viewing the proposal.
- The component intentionally never falls back to raw resource IDs. Approval
  lifecycle actions and capability decisions remain owned by the calling page.
- `ApprovalQueuedNotice.tsx` is the persistent pending-approval notice
  (D12 / PM-2, audit 2026-09-30 §4.16). Entity pages and registers render it;
  it reads the router state written by `useApprovalQueued()` and links to the
  approval request in `/approvals`. The submit flow raises the success toast.
- `PendingChangePanel.tsx` is the one pending governed-change panel (audit
  2026-09-30 GAP-D-07) behind the Asset, Process and Threat detail and
  blocked-edit views (Vendor and Risk/Control adopt it with their modules): warning
  tokens, `namespace` selects the module's `pending_change.*` strings and
  `testIdPrefix` its test ids; reason, requester and diff render only with
  `can_view_diff`, and Cancel only with `can_cancel` plus a handler.
- `GovernedMutationReasonDialog.tsx` and `PendingChangeCancellationDialog.tsx`
  are thin `ConfirmDialog` adapters (governed link reason; pending-request
  cancellation).
- `PendingChangeBadge.tsx` is the one pending-approval row/header badge (audit
  §4.9, PG-29): warning `Badge` with the short "Pending" text and the full
  "Pending approval" accessible name; callers decide from their own
  `has_pending_*` capability flags whether a change is pending.
