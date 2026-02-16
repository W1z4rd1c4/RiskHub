# Project State: RiskHub

## Project Summary

**Building:** Enterprise risk management platform for insurance companies with control catalogs, dashboards, and AD integration.

**Core requirements:**

- Control catalog with 13-point data structure
- Role-based access via Active Directory/Entra ID
- Real-time dashboards for executives and departments

**Constraints:**

- React + Python FastAPI stack
- On-premise deployment (Docker/K8s)
- English default with Czech language option

## Current Position

**Milestone:** v1.0 MVP
**Active Phases:** Multiple in progress (see Progress Summary)
**Documentation Status:** Reconciled with phase folders (2026-01-24)

## Progress Summary

| Phase | Status | Completed |
|-------|--------|-----------|
| 1-3 + 5 Foundation/Catalog/Dashboards/Testing | ✅ Complete | 2025-12-25 |
| 4 Reporting | ✅ Complete (6/6) | 2026-02-10 |
| 6-6.1 Risk Appetite & KRI | ✅ Complete (3/3) | - |
| 7 User Management | ✅ Complete (17/17) | - |
| 8 Permission Filtering | ✅ Complete (8/8) | 2025-12-28 |
| 9 Notification System | ✅ Complete (7/7) | 2025-12-28 |
| 10 Historization | ✅ Complete (5/5) | 2026-02-11 |
| 11 Historical Visualization | ✅ Complete (5/5) | 2026-02-11 |
| 12 Compliance Governance | ✅ Complete (7/7) | 2026-01-04 |
| 12.1 Compliance Review | ✅ Complete (10/10) | 2026-01-04 |
| 13 Issue & Remediation Management | ✅ Complete (8/8) | 2026-02-12 |
| 14 Risk Assessments | ✅ Complete (7/7) | 2026-01-24 |
| 15 Settings Page | ✅ Complete (5/5) | 2026-01-07 |
| 16 Risk Assessment Polish | ✅ Complete (3/3) | 2026-01-24 |
| 17 Production Deploy | ⏳ In progress (9/15) | - |
| 18 Vendor Risk Management | ✅ Complete (12/12) | 2026-01-26 |
| 20 Czech Localization | ✅ Complete (16/12) | - |
| 25 User Settings | ✅ Complete (5/5) | 2026-01-11 |
| 70 Risk Hub | ⏳ In progress (8/12) | - |
| 71 Risk Hub Review | ✅ Complete (3/3) | 2026-01-03 |
| 72 Risk Hub Resolution | ✅ Complete (12/12) | 2026-01-05 |
| 85 Workflow & Users | ✅ Complete (6/6) | 2026-01-01 |
| 90 AD Emulator | ⏳ In progress (2/3) | - |
| 90 AD Integration | ⏳ In progress (11/12) | - |
| 99 Data Migration | ✅ Complete (8/8) | 2026-01-04 |
| 100 Marketing | ✅ Complete (3/3) | 2025-12-29 |
| 150 Audit | ⏳ In progress (8/11) | - |
| 151 Audit Resolution | ✅ Complete (19/19) | 2026-01-10 |
| 152 Audit Resolution 2 | ✅ Complete (8/8) | 2026-01-10 |
| 153 Audit Resolution 3 | ✅ Complete (12/12) | 2026-01-10 |
| 154 Workflow Bug Sweep | ✅ Complete (5/5) | 2026-01-14 |
| 156 Audit | ⏳ In progress (1/8) | - |
| 156.1 Admin Role & RBAC Hardening | ✅ Complete (5/5) | 2026-02-11 |
| 157 Business Logic Compliance | ✅ Complete (6/6) | 2026-01-22 |
| 158 Audit | ✅ Complete (10/10) | 2026-01-19 |
| 159 Audit Fixes | ✅ Complete (10/10) | 2026-01-23 |
| 179 E2E Test Data | ✅ Complete (17/17) | 2026-02-11 |
| 180 E2E Business Logic | ✅ Complete (15/15) | 2026-02-11 |
| 200 Entity Naming | ✅ Complete (10/10) | 2026-02-11 |
| 201 Archived Visibility + Restore | ✅ Complete (5/5) | 2026-02-15 |
| 250 Spaghetti Simplification | ✅ Complete (10/10) | 2026-01-10 |
| 251 Spaghetti Simplification 2 | ✅ Complete (11/11) | 2026-01-10 |

## Session Context

### Phase 13 Execution (2026-02-11)

- ✅ Executed full Phase 13 wave order (`13-01` → `13-02` → `13-03`) and delivered backend, frontend, dashboard, and reporting scope.
- Delivered issue lifecycle backend with scoped RBAC (`issues:read|write|approve`), workflow state machine, notifications, scheduler integration, dashboard metrics, and issue export endpoint.
- Added frontend issue management surface (`/issues`) with workflow actions, sidebar/route wiring, dashboard issue widgets, and issue export action.
- Verification:
  - `cd backend && pytest -q tests/api/v1/test_issue_workflow.py tests/test_issue_deadline_service.py tests/api/v1/test_dashboard_issue_metrics.py tests/api/v1/test_reports_issues.py` → `13 passed`
  - `cd backend && python3 -m compileall app` → passed
  - `cd frontend && npx tsc --noEmit` → passed
  - `cd frontend && npx playwright test -g \"issues workflow\"` → `4 passed`
- Added execution summaries:
  - `.planning/phases/13-issue-remediation-management/13-01-SUMMARY.md`
  - `.planning/phases/13-issue-remediation-management/13-02-SUMMARY.md`
  - `.planning/phases/13-issue-remediation-management/13-03-SUMMARY.md`

### Phase 13 Reopen Planning (2026-02-12)

- Reopened Phase 13 for simplification follow-up while preserving completed baseline work (`13-01..13-03`).
- Added planning artifacts:
  - `.planning/phases/13-issue-remediation-management/13-CONTEXT.md`
  - `.planning/phases/13-issue-remediation-management/13-PLAN.md`
  - `.planning/phases/13-issue-remediation-management/13-04-PLAN.md`
  - `.planning/phases/13-issue-remediation-management/13-05-PLAN.md`
  - `.planning/phases/13-issue-remediation-management/13-06-PLAN.md`
  - `.planning/phases/13-issue-remediation-management/13-07-PLAN.md`
  - `.planning/phases/13-issue-remediation-management/13-08-PLAN.md`
  - `.planning/phases/13-issue-remediation-management/13-FOLLOWUPS.md`
- Locked reopen scope:
  - contextual create from Risk/Control/KRI/Vendor detail pages
  - direct vendor linking via `IssueLink.vendor_id`
  - workflow state-machine unchanged (UX simplification only)
- Planning metadata reconciled to in-progress status (`3/8`) pending execution of `13-04..13-08`.

### Phase 13 Reopen Execution (2026-02-12)

- ✅ Executed reopen wave order:
  - Wave 1: `13-04` backend contextual create + vendor direct linking
  - Wave 2: `13-05` reusable frontend quick-create modal + API/type support
  - Wave 3: `13-06` detail-page entry points + `13-07` simplified workflow UX
  - Wave 4: `13-08` regression matrix, docs reconciliation, and re-closeout
- Backend delivery highlights:
  - Added `IssueLink.vendor_id` with migration `13e6f7a8b9c0_extend_issue_links_with_vendor_context.py`.
  - Added `POST /api/v1/issues/contextual` and `GET /api/v1/issues?linked_vendor_id=...`.
  - Added vendor-department fallback (vendor dept -> owner dept) with explicit `409` when unresolved.
- Frontend delivery highlights:
  - Added `IssueQuickCreateModal` and `issuesApi.createContextual(...)`.
  - Added contextual “New Issue” actions on Risk/Control/KRI/Vendor detail pages.
  - Added contextual E2E path: `frontend/e2e/issues-contextual-create.spec.ts`.
  - Simplified issue workflow tab with guided next-step messaging and collapsible advanced progress fields.
- Verification:
  - `cd backend && pytest -q tests/api/v1/test_issues_api.py tests/api/v1/test_issue_workflow.py` → `33 passed`
  - `cd backend && python3 -m compileall app` → passed
  - `cd frontend && npx tsc --noEmit` → passed
  - `cd frontend && npm run test:run -- IssueQuickCreateModal RiskDetailPage.issue-entry ControlDetailPage.issue-entry KRIDetailPage.issue-entry VendorDetailPage.issue-entry IssuesPage IssueNewPage IssueDetailPage RemediationPlanCard.workflow-visibility` → `20 passed`
  - `cd frontend && npx playwright test -g "issues contextual create"` → `4 passed`
- Added reopen execution summaries:
  - `.planning/phases/13-issue-remediation-management/13-04-SUMMARY.md`
  - `.planning/phases/13-issue-remediation-management/13-05-SUMMARY.md`
  - `.planning/phases/13-issue-remediation-management/13-06-SUMMARY.md`
  - `.planning/phases/13-issue-remediation-management/13-07-SUMMARY.md`
  - `.planning/phases/13-issue-remediation-management/13-08-SUMMARY.md`
- Phase 13 returned to complete state (`8/8`).

### Planning Hygiene (2026-02-02)

- Backfilled missing summaries for executed plans: `02-03`, `2.2`, `03.1-01`, `06-02`, `07-07`, `07-10`, `07-11`, `07-12`.
- Reconciled `.planning/ROADMAP.md` and `.planning/STATE.md` to reflect these as complete.

### Phase 4 Extension Planning (2026-02-10)

- Reopened Phase 4 (`04-reporting`) to extend exports beyond legacy risk/control PDF+Excel.
- Added execution plans:
  - `04-03`: Unified backend export contract for risks/controls/kris/vendors with pdf/xlsx/csv and as-of date snapshots.
  - `04-04`: Single export button and shared export modal across Risks/Controls/KRIs/Vendors list pages.
  - `04-05`: Regression verification, docs reconciliation, and planning-state closeout.
  - `04-06`: Hard removal of PDF export format across reporting surfaces (UI + API + docs/tests).

### Phase 4 Execution (2026-02-10)

- ✅ **04-03**: Unified backend export contract implemented.
  - Added new endpoints:
    - `GET /api/v1/reports/risks/export`
    - `GET /api/v1/reports/controls/export`
    - `GET /api/v1/reports/kris/export`
    - `GET /api/v1/reports/vendors/export`
  - Supported `format=pdf|xlsx|csv` and `as_of_date=YYYY-MM-DD` across all four entity exports.
  - Added snapshot replay service for point-in-time reconstruction:
    - `backend/app/services/export_snapshot_service.py`
  - Preserved legacy compatibility:
    - `GET /api/v1/reports/risks/pdf|excel`
    - `GET /api/v1/reports/controls/pdf|excel`
  - Added/updated backend tests for unified export matrix, scoping, and as-of behavior:
    - `backend/tests/test_reports_rbac.py`
  - Verification:
    - `backend/tests/test_reports_rbac.py` → `16 passed`
    - `backend/tests/test_vendor_reports.py`, `backend/tests/test_kris_rbac.py`, `backend/tests/test_vendors.py`, `backend/tests/api/v1/test_reports_audit.py` → `28 passed`

- ✅ **04-04**: Single export button + shared modal implemented on Risks/Controls/KRIs/Vendors.
  - Added reusable modal:
    - `frontend/src/components/reports/ExportDialog.tsx`
  - Added unified frontend API methods:
    - `reportApi.exportRisks`, `reportApi.exportControls`, `reportApi.exportKRIs`, `reportApi.exportVendors`
  - Replaced split PDF/Excel header actions with one modal-driven export flow on:
    - `frontend/src/pages/RisksPage.tsx`
    - `frontend/src/pages/ControlsPage.tsx`
    - `frontend/src/pages/KRIsPage.tsx`
    - `frontend/src/pages/VendorsPage.tsx`
  - Added EN/CS localization keys for shared export modal and page export labels.
  - Verification:
    - `cd frontend && npx tsc --noEmit` → `passed`
    - `cd frontend && npm run test:run -- src/pages/__tests__` → `3 files passed, 34 tests passed`
- ✅ **04-05**: Regression verification + docs/state reconciliation completed.
  - Extended backend export RBAC tests for full format matrix and vendor as-of replay behavior.
  - Updated E2E page objects/specs for modal-driven single-export flow assertions.
  - Added user docs for vendors and reconciled export guidance across risks/controls/kris/vendors.
  - Verification:
    - `cd backend && venv/bin/pytest tests/test_reports_rbac.py tests/test_vendor_reports.py -q` → `19 passed`
    - `cd frontend && npx tsc --noEmit` → `passed`
    - `cd frontend && npx playwright test e2e/risks.spec.ts e2e/controls.spec.ts e2e/kris.spec.ts e2e/vendors.spec.ts --project=chromium` → `19 passed`
  - Full-suite gate (`make test-e2e`) intentionally deferred per user direction to stop broad reruns.
- ✅ **04-06**: PDF export format removed across reporting surfaces.
  - Unified list exports now support `xlsx|csv` only.
  - Removed report endpoints:
    - `/api/v1/reports/controls/pdf`
    - `/api/v1/reports/risks/pdf`
    - `/api/v1/reports/summary/pdf`
    - `/api/v1/reports/audit-trail/pdf`
  - Added/replaced summary endpoint:
    - `/api/v1/reports/summary/excel`
  - Restricted vendor annual report to Excel-only (`format=xlsx`).
  - Updated export dialog and E2E contracts to assert PDF absence.
  - Verification:
    - `cd backend && venv/bin/pytest tests/test_reports_rbac.py tests/test_vendor_reports.py tests/api/v1/test_reports_audit.py -q` → `27 passed`
    - `cd frontend && npx tsc --noEmit` → `passed`
    - `cd frontend && npx playwright test e2e/risks.spec.ts e2e/controls.spec.ts e2e/kris.spec.ts e2e/vendors.spec.ts --project=chromium` → `19 passed`
    - Full-suite gate (`make test-e2e`) deferred by user preference (targeted reruns first).

### Hardening Closure Pass (2026-02-11)

- Verified baseline lock references on `main` and recorded release gate execution in
  `.planning/phases/180-e2e-business-logic/180-16-SUMMARY.md`.
- Gate results:
  - `make test` → `446 passed, 7 skipped` (green)
  - `cd backend && pytest -m postgres -v` → `0 failed` (`4 skipped, 449 deselected`)
  - `cd frontend && npx tsc --noEmit` → passed
  - `cd frontend && npx eslint .` → `0 errors, 16 warnings` (warning baseline unchanged)
  - Targeted critical Playwright suite (controls/kris/risks/vendors + permissions + cross-department control-owner) → `44 passed` (green)
- Full gate blocker is resolved:
  - Watchdog full run completed successfully (`process_exit_code=0`, `junit_present=1`, `tests=868`, `failures=0`, `verdict=pass`).
  - Artifact of record: `/tmp/riskhub-playwright-watchdog/full-ci-gate-final-r2/summary.txt`.
- Completed 180-15 targeted closeout (no full rerun by direction):
  - Pack A/B/C targeted verification totals: `93 tests`, `57 passed`, `36 skipped`, `0 failed`.
  - Skip-budget artifact: `/tmp/riskhub-18015/skip-budget-summary.json`.

### Phase 156.1 Planning (2026-02-11)

- Inserted phase `156.1` (`admin-role-rbac-hardening`) after Phase 156 for urgent authorization and contract fixes discovered during deep admin-role review.
- Added decision-complete plan set under:
  - `.planning/phases/156.1-admin-role-rbac-hardening/156.1-01-PLAN.md`
  - `.planning/phases/156.1-admin-role-rbac-hardening/156.1-02-PLAN.md`
  - `.planning/phases/156.1-admin-role-rbac-hardening/156.1-03-PLAN.md`
  - `.planning/phases/156.1-admin-role-rbac-hardening/156.1-04-PLAN.md`
  - `.planning/phases/156.1-admin-role-rbac-hardening/156.1-05-PLAN.md`
- Captured scoped research and issue evidence in:
  - `.planning/phases/156.1-admin-role-rbac-hardening/156.1-RESEARCH.md`
  - `.planning/phases/156.1-admin-role-rbac-hardening/156.1-CONTEXT.md`

### Phase 156.1 Execution (2026-02-11)

- ✅ Executed all 5 plans in wave order and produced summaries:
  - `.planning/phases/156.1-admin-role-rbac-hardening/156.1-01-SUMMARY.md`
  - `.planning/phases/156.1-admin-role-rbac-hardening/156.1-02-SUMMARY.md`
  - `.planning/phases/156.1-admin-role-rbac-hardening/156.1-03-SUMMARY.md`
  - `.planning/phases/156.1-admin-role-rbac-hardening/156.1-04-SUMMARY.md`
  - `.planning/phases/156.1-admin-role-rbac-hardening/156.1-05-SUMMARY.md`
- Closed access-management mutation gap by enforcing admin/CRO-only writes on `PATCH /api/v1/access/users/{id}`.
- Split frontend access read-vs-edit capabilities (`canManageAccess` vs `canEditAccessUsers`) to mirror backend authorization.
- Aligned admin log-config API contract to canonical app/audit fields, with deterministic legacy compatibility shim and mixed-payload rejection.
- Converged legacy RBAC seed entrypoint and test/mock fixtures toward canonical contract, with explicit wildcard fixture naming.
- Reconciled business/admin docs to reflect platform-admin boundaries and canonical log-config contract.
- Added/updated verification artifacts:
  - `.planning/phases/156.1-admin-role-rbac-hardening/156.1-VERIFICATION.md`
- Verification matrix (all green):
  - `cd backend && venv/bin/pytest tests/test_access_management.py tests/test_admin_logs.py -q` → `19 passed`
  - `cd frontend && npx tsc --noEmit` → `passed`
  - `cd frontend && npm run test:run -- src/pages/__tests__/rbac_gating.test.tsx` → `10 passed`
  - `cd frontend && npx playwright test e2e/admin.spec.ts --project=chromium` → `4 passed`

### Phase 10 Closeout Reconciliation (2026-02-11)

- Closed `10-05` as completed-by-reconciliation (superseded implementation), since KRI value recording + breach detection already exists in:
  - `POST /api/v1/kris/{kri_id}/values`
  - `app.services.kri_history_service.record_value(...)`
  - existing backend tests for historization and KRI value submission/notifications.
- Added closeout summary:
  - `.planning/phases/10-historization/10-05-SUMMARY.md`
- Reconciled planning metadata:
  - `.planning/ROADMAP.md` → Phase 10 `5/5` complete
  - `.planning/STATE.md` → Phase 10 `5/5` complete

### Phase 11 Closeout Reconciliation (2026-02-11)

- Closed `11-04` as completed-by-reconciliation (already implemented), since dashboard historical widgets were already present in:
  - `GET /api/v1/dashboard/risk-trends`
  - `GET /api/v1/dashboard/kri-breach-trends`
  - dashboard wiring/rendering for `RiskTrendChart` + `KRIBreachHistoryChart`.
- Verification run at closeout:
  - `cd backend && pytest tests/api/v1/test_dashboard_history.py -v` → `3 passed`
  - `cd frontend && npx tsc --noEmit` → `passed`
- Added closeout summary:
  - `.planning/phases/11-historical-visualization/11-04-SUMMARY.md`
- Reconciled planning metadata:
  - `.planning/ROADMAP.md` → Phase 11 `5/5` complete
  - `.planning/STATE.md` → Phase 11 `5/5` complete

### Phase 17 Progress

- ✅ **17-04**: E2E Regression Suite (Playwright, full coverage)
- ✅ **17-05**: Performance & Load Testing
  - Verified system performance for 30 users (5 concurrent sessions)
  - All API endpoints meet targets (<500ms dashboard, <200ms CRUD)
  - No slow queries (>100ms) detected under load
  - Created `docs/PERFORMANCE_BASELINE.md`

### Phase 11 Progress

- ✅ **11-01**: History components (HistoryTimeline, HistoryTrendChart, HistoryChangeCard)
- ✅ **11-02**: KRI detail page integration with history visualization
- ✅ **11-03**: HistoryComparisonPanel for side-by-side KRI value comparison
- ✅ **11-04**: Dashboard widgets (RiskTrendChart, KRIBreachHistoryChart)
- ✅ **11-05**: Audit trail PDF/Excel exports with RBAC + filters

### Recent Enhancements (2025-12-31)

- **Linked Risk Card Redesign**: Expanded KRI detail page risk card to full-width with process, description, department, and owner details
- **Department Breaching KRI Badge**: Added amber "BREACHED" count badge to department cards for KRIs outside limits
- **Audit Trail Exports**: PDF/Excel downloads from Audit Trail page with result filtering

### Phase 85 Progress

- ✅ **85-01**: User access map (roles x tabs, backend + frontend gating)
- ✅ **85-02**: Backend access management model + APIs (access scope, access endpoints)
- ✅ **85-03**: Frontend access management UI (types, API client, PermissionMatrix, AccessEditModal, UsersPage upgrade)
- ✅ **85-04**: KRI workflow improvements (weekly reminders, CRO due-soon visibility, all-edit approvals)
- ✅ **85-05**: Owner-based KRI permissions (tiered approval with Risk Owner)
- ✅ **85-06**: Control owner edit permissions (Control Owner edits → Risk Owner approval)

### Phase 12 Progress

- ✅ **12-01**: Activity Log Backend (model, API, tampering protection)
- ✅ **12-02**: Activity Log Frontend (new tab with filters and search)
- ✅ **12-03**: Dashboard Risk Committee (executive summary, meeting mode)
- ✅ **12-05**: Backend Structured Logging
  - Configured structlog with JSON rendering for SIEM compatibility
  - Created LoggingContextMiddleware for request_id/user_id/client_ip injection
  - Added audit event emission to ActivityLog for double-write pattern
  - Implemented /admin/logs/recent endpoint for Admin Console
- ✅ **12-06**: Audit Log Separation & Rotation
  - Implemented dual file handlers (app vs audit) with strict filtering
  - Added admin-configurable log rotation settings (size/count) via Risk Hub
  - Created /admin/logs/audit and /admin/logs/config endpoints

### Phase 12.1 Progress

- ✅ **12.1-06**: Risk Committee access control remediation (dept head access scoped; admin console-only)
- ✅ **12.1-07**: Activity Log backend remediation (schema contract, diffs, governance logging, integrity, tests)
- ✅ **12.1-08**: Activity Log frontend remediation (permission gating, admin-console-only, view modes, diff rendering, tests)
- ✅ **12.1-09**: Risk Committee metrics remediation (quarter boundaries, historical snapshots, frontend hardening)
- ✅ **12.1-10**: SIEM & Logging remediation (admin endpoints, middleware fix, rotation config, verification tooling)

### Phase 72 Progress

- ✅ **72-01**: Backend risk type integration + risk count accuracy
- ✅ **72-02**: Global config thresholds + notification settings integration
- ✅ **72-03**: Cross-department Owner Access + Notification Fan-out
- ✅ **72-04**: Risk Hub CRUD hardening + public-config gating
- ✅ **72-05**: Frontend alignment with Risk Hub config (risk types, thresholds, approvals)
- ✅ **72-06**: Granular permissions for KRI submission + execution logging (`kri:submit`, `controls:execute`)
- ⏳ **72-07**: Full-modality permission independence + documentation reconciliation
- ⏳ **72-08**: Full-modality cleanup (RBAC enforcement, migration convergence, repo hygiene)
- ✅ **72-09**: Backend threshold propagation cleanup (reports + approvals)
- ✅ **72-10**: Public endpoints for thresholds + risk types (non-CRO)
- ✅ **72-11**: Frontend public-config consumption + dynamic type display
- ✅ **72-12**: Naming cleanup for approval threshold helpers (`is_critical_risk_*` semantics)

### Phase 99 Progress

- ✅ **99-01**: Migrated 83 risks from placeholder-risk-register.xlsx
- ✅ **99-02**: Migrated 21 controls with 62 risk links
- ✅ **99-03**: Migrated 67 KRIs with risk matching
- ✅ **99-04**: AD Emulator standalone backend (Done)
- ✅ **99-05**: AD Emulator standalone frontend (Done)
- ✅ **99-06**: RiskHub integration with external AD Emulator (Done)
- ✅ **99-08**: Risk naming improvement from descriptions (Done)

### Key Decisions

| Decision | Choice | Date |
|----------|--------|------|
| Tech Stack | React + FastAPI + PostgreSQL | 2025-12-25 |
| Auth | JWT tokens (Azure AD deferred) | 2025-12-26 |
| UI Style | Glassmorphism + Mesh Gradients | 2025-12-25 |
| Approval Workflow | Delete + Edit approvals for non-privileged | 2025-12-27 |
| Scheduler | APScheduler (in-process) | 2025-12-28 |
| AD Emulator | Standalone app (port 8001/5174) | 2025-12-28 |
| Privileged Model | Access scope enum (global/department/manager) | 2025-12-31 |
| KRI Reporting Periods | Calendar-aligned periods (daily/weekly/monthly/quarterly/annual) | 2025-12-31 |
| Activity Log Search | Default-window ILIKE with changes search (90-day default) | 2026-01-04 |
| Activity Log Logging | Write in same transaction as business change (fail if logging fails) | 2026-01-04 |
| Admin Activity Log Access | Admin console-only (explicitly blocked from activity_log:read) | 2026-01-04 |
| Activity Log View Modes | Implemented (Chronological, By Person, By Department, By Risk) | 2026-01-04 |
| Quarterly Metric Semantics | Historical snapshots (Option C) for truthful QoQ comparisons | 2026-01-04 |

## Open Concerns

| Concern | Severity | Location |
|---------|----------|----------|
| JWT secret hardcoded | Critical | `config.py` |
| No token refresh | Medium | Auth system |
| No rate limiting | Medium | Login endpoint |

## Accumulated Context

### Roadmap Evolution

- Phase 90 (Integrated AD) superseded by Phase 99
- AD Emulator will be standalone app communicating with RiskHub via HTTP
- RiskHub will fetch directory users from AD Emulator, not store internally
- Phase 156.1 inserted after Phase 156: Admin role and RBAC hardening for access mutation guards, admin log-config contract parity, and seed/test contract convergence (URGENT)

### AD Emulator Architecture

- **AD Emulator Backend**: Port 8001, FastAPI, separate PostgreSQL database
- **AD Emulator Frontend**: Port 5174, React/Vite, purple/violet branding
- **RiskHub Integration**: HTTP client to fetch from AD Emulator, sync to local users

## Continuity

### Last Action

- Executed Phase 179 extension plans 179-12..179-16: hardened prerequisites, added deterministic vendor/vendor-SLA/archive matrix seeding, and validated end-to-end seeding via `venv/bin/python -m scripts.seed_e2e_all` (2026-02-07).
- Executed Phase 180 extension plans 180-10..180-14 and implemented 180-15 setup/docs reconciliation: introduced deterministic fixture constants, refactored skip-heavy suites to deterministic selectors, added vendor/vendor-SLA archive coverage, and integrated global setup preflight checks for seeded fixture availability (2026-02-07).
- Executed 180-16 stabilization follow-up for `kri-owner-access`: refactored to deterministic fixture-driven navigation/assertions and removed brittle shell-content checks. Focused and stress runs passed (`6/6`, `30/30`), while broader/full verification exposed additional unrelated parallel flakes in other specs (2026-02-09).
- Executed next blocker fix (item 1) for `cross-department/control-owner-access`: patched `ControlsPage` search locator for localized UI (`Hledat`) and added visible-wait before fill; target spec now passes (`4/4`) and the prior timeout is removed from blockers (2026-02-09).
- Executed `04-05` closeout for Phase 4 reporting extension: finalized export regression coverage/docs updates, passed backend + targeted frontend verification (`19 backend assertions + 19 Playwright tests`), and reconciled planning state/roadmap (2026-02-10).
- Executed `04-06` export contract simplification: removed PDF export support across reporting APIs/UI/docs and validated targeted backend/frontend suites (`27 backend tests`, `19 Playwright tests`, `frontend tsc`) (2026-02-10).
- Executed hardening closure verification pass with deterministic gate matrix: backend + frontend static checks green, targeted critical Playwright green (`44/44`), and finalized full-gate watchdog pass (`868 tests`, `0 failures`, valid JUnit) with targeted 180-15 reconciliation completed (`93 tests`, `0 failures`, documented skip budget) (2026-02-11).
- Executed Phase `156.1` admin-role/RBAC hardening plans end-to-end with passing backend/frontend/E2E verification and full docs reconciliation (`5/5 complete`) (2026-02-11).
- Closed Phase `10` plan `10-05` by reconciliation as superseded-by-implementation and marked Phase `10` complete (`5/5`) (2026-02-11).
- Closed Phase `11` plan `11-04` by reconciliation as already-implemented dashboard trend widgets and marked Phase `11` complete (`5/5`) (2026-02-11).
- Closed Phase `179` plan `179-00` by reconciliation; refreshed overview metadata and marked Phase `179` complete (`17/17`) without new seed implementation changes. Summary: `.planning/phases/179-e2e-test-data/179-00-SUMMARY.md` (2026-02-11).
- Executed Phase `200` plan `200-08` export/reporting closeout with minimal backend naming fix (audit linked-risk labels now prefer `risk.name`), targeted backend/frontend verification only (`20 + 3 + 5 backend tests`, `10 + 9 Playwright tests`, all green), and created summary evidence at `.planning/phases/200-naming-enforcement/200-08-SUMMARY.md` (2026-02-11).

### Next Step

- Resume next open roadmap item for Phase `17` (Production Deployment hardening + runbook verification).

---

*Updated: 2026-02-15*
