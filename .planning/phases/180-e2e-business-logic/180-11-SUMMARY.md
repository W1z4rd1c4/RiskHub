---
phase: 180-e2e-business-logic
plan: 180-11
status: complete
---

# Summary 180-11: Deterministic Fixture Constants

## Outcome
- Added canonical deterministic fixture constants for risk/control/kri/vendor/vendor-sla/archive entities.

## Changes
- Added `frontend/e2e/fixtures/e2e-data.ts`.
- Exported deterministic fixture constants from `frontend/e2e/index.ts`.

## Verification
- Fixture imports resolve cleanly under `npx tsc --noEmit`.
