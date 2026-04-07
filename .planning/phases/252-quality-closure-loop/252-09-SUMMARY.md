# Plan 252-09 Summary: Full-Green Closeout

## Completed

- Closed the final Phase 252 verification loop after finishing the remaining admin/shell accessibility remediation:
  - added route-scoped admin console contrast tokens for light and dark themes
  - fixed the active sidebar shell state so accessibility no longer depended on theme-specific utility overrides
  - promoted the active sidebar state to explicit CSS classes instead of fragile utility inheritance
- Hardened accessibility debugging by expanding the `accessibility-smoke.spec.ts` attachment payload to include violating node targets and failure summaries.
- Verified that the repo-wide Phase 252 closure areas are now green together:
  - deterministic import/migration safety
  - backend workflow/runtime decomposition waves already landed
  - frontend controller/form/service decomposition waves already landed
  - repo artifact hygiene and contract gates
  - final full-suite closure
- Marked Phase 252 complete in planning metadata.

## Verification

- `python3 scripts/check_docs_contract.py` -> passed
- `make -f scripts/Makefile docs-topology-consistency` -> passed
- `make -f scripts/Makefile quality-repo-contracts` -> `19 passed`
- `make -f scripts/Makefile test` -> `1029 passed, 15 skipped`
- `TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@127.0.0.1:5432/riskhub_test make -f scripts/Makefile test-postgres-ci` -> `11 passed`, `28 passed`
- `cd frontend && npm run lint` -> passed
- `cd frontend && npx tsc --noEmit` -> passed
- `cd frontend && npm run test:run` -> `94 passed`, `314 passed`
- `cd frontend && npm run build && npm run quality:debt -- --report-json && node scripts/quality/validate-debt-budget-report.mjs && npm run cleanup:deadcode && node scripts/cleanup/validate-unreachable-report.mjs && node scripts/quality/validate-no-inline-styles.mjs` -> passed
- `cd frontend && FRONTEND_URL=http://localhost:5173 BACKEND_URL=http://localhost:8000 npx playwright test -c playwright.config.ts --project=chromium --workers=1` -> `219 passed, 41 skipped`

## Notes

- The final Playwright closure used a persistent Vite dev server (`npm run dev -- --host 0.0.0.0`) via `FRONTEND_URL=http://localhost:5173` because the disposable Playwright-managed web server intermittently exited mid-suite and caused transport-only `ERR_CONNECTION_REFUSED` failures. The product code was green once the frontend runtime was held stable.
- Follow-up gap closure after the initial closeout:
  - normalized process-name department planning in `migrate_risks.py` so case-only or whitespace-only workbook variants reuse one logical department
  - restored issue-history refresh on issue reload by keying history fetches off the loaded issue state rather than raw `issueId` only
  - switched reset-mode risk imports to the canonical `generate_risk_id_code(...)` path so reset imports, later non-reset imports, and UI-created risks share one namespace
  - verification:
    - `cd backend && pytest -q ../tests/backend/pytest/test_import_migration_contracts.py` -> `10 passed`
    - `python3 -m py_compile backend/scripts/migrate_risks.py` -> passed
    - `cd frontend && npm run test:run -- src/pages/__tests__/IssueDetailPage.tabs.test.tsx` -> `1 file passed`, `3 tests passed`
    - `cd frontend && npm run lint && npx tsc --noEmit` -> passed
