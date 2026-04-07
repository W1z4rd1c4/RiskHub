# Plan 252-10 Summary: Repo Professionalism and Artifact Hygiene

## Completed

- Expanded Phase 252 planning/state/context to the broader five-area professional-quality closure scope.
- Added a Phase 252 research ledger capturing the repo-wide dependency map and pre-change baseline.
- Removed broken checked-in PDF helper utilities from tracked source:
  - `scripts/tools/generate_pdf.py`
  - `scripts/tools/generate_pdf.js`
  - `frontend/generate_pdf.js`
- Retired placeholder static docs under `frontend/public/docs/` and kept only a README pointing to canonical docs.
- Removed `docs/reference/file_list.txt` from tracked source and updated reference docs to treat archive inventories as generated artifacts.
- Added missing README coverage for:
  - `frontend/src/components/kri-form/`
  - `tests/frontend/unit/src/components/activity-log/`
  - `tests/frontend/unit/src/components/kri-form/`
- Added a repo hygiene contract preventing the retired artifact surfaces from being reintroduced.
- Fixed the stricter frontend query-param typing regressions in `activityLogApi.ts`, `issuesApi.ts`, and `vendorApi.ts`.

## Verification

- `make -f scripts/Makefile docs-topology-consistency`
- `bash -n scripts/install.sh scripts/compose.sh scripts/dev.sh scripts/deploy.sh`
- `python3 -m py_compile backend/scripts/migrate_controls.py backend/scripts/migrate_kris.py backend/scripts/migrate_risks.py backend/scripts/seed_users.py backend/scripts/seed_demo.py`
- `cd frontend && npm run test:run`
- `cd frontend && npm run lint && npx tsc --noEmit && npm run build && npm run quality:debt -- --report-json && node scripts/quality/validate-debt-budget-report.mjs && npm run cleanup:deadcode && node scripts/cleanup/validate-unreachable-report.mjs && node scripts/quality/validate-no-inline-styles.mjs`

## Notes

- The expansion baseline intentionally recorded the pre-patch failures from the retired PDF helper utilities before removing them.
- Postgres blocking verification remains part of the broader Phase 252 closeout, not this artifact-hygiene wave.
