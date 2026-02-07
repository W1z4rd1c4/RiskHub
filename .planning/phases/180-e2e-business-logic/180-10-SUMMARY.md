---
phase: 180-e2e-business-logic
plan: 180-10
status: complete
---

# Summary 180-10: Deterministic Scenario Updates

## Outcome
- Introduced deterministic scenario targeting for previously skip-heavy suites.
- Replaced runtime-first-row patterns in cross-department and approval status flow suites.

## Changes
- Refactored `frontend/e2e/cross-department/control-owner-access.spec.ts` to deterministic ownership entities.
- Refactored `frontend/e2e/approval-workflows/status-flow.spec.ts` to seeded approval-resource assertions.

## Verification
- `test.skip` usage in 180-10 target files reduced to 0.
