---
phase: 180-e2e-business-logic
plan: 180-16
status: complete
---

# Summary 180-16: E2E Batch Stabilization and Full Gate Closure

## Final Outcome
- Point 1 (Playwright full-gate blocker) is now closed.
- Full watchdog run completed with a valid artifact set and passing verdict.
- Release readiness criterion for this point moved from blocked to ready.

## Batch Execution Commands
- Chromium batch command:
  - `cd frontend && CI=1 npx playwright test --project=chromium --workers=2 --retries=0 <batch-files>`
- Cross-browser parity command:
  - `cd frontend && CI=1 npx playwright test --project=ci --project=firefox --project=webkit --workers=1 --retries=1 <batch-files>`

## Batch Stabilization Matrix
| Batch | Scope | Chromium run #1 | Chromium run #2 | Parity (ci+firefox+webkit) | Final |
|---|---|---|---|---|---|
| A | auth/navigation baseline | `69 passed, 1 skipped` | `69 passed, 1 skipped` | `207 passed, 3 skipped` | ✅ |
| B | core entity CRUD | `20 passed` | `20 passed` | `60 passed` | ✅ |
| C | permission CRUD group 1 | `13 passed` | `13 passed` | `39 passed` | ✅ |
| D | permission CRUD group 2 | `23 passed` | `23 passed` | `69 passed` | ✅ |
| E | cross-department access | `18 passed, 2 skipped` | `18 passed, 2 skipped` | `54 passed, 6 skipped` | ✅ |
| F | entity ownership | initial fail (fixed), then `9 passed` | `9 passed` | `27 passed` | ✅ |
| G | approval workflows | `16 passed` | `16 passed` | `47 passed, 1 skipped` | ✅ |
| H | activity logging | `3 passed, 18 skipped` | `3 passed, 18 skipped` | `9 passed, 54 skipped` | ✅ |
| I | sensitive fields | `3 passed, 18 skipped` | `3 passed, 18 skipped` | `9 passed, 54 skipped` | ✅ |
| J | admin console | initial fail (fixed), then `4 passed` | `4 passed` | `12 passed` | ✅ |

## Fixes Applied (by classification)
- Runner / harness fixes:
  - `scripts/run_playwright_with_watchdog.sh`
  - Added signal trapping and unified finalize path.
  - Guaranteed artifact persistence and summary writing on all exits.
  - Kept explicit verdict classification (`fail_no_junit`, `fail_no_tests`, `fail_incomplete`).
- Test fixes:
  - `frontend/e2e/entity-ownership/risk-ownership.spec.ts`
  - Replaced unstable fixture assumption with explicit unrelated user login for the ownership visibility assertion.
  - `frontend/e2e/admin.spec.ts`
  - Replaced local login helper with shared retrying helper and added `ensureAdminAccess()` precondition to eliminate intermittent `/login` redirection in long runs.
- App code fixes:
  - None required for closure of this point.

## Full Run Evidence
- Full gate command:
  - `PLAYWRIGHT_RUN_LABEL=full-ci-gate-final-r2 PLAYWRIGHT_TIMEOUT_SECONDS=10800 PLAYWRIGHT_GRACE_SECONDS=60 PLAYWRIGHT_WORKERS=1 PLAYWRIGHT_RETRIES=1 ./scripts/run_playwright_with_watchdog.sh`
- Runtime:
  - `duration_seconds=2183` (36m 23s)
- Result:
  - `process_exit_code=0`
  - `junit_present=1`
  - `tests=868`
  - `expected_tests=868`
  - `failures=0`
  - `errors=0`
  - `skipped=156`
  - `timed_out=0`
  - `signal_received=none`
  - `verdict=pass`
- Artifact paths:
  - `/tmp/riskhub-playwright-watchdog/full-ci-gate-final-r2/summary.txt`
  - `/tmp/riskhub-playwright-watchdog/full-ci-gate-final-r2/playwright.log`
  - `/tmp/riskhub-playwright-watchdog/full-ci-gate-final-r2/junit.xml`
  - `/tmp/riskhub-playwright-watchdog/full-ci-gate-final-r2/results.json`
  - `/tmp/riskhub-playwright-watchdog/full-ci-gate-final-r2/playwright-report`

## Closure Statement
- Previous status: blocked by SIGTERM/no-JUnit in full gate.
- Current status: resolved.
- For plan `180-16`, Point 1 is complete and verified with a green full watchdog gate.
