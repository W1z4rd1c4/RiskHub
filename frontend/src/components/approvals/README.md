# Approval components

Shared presentation primitives for permission-scoped approval data.

- `GovernedMutationDiff.tsx` renders server-projected before/after business
  values, derived impact, and readable impacted-resource labels. Callers must
  only render it when the backend capability permits viewing the proposal.
- The component intentionally never falls back to raw resource IDs. Approval
  lifecycle actions and capability decisions remain owned by the calling page.
