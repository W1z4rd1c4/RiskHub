---
phase: 180-e2e-business-logic
plan: 180-12
status: complete
---

# Summary 180-12: Deterministic Risk/Control/KRI Refactor

## Outcome
- Refactored permissions and ownership suites to use deterministic seeded entities.
- Removed skip-driven row discovery in the targeted suites.

## Changes
- Updated deterministic selectors and archive-toggle assertions in:
  - `frontend/e2e/permissions/risks-crud.spec.ts`
  - `frontend/e2e/permissions/controls-crud.spec.ts`
  - `frontend/e2e/permissions/kris-crud.spec.ts`
  - `frontend/e2e/entity-ownership/risk-ownership.spec.ts`
  - `frontend/e2e/entity-ownership/control-ownership.spec.ts`
  - `frontend/e2e/entity-ownership/kri-ownership.spec.ts`

## Verification
- `test.skip` usage in these six suites reduced to 0.
