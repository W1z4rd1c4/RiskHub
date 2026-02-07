---
phase: 180-e2e-business-logic
plan: 180-14
status: complete
---

# Summary 180-14: Archive Visibility Matrix Across Surfaces

## Outcome
- Extended deterministic archive visibility assertions across risk/control/kri list/detail and link search surfaces.

## Changes
- Updated matrix suites:
  - `frontend/e2e/risks.spec.ts`
  - `frontend/e2e/controls.spec.ts`
  - `frontend/e2e/kris.spec.ts`
  - `frontend/e2e/cross-department/link-access.spec.ts`
- Added reusable row wait helper in `frontend/e2e/helpers/wait.ts`.

## Verification
- Archive include-toggle assertions implemented for all targeted surfaces.
