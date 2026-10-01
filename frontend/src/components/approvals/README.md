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
- `GovernedMutationReasonDialog.tsx` and `PendingChangeCancellationDialog.tsx`
  are thin `ConfirmDialog` adapters (governed link reason; pending-request
  cancellation).
