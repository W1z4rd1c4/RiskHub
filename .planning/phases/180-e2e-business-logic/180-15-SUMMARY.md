---
phase: 180-e2e-business-logic
plan: 180-15
status: complete
---

# Summary 180-15: Targeted Verification + Skip Budget + Reconciliation

## Outcome
- Closed all 180-15 checklist items in one pass.
- Used targeted-only Chromium verification for closeout scope (no full-suite rerun).
- Reconciled docs/planning state with current truth from 180-16 full-gate evidence.

## Task 1: Deterministic Preflight Validation
- Confirmed preflight is already implemented and enforced in:
  - `frontend/e2e/setup/global-setup.ts`
  - `frontend/e2e/setup/test-data.ts`
- Runtime proof (all targeted packs): preflight logged successful deterministic fixture verification before test execution.

## Task 2: Targeted Verification and Skip Budget

### Targeted Commands
1. Pack A (critical deterministic coverage):
   - `cd frontend && CI=1 npx playwright test --project=chromium --workers=1 --retries=0 e2e/controls.spec.ts e2e/kris.spec.ts e2e/risks.spec.ts e2e/vendors.spec.ts e2e/permissions/controls-crud.spec.ts e2e/permissions/kris-crud.spec.ts e2e/permissions/risks-crud.spec.ts e2e/permissions/vendors-crud.spec.ts e2e/cross-department/control-owner-access.spec.ts`
2. Pack B (recently fixed surfaces):
   - `cd frontend && CI=1 npx playwright test --project=chromium --workers=1 --retries=0 e2e/admin.spec.ts e2e/entity-ownership/risk-ownership.spec.ts`
3. Pack C (skip-heavy representative suites):
   - `cd frontend && CI=1 npx playwright test --project=chromium --workers=1 --retries=0 e2e/activity-logging/approval-logging.spec.ts e2e/activity-logging/change-tracking.spec.ts e2e/activity-logging/entity-logging.spec.ts e2e/sensitive-fields/risk-sensitive.spec.ts e2e/sensitive-fields/control-sensitive.spec.ts e2e/sensitive-fields/priority-risk-edit.spec.ts e2e/sensitive-fields/null-clearing.spec.ts`

### Pack Results
| Pack | Tests | Passed | Failed | Errors | Skipped | Skip Rate |
|---|---:|---:|---:|---:|---:|---:|
| A | 44 | 44 | 0 | 0 | 0 | 0.00% |
| B | 7 | 7 | 0 | 0 | 0 | 0.00% |
| C | 42 | 6 | 0 | 0 | 36 | 85.71% |
| **Total** | **93** | **57** | **0** | **0** | **36** | **38.71%** |

### Skip Budget (Residual Categories)
- By suite family:
  - `activity-logging`: 18 skips
  - `sensitive-fields`: 18 skips
- By file:
  - `activity-logging/entity-logging.spec.ts`: 7
  - `activity-logging/approval-logging.spec.ts`: 6
  - `activity-logging/change-tracking.spec.ts`: 5
  - `sensitive-fields/priority-risk-edit.spec.ts`: 5
  - `sensitive-fields/risk-sensitive.spec.ts`: 5
  - `sensitive-fields/control-sensitive.spec.ts`: 4
  - `sensitive-fields/null-clearing.spec.ts`: 4

### Baseline vs Current Deltas
- Baseline source: `180-16` targeted matrix + full-gate artifact.
- Pack A vs baseline critical deterministic targeted set:
  - Tests delta: `0` (44 vs 44)
  - Failures delta: `0` (0 vs 0)
- Full-gate baseline (inherited evidence): `868 tests`, `156 skipped`, `0 failures`.
- Current targeted closeout totals are expectedly smaller (`93 tests`) because this closeout intentionally avoids full-suite rerun.

### Artifacts
- Per-pack captured artifacts:
  - `/tmp/riskhub-18015/pack-a.junit.xml`
  - `/tmp/riskhub-18015/pack-a.results.json`
  - `/tmp/riskhub-18015/pack-b.junit.xml`
  - `/tmp/riskhub-18015/pack-b.results.json`
  - `/tmp/riskhub-18015/pack-c.junit.xml`
  - `/tmp/riskhub-18015/pack-c.results.json`
  - `/tmp/riskhub-18015/skip-budget-summary.json`
- Inherited full-gate evidence from 180-16:
  - `/tmp/riskhub-playwright-watchdog/full-ci-gate-final-r2/summary.txt`

## Task 3: Documentation and Planning Reconciliation
- Updated:
  - `180-15-PLAN.md` (targeted-only closeout wording + verification checklist checked)
  - `180-15-SUMMARY.md` (this file, now complete)
  - `.planning/ROADMAP.md` (Phase 180 set to complete and stale blocked note removed)
  - `.planning/STATE.md` (stale blocked status replaced with resolved closeout state)
  - `docs/TESTING.md` (Phase 180 closeout subsection with targeted verification policy)

## Closure Statement
- Full-suite rerun was intentionally not executed for 180-15 per direction.
- 180-15 is complete using targeted verification plus inherited full-gate pass evidence from 180-16.
- Phase 180 is now reconciled and ready in planning metadata.
