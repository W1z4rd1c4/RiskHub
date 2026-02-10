---
phase: 180-e2e-business-logic
plan: 180-16
status: in_progress
---

# Summary 180-16: Hardening Closure Gate and Release-Readiness Matrix

## Outcome
- Performed closure-first gate verification across backend, frontend static checks, and targeted critical E2E.
- Targeted critical E2E is green (`44/44`, chromium).
- Full multi-project Playwright gate is still blocked by CI runner instability (SIGTERM + missing JUnit artifact), so release remains **not ready** without waiver.

## Baseline Lock
- Branch: `main`
- Verified recent baseline commits referenced for hardening wave:
  - `d81f485`
  - `7117f3d`
  - `96ed5bb`
  - `d6c73ec`
  - `3c54688`

## Verification Matrix
| Gate | Command | Result | Verdict |
|---|---|---|---|
| Backend regression | `make test` | `446 passed, 7 skipped` | ✅ Pass |
| Postgres marker gate | `cd backend && pytest -m postgres -v` | `4 skipped, 449 deselected, 0 failed` | ✅ Pass |
| Frontend type safety | `cd frontend && npx tsc --noEmit` | Passed | ✅ Pass |
| Frontend lint | `cd frontend && npx eslint .` | `0 errors, 16 warnings` | ✅ Pass (warning debt unchanged) |
| Targeted critical E2E | `cd frontend && npx playwright test e2e/controls.spec.ts e2e/kris.spec.ts e2e/risks.spec.ts e2e/vendors.spec.ts e2e/permissions/controls-crud.spec.ts e2e/permissions/kris-crud.spec.ts e2e/permissions/risks-crud.spec.ts e2e/permissions/vendors-crud.spec.ts e2e/cross-department/control-owner-access.spec.ts --project=chromium` | `44 passed` | ✅ Pass |
| Full E2E (watchdog) | `PLAYWRIGHT_RUN_LABEL=full-ci-gate-heartbeat-2 PLAYWRIGHT_TIMEOUT_SECONDS=600 PLAYWRIGHT_GRACE_SECONDS=45 PLAYWRIGHT_WORKERS=2 ./scripts/run_playwright_with_watchdog.sh` | `process_exit_code=143`, `verdict=fail_no_junit`, `expected_tests=864`, `tests=0` | ❌ Blocked (env/runner) |

## Reliability Classification
- `test-flake`: Previously observed targeted failures in controls/KRI flows were not reproducible in rerun (`44/44` pass), indicating transient flake/order effects rather than deterministic regression.
- `app regression`: No deterministic app regression confirmed in targeted critical scope.
- `env issue` (blocking): Full multi-project CI Playwright run is terminated by SIGTERM before JUnit emission; this prevents deterministic full-gate closure.

## Lint Warning Debt (Pinned)
- Baseline: `16` warnings (`react-hooks/exhaustive-deps` + `@typescript-eslint/no-explicit-any`).
- Policy applied: no warning growth allowed; baseline preserved.
- Closure decision: defer warning elimination as tracked debt under Phase `180-15` closeout.
- Ownership/default:
  - Frontend architecture owner: hook dependency warnings.
  - Frontend platform owner: explicit `any` removals.

## Risks and Rollback
- Current release risk: full-suite E2E verdict unavailable due runner termination in CI mode.
- Rollback note: no behavior-changing rollback required for this closure pass; remove `scripts/run_playwright_with_watchdog.sh` only if reverting watchdog-based full-gate strategy.

## Follow-up Work (Required to Mark Release Ready)
1. Fix Playwright CI runner termination path (SIGTERM/no-JUnit) and prove stability on full `npx playwright test`.
2. Re-run full gate matrix with watchdog artifacts and capture green verdict.
3. Burn down 16-warning lint debt or explicitly approve deferred debt with dated owner commitments in phase docs.
