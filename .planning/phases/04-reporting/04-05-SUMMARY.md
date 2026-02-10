# Summary: 04-05 Export Regression, Docs Reconciliation, and Phase-State Closeout

**Status:** Complete  
**Executed:** 2026-02-10

## Deliverables

### Backend Verification Coverage Extension
- Updated `backend/tests/test_reports_rbac.py` to:
  - validate unified KRI/vendor export endpoints across `pdf|xlsx|csv`,
  - validate vendor `as_of_date` replay behavior for status transitions.
- Re-ran report/security-oriented backend suites for export behavior.

### E2E Contract Reconciliation for Unified Export UX
- Updated page objects:
  - `frontend/e2e/pages/RisksPage.ts`
  - `frontend/e2e/pages/ControlsPage.ts`
  - `frontend/e2e/pages/KRIsPage.ts`
  - `frontend/e2e/pages/VendorsPage.ts`
- Updated list-page specs:
  - `frontend/e2e/risks.spec.ts`
  - `frontend/e2e/controls.spec.ts`
  - `frontend/e2e/kris.spec.ts`
  - `frontend/e2e/vendors.spec.ts`
- Assertions now cover:
  - single export button presence,
  - export modal default date behavior,
  - modal format selection (`csv` path),
  - successful request/close flow.

### Documentation Reconciliation
- Updated user/business docs to match delivered export UX and scope semantics:
  - `docs/BUSINESS_LOGIC.md`
  - `docs/user/README.md`
  - `docs/user/risks.md`
  - `docs/user/controls.md`
  - `docs/user/kris.md`
  - `docs/user/vendors.md` (added)

## Verification Results

1. `cd backend && venv/bin/pytest tests/test_reports_rbac.py tests/test_vendor_reports.py -q`  
   Result: `19 passed` (warnings only, no failures)
2. `cd frontend && npx tsc --noEmit`  
   Result: `passed`
3. `cd frontend && npx playwright test e2e/risks.spec.ts e2e/controls.spec.ts e2e/kris.spec.ts e2e/vendors.spec.ts --project=chromium`  
   Result: `19 passed`
4. `cd  && make test-e2e`  
   Result: **not run** (explicitly deferred per user instruction to stop full-suite reruns)

## Residual Risks and Ownership

| Risk | Owner Phase | Impact | Mitigation |
|------|-------------|--------|------------|
| Full E2E suite not revalidated after 04-05 changes | Phase 180 | Possible unrelated regressions outside targeted export specs remain undetected | Run `make test-e2e` after current flake backlog is cleared |
| Legacy export route usage still present in clients outside current UI | Phase 4/consumer integrations | Duplicate surface area and long-term maintenance cost | Track endpoint usage and start deprecation cycle |

## Recommendation: Legacy Risk/Control Export Endpoints

Recommended path:
1. Keep legacy `GET /api/v1/reports/risks/pdf|excel` and `.../controls/pdf|excel` for one transition window.
2. Mark them as deprecated in API docs/changelog and log call telemetry.
3. Remove after consumer migration to unified `/export` endpoints is confirmed.
