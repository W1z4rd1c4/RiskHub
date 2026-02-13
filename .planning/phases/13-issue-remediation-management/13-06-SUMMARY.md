# 13-06 Summary - Contextual Entry Points on Detail Pages

## Delivered

### Detail Page Integrations

Added permission-gated contextual issue creation actions on:

- `frontend/src/pages/RiskDetailPage.tsx`
- `frontend/src/pages/ControlDetailPage.tsx`
- `frontend/src/pages/KRIDetailPage.tsx`
- `frontend/src/pages/VendorDetailPage.tsx`

Each page now:

- shows `New Issue` action only behind `issues:write` gate
- opens `IssueQuickCreateModal` with source-specific context
- routes to `/issues/:id` after create success

### Context Bindings

- Risk detail -> `entity_type='risk'`, label from risk name
- Control detail -> `entity_type='control'`, label from control name
- KRI detail -> `entity_type='kri'`, label from KRI metric name
- Vendor detail -> `entity_type='vendor'`, label from vendor name

No-ID guardrail preserved in action/modal copy.

### Regression Tests

Added page-level tests:

- `frontend/src/pages/__tests__/RiskDetailPage.issue-entry.test.tsx`
- `frontend/src/pages/__tests__/ControlDetailPage.issue-entry.test.tsx`
- `frontend/src/pages/__tests__/KRIDetailPage.issue-entry.test.tsx`
- `frontend/src/pages/__tests__/VendorDetailPage.issue-entry.test.tsx`

Coverage includes:

- action visible for `issues:write`
- action hidden without `issues:write`
- modal context uses business label
- no raw `#<id>` rendering in contextual copy

## Verification Evidence

- `cd frontend && npx tsc --noEmit` -> pass
- `cd frontend && npm run test:run -- RiskDetailPage.issue-entry ControlDetailPage.issue-entry KRIDetailPage.issue-entry VendorDetailPage.issue-entry` -> pass
