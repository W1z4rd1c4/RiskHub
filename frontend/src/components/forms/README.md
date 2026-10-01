# Shared Form Components

Reusable form-adjacent UI components shared across domain pages.

Current notable components:

- `FormStepContext.tsx` and `entityFormWorkflow.ts` for multi-step form navigation

Queued-approval feedback is not a form concern: an approval-routed submit
returns to the entity page through `useApprovalQueued()` (`hooks/`), which
shows `components/approvals/ApprovalQueuedNotice` plus a success toast
(D12 / PM-2).

Do not place domain-specific workflow policy here. Backend capability metadata and domain service responses remain the source of truth for whether a form action is available.
