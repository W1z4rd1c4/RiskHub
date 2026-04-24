# Shared Form Components

Reusable form-adjacent UI components shared across domain pages.

Current notable components:

- `ApprovalQueuedBanner.tsx` for queued-approval feedback after non-immediate mutations

Do not place domain-specific workflow policy here. Backend capability metadata and domain service responses remain the source of truth for whether a form action is available.
