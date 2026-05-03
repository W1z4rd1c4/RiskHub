# Phase 254.01 Summary: Architecture Deepening

## Completed

- Centralized shared frontend collection lifecycle state in `frontend/src/pages/shared/collectionPageState.ts` and updated risks, controls, KRIs, vendors, and issues page hooks to delegate shared loading/reset/export behavior.
- Moved issue register grouping and linked-context helpers into `backend/app/services/_issue_register/`, leaving issue HTTP list routes as adapters.
- Added `backend/app/services/_vendor_links/` as the shared vendor link workflow for risk, control, and KRI targets.
- Added `backend/app/services/_orphaned_items/resolution_plan.py` so dry-run and apply paths share resolution requirements.
- Added `backend/app/services/_kri_history/intake.py` for KRI value intake routing between direct recording and approval-gated submission.
- Added questionnaire workflow state helper `frontend/src/components/risks/risk-questionnaire-detail/questionnaireWorkflowState.ts`.
- Added `backend/app/services/_admin_telemetry/` for admin telemetry projections.
- Refreshed all seven `.planning/codebase/` map files and reconciled authorization/docs topology contracts.

## Verification

- Baseline targeted suites before edits passed:
  - Backend issue/vendor/orphan group: `47 passed`
  - Backend KRI/questionnaire group: `45 passed, 1 skipped`
  - Backend report/admin group: `48 passed`
  - Frontend collection/linking group: `25 passed`
  - Frontend orphan/questionnaire/admin group: `15 passed`
  - `cd frontend && npx tsc --noEmit` -> passed
- TDD/targeted post-change suites passed:
  - Backend architecture group: `52 passed`
  - Backend KRI/questionnaire/report/admin group: `95 passed, 1 skipped`
  - Frontend collection/linking/orphan/questionnaire/admin group: `43 passed`
- Final gates:
  - `make -f scripts/Makefile test` -> `1476 passed, 17 skipped, 6 deselected`
  - `cd frontend && npm run test:run` -> `134 files passed`, `615 tests passed`
  - `cd frontend && npx tsc --noEmit && npm run lint` -> passed
  - `python3 scripts/security/validate_authz_capability_contract.py` -> passed
  - `python3 scripts/check_docs_contract.py && make -f scripts/Makefile docs-topology-consistency` -> passed

## Limitation

- Postgres gate was attempted with `TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test make -f scripts/Makefile test-postgres-ci`, but local PostgreSQL rejected the configured role with `FATAL: role "riskhub" does not exist`; no Postgres test assertions ran.
