# Phase 252 Expansion Research Ledger

## Objective

Freeze the repo-wide quality-closure dependency map before the expanded Phase 252 execution waves.

## Findings Map

| Area | Primary files | Existing tests/gates | Gap to close |
|---|---|---|---|
| Data/migration safety | `backend/scripts/migrate_*.py`, `backend/scripts/seed_*.py` | backend pytest broad suite; no deterministic import contract lane | replace destructive/random flows with deterministic command contracts and new focused tests |
| Backend workflow decomposition | `backend/app/api/v1/endpoints/approvals/resolve.py`, `backend/app/api/v1/endpoints/auth/sso.py`, `backend/app/api/v1/endpoints/kris/crud/update.py`, `backend/app/core/scheduler.py`, `backend/app/api/v1/endpoints/dashboard/summary.py`, `backend/app/api/v1/endpoints/reports/unified_exports/export_builders.py` | existing endpoint/service regressions plus broad backend suite | split large orchestration units into thinner commands/services without route/schema drift |
| Frontend decomposition | `frontend/src/pages/KRIsPage.tsx`, `frontend/src/pages/UsersPage.tsx`, `frontend/src/components/VendorForm.tsx`, `frontend/src/components/risk-form/RiskFormContainer.tsx`, `frontend/src/components/control-form/ControlFormContainer.tsx`, `frontend/src/components/kri/KRIModal.tsx`, `frontend/src/components/LinkManagementDialog.tsx`, `frontend/src/pages/DocumentationPage.tsx`, `frontend/src/components/settings/DocumentationSettings.tsx` | frontend unit suite, lint/tsc/build/debt/cleanup gates | extract controllers/hooks/shared modal infrastructure and consolidate duplicated docs UI |
| Repo professionalism | broken `generate_pdf*` utilities, `frontend/public/docs/*.md`, `docs/reference/file_list.txt`, missing README directories | docs topology consistency, repo hygiene tests | remove/quarantine broken and placeholder tracked artifacts and add regression contracts |
| Systemic gates/tests | `.github/workflows/lint.yml`, `.github/workflows/backend-postgres.yml`, `tests/backend/pytest/*`, `tests/frontend/unit/*` | current narrow ratchets, backend broad suite, frontend coverage gate | expand blocking scope, shrink giant tests, and protect retired artifact surfaces |

## Baseline Matrix Before Expansion Patch

- `make -f scripts/Makefile docs-topology-consistency`
  - status: failed
  - cause: missing README coverage for `frontend/src/components/kri-form`, `tests/frontend/unit/src/components/activity-log`, `tests/frontend/unit/src/components/kri-form`
- `python3 -m py_compile scripts/tools/generate_pdf.py`
  - status: failed
  - cause: invalid `placeholder-pdf-033.pdf` call
- `node --check frontend/generate_pdf.js`
  - status: failed
  - cause: invalid `placeholder-pdf-033.pdf` call
- `cd frontend && npm run test:run`
  - status: passed
  - result: `89 files passed`, `305 tests passed`
- `cd frontend && npm run lint && npx tsc --noEmit && npm run build && npm run quality:debt -- --report-json && node scripts/quality/validate-debt-budget-report.mjs && npm run cleanup:deadcode && node scripts/cleanup/validate-unreachable-report.mjs && node scripts/quality/validate-no-inline-styles.mjs`
  - status: failed
  - cause: query-param typing drift in `activityLogApi.ts`, `issuesApi.ts`, and `vendorApi.ts`
- `make -f scripts/Makefile test`
  - status: failed
  - cause: pre-existing backend reds in KRI submission/correction paths plus tracked-ignored-path repo hygiene drift
- Postgres blocking lane
  - status: unavailable locally
  - cause: no listener on `127.0.0.1:55432`
