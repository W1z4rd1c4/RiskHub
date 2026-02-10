# Summary: 04-06 Remove PDF Export Across Reporting

**Status:** Complete  
**Executed:** 2026-02-10

## Deliverables

### Backend Contract Hard Removal
- Updated `backend/app/api/v1/endpoints/reports.py`:
  - restricted unified export `format` to `xlsx|csv`,
  - removed legacy PDF routes:
    - `/api/v1/reports/controls/pdf`
    - `/api/v1/reports/risks/pdf`
    - `/api/v1/reports/summary/pdf`
    - `/api/v1/reports/audit-trail/pdf`
  - added summary Excel endpoint:
    - `/api/v1/reports/summary/excel`
- Updated `backend/app/api/v1/endpoints/vendor_reports.py`:
  - annual vendor report now Excel-only (`format=xlsx`).
- Updated `backend/app/services/report_service.py`:
  - removed all unused PDF generator functions/imports.
- Updated `backend/requirements.txt`:
  - removed `reportlab` dependency.

### Frontend Contract and UX Update
- Updated `frontend/src/components/reports/ExportDialog.tsx`:
  - removed PDF option from export format picker.
- Updated `frontend/src/services/reportApi.ts`:
  - removed PDF-specific API methods,
  - switched dashboard summary export client to Excel.
- Updated pages:
  - `frontend/src/pages/DashboardPage.tsx`
  - `frontend/src/pages/AuditTrailPage.tsx`
  - `frontend/src/pages/VendorReportsPage.tsx`
- Updated `frontend/src/types/vendorReport.ts` to remove `pdf`.

### Test + Docs Reconciliation
- Updated backend tests:
  - `backend/tests/test_reports_rbac.py`
  - `backend/tests/test_vendor_reports.py`
  - `backend/tests/api/v1/test_reports_audit.py`
- Updated E2E page objects/specs:
  - `frontend/e2e/pages/RisksPage.ts`
  - `frontend/e2e/pages/ControlsPage.ts`
  - `frontend/e2e/pages/KRIsPage.ts`
  - `frontend/e2e/pages/VendorsPage.ts`
  - `frontend/e2e/risks.spec.ts`
  - `frontend/e2e/controls.spec.ts`
  - `frontend/e2e/kris.spec.ts`
  - `frontend/e2e/vendors.spec.ts`
- Updated docs/locales for Excel/CSV-only wording:
  - `docs/BUSINESS_LOGIC.md`
  - `docs/admin/reports.md`
  - `docs/admin-cs/reports.md`
  - `docs/user/risks.md`
  - `docs/user/controls.md`
  - `docs/user/kris.md`
  - `docs/user/vendors.md`
  - `docs/user/dashboard.md`
  - `docs/user/faq.md`
  - `frontend/src/i18n/locales/en/common.json`
  - `frontend/src/i18n/locales/cs/common.json`

## Verification Results

1. `cd backend && venv/bin/pytest tests/test_reports_rbac.py tests/test_vendor_reports.py tests/api/v1/test_reports_audit.py -q`  
   Result: `27 passed` (warnings only).

2. `cd frontend && npx tsc --noEmit`  
   Result: `passed`.

3. `cd frontend && npx playwright test e2e/risks.spec.ts e2e/controls.spec.ts e2e/kris.spec.ts e2e/vendors.spec.ts --project=chromium`  
   Result: `19 passed`.

4. Full-suite gate (`make test-e2e`)  
   Result: deferred per user direction to avoid broad reruns before targeted stabilization closes.

## Residual Risks

| Risk | Owner Phase | Impact | Mitigation |
|------|-------------|--------|------------|
| Full E2E suite not rerun after 04-06 | Phase 180 | Non-export unrelated regressions may still exist | Run full `make test-e2e` after outstanding Phase 180 flake backlog is closed |
| Historical docs/plans mention prior PDF support | Phase 4 docs hygiene | Potential confusion in archived historical notes | Keep historical entries but ensure current user/admin docs reflect Excel/CSV-only contract |

