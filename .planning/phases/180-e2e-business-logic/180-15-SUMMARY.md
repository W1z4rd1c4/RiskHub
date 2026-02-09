---
phase: 180-e2e-business-logic
plan: 180-15
status: in_progress
---

# Summary 180-15: Runtime Verification + 180-16 KRI Flake Stabilization (Still Blocked)

## Outcome
- Stabilized `e2e/cross-department/kri-owner-access.spec.ts` by removing non-deterministic row selection and brittle shell-content assertions.
- Confirmed `kri-owner-access` is stable in focused and stress runs.
- Phase 180 runtime closure remains blocked by additional parallel E2E flakes outside the `kri-owner-access` surface.

## Changes
- Refactored deterministic cross-department KRI ownership spec:
  - `frontend/e2e/cross-department/kri-owner-access.spec.ts`
    - Replaced `clickFirstRow()` flows with deterministic fixture targeting:
      `E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name`
    - Replaced `textContent('main, [role="main"], .content')` truthy assertions with explicit UI-contract assertions:
      `h1` visibility, linked-risk section visibility, and URL transitions.
    - Added deterministic non-owner access checks against the seeded cross-department KRI.

## Verification
- Focused:
  - `cd frontend && npx playwright test e2e/cross-department/kri-owner-access.spec.ts --project=chromium --workers=1`
  - Result: **6 passed**
- Stress:
  - `cd frontend && npx playwright test e2e/cross-department/kri-owner-access.spec.ts --project=chromium --workers=5 --repeat-each=5`
  - Result: **30 passed**
- Impacted deterministic subset (+ `kri-owner-access`):
  - Result: `kri-owner-access` remained green, but subset had unrelated failures in:
    - `frontend/e2e/permissions/kris-crud.spec.ts` (`KRI row not found for deterministic fixture`)
    - `frontend/e2e/risks.spec.ts` (`Risk row not found for deterministic fixture`)
- Full suite:
  - `make test-e2e` started (848 tests in current run context), `kri-owner-access` cases passed when executed.
  - Run surfaced additional unrelated failures before termination, including:
    - `frontend/e2e/controls.spec.ts` (`Control detail navigation works for deterministic control row`)
    - `frontend/e2e/cross-department/control-owner-access.spec.ts` (search input timeout; fixed in follow-up by locale-safe search locator)

- Follow-up fix for control-owner-access:
  - Updated `ControlsPage.searchInput` locator to support localized Czech placeholder/labels and added explicit visibility wait before fill.
  - `cd frontend && npx playwright test e2e/cross-department/control-owner-access.spec.ts --project=ci --workers=1`
  - Result: **4 passed**
  - Re-run of impacted 18-test classification set (`controls`, `permissions/kris-crud`, `risks`, `cross-department/control-owner-access`) now reports:
    - **17 passed, 1 failed** (remaining failure no longer in `control-owner-access`)

## Blocking Items to Close 180-15
- Remaining parallel/ordering flakes in non-`kri-owner-access` suites:
  - `frontend/e2e/controls.spec.ts`
  - `frontend/e2e/permissions/kris-crud.spec.ts`
  - `frontend/e2e/risks.spec.ts`
