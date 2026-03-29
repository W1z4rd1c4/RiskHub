# Project State: RiskHub

## Project Summary

**Building:** Enterprise risk management platform for insurance companies with control catalogs, dashboards, and AD integration.

**Core requirements:**

- Control catalog with 13-point data structure
- Role-based access via Active Directory/Entra ID
- Real-time dashboards for executives and departments

**Constraints:**

- React + Python FastAPI stack
- On-premise deployment (`docker`/`linux`)
- English default with Czech language option

## Current Position

**Milestone:** v1.0 MVP
**Active Phases:** 90 (AD Emulator) and 156 in progress; 19 and 70 deferred
**Documentation Status:** Reconciled with phase folders and canonical docs (2026-03-05)

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
| 15 Settings Page | ✅ Complete (6/6) | 2026-02-16 |
| 16 Risk Assessment Polish | ✅ Complete (3/3) | 2026-01-24 |
| 17 Production Deploy | ✅ Complete (14/14) | 2026-02-16 |
| 18 Vendor Risk Management | ✅ Complete (12/12) | 2026-01-26 |
| 19 Advanced Audit Workflows | ⏸ Deferred (0/2) | - |
| 20 Czech Localization | ✅ Complete (16/12) | - |
| 25 User Settings | ✅ Complete (5/5) | 2026-01-11 |
| 70 Risk Hub | ⏸ Deferred (8/12) | - |
| 71 Risk Hub Review | ✅ Complete (3/3) | 2026-01-03 |
| 72 Risk Hub Resolution | ✅ Complete (12/12) | 2026-01-05 |
| 85 Workflow & Users | ✅ Complete (6/6) | 2026-01-01 |
| 90 AD Emulator | ⏳ In progress (2/3) | - |
| 90 AD Integration | ✅ Complete (12/12) | 2026-02-16 |
| 99 Data Migration | ✅ Complete (8/8) | 2026-01-04 |
| 100 Marketing | ✅ Complete (3/3) | 2025-12-29 |
| 150 Audit | ✅ Complete (11/11) | 2026-02-16 |
| 151 Audit Resolution | ✅ Complete (19/19) | 2026-01-10 |
| 152 Audit Resolution 2 | ✅ Complete (8/8) | 2026-01-10 |
| 153 Audit Resolution 3 | ✅ Complete (12/12) | 2026-01-10 |
| 154 Workflow Bug Sweep | ✅ Complete (5/5) | 2026-01-14 |
| 156 Audit | ⏳ In progress (7/8) | - |
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
| 500 Production Installation Scripts | ✅ Complete (8/8) | 2026-02-16 |
| 501 Production Readiness Hardening | ✅ Complete (8/8) | 2026-02-16 |

## Session Context

### Open Issues Remediation and Regression Hardening - Phase 3 (2026-03-29)

- Closed the `/users` partial-save gap by making the access edit modal submit a single transactional `PATCH /api/v1/access/users/{id}` request.
- `backend/app/api/v1/endpoints/access.py` now accepts Admin-only identity fields (`name`, `email`) alongside access fields and rejects the whole mutation on validation failures such as duplicate email.
- `frontend/src/components/access/AccessEditModal.tsx` now performs one modal save instead of splitting identity and access writes across `/access/users/{id}` and `/users/{id}`.
- Focused verification:
  - `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend pytest --override-ini addopts='-p no:langsmith_plugin -p no:cacheprovider' tests/backend/pytest/test_access_management.py -q` -> `14 passed`
  - `cd frontend && npm run test:run -- src/components/access/AccessEditModal.test.tsx src/pages/__tests__/UsersPage.modes.test.tsx src/pages/__tests__/UsersPage.sso-cta.test.tsx` -> `13 passed`

### Open Issues Remediation and Regression Hardening - Phase 4 (2026-03-29)

- Added route-level guards for `/users` and `/users/new` so denied sessions redirect before the page mounts or fetches onboarding/config data.
- Removed the compatibility-sidebar dependency on `canViewUsersPage`; the navigation item now keys off `canViewUsersRoute`, which matches the route guard contract.
- Hardened `/users` load failures so the page shows a retryable error state instead of a false empty-state table, and hid privileged summary cards outside access mode.
- Tightened the `/users` create CTA contract again: password mode now exposes only `Add user`, while directory-first modes keep `Add from AD`.
- Focused verification:
  - `cd frontend && npm run test:run -- src/authz/__tests__/UserRouteGuards.test.tsx src/pages/__tests__/UsersPage.modes.test.tsx src/pages/__tests__/UsersPage.sso-cta.test.tsx src/components/layout/__tests__/SidebarPolling.test.tsx` -> `16 passed`
  - `cd frontend && npx tsc --noEmit`

### Users Surface Contract Realignment - Phase 1 (2026-03-29)

- Began branch `codex/users-surface-realignment` to split user-directory, picker, and lifecycle contracts without adding any new `/users/me` or `/me/*` user-management routes.
- Backend contract changes in progress:
  - extracted shared user-visibility filtering into `backend/app/api/v1/endpoints/users/_visibility.py`
  - added `GET /api/v1/users/directory` as the explicit paginated directory contract for `/users` directory mode
  - kept `GET /api/v1/users/lookup` as the authenticated picker/search primitive
  - tightened manual lifecycle creation/import toward Admin-only defaults
- Frontend contract changes in progress:
  - added explicit users-route authz flags for directory, global access view, department access view, and aggregate route visibility
  - added `frontend/src/services/userDirectoryApi.ts` and distinct directory response types
  - kept `canViewUsersPage` as a temporary compatibility alias during migration
- Phase-1 documentation reconciliation in progress:
  - `docs/BUSINESS_LOGIC.md`
  - `docs/user/access-management.md`
  - `docs/user-cs/access-management.md`
  - `docs/admin/user-management.md`
  - `docs/admin-cs/user-management.md`
  - `backend/app/api/v1/endpoints/users/README.md`
- Pending phase gate at this checkpoint:
  - completed: `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend pytest --override-ini addopts='-p no:langsmith_plugin -p no:cacheprovider' tests/backend/pytest/test_users.py tests/backend/pytest/test_authz_list_policy.py tests/backend/pytest/test_access_management.py tests/backend/pytest/test_directory_import.py -q` -> `34 passed`
  - completed: `cd frontend && npm run test:run -- ../tests/frontend/unit/src/pages/__tests__/rbac_gating.test.tsx ../tests/frontend/unit/src/components/layout/__tests__/SidebarPolling.test.tsx` -> `17 passed`
  - completed: `cd frontend && npx tsc --noEmit`
  - ready for Phase 1 commit/push

### Users Surface Contract Realignment - Phase 2 (2026-03-29)

- Rebuilt `/users` around explicit mode selection:
  - global privileged users -> `/access/users`
  - department heads -> `/access/users/my-department`
  - directory-entitled users without access-management authority -> `/users/directory`
  - users with no `/users` entitlement -> redirect away from the route
- Removed the old `/users` page fallback to `userApi.listVisibleUsers()` and replaced directory mode with the dedicated `userDirectoryApi` plus server-driven search/filtering and pagination.
- Added focused frontend coverage for route modes and updated the existing `/users` CTA/authz suites:
  - `cd frontend && npm run test:run -- ../tests/frontend/unit/src/pages/__tests__/UsersPage.modes.test.tsx ../tests/frontend/unit/src/pages/__tests__/UsersPage.sso-cta.test.tsx ../tests/frontend/unit/src/pages/__tests__/rbac_gating.test.tsx` -> `22 passed`
  - `cd frontend && npx tsc --noEmit`
- Dev/demo account verification against the live local stack (`http://localhost`) using headless Playwright:
  - `admin@riskhub.local` (`System Admin`) -> `/users` loaded access-management mode; add-user CTA present
  - `cro@riskhub.local` (`Anna Kowalski`) -> `/users` loaded access-management mode
  - `risk.manager@riskhub.local` (`Petra Svobodová`) -> `/users` loaded global access-management mode without edit controls
  - `ops.head@riskhub.local` (`Eva Králová`) -> `/users` loaded department access mode
  - no canonical directory-only demo actor was verified in this phase; current seeded-matrix truth is recorded in Phase 5 below

### Users Surface Contract Realignment - Phase 3 (2026-03-29)

- Retired the standalone frontend user-detail surface:
  - removed the standalone user-detail route from `frontend/src/App.tsx`
  - deleted the former standalone user-detail page component
  - removed the remaining department-tab navigation path into the retired user-detail surface
- Re-homed user-management workflows back onto `/users`:
  - directory import in `frontend/src/pages/UserNewPage.tsx` now returns to `/users` with import context instead of navigating to a standalone detail route
  - `frontend/src/pages/UsersPage.tsx` now consumes that import context, shows the import success banner, and opens `AccessEditModal` on the imported record in access mode
  - `frontend/src/components/access/AccessEditModal.tsx` now supports admin identity edits (name/email) alongside access edits so the old detail-page edit responsibilities stay on `/users`
- Updated active docs and translations to match the new contract:
  - removed stale standalone-detail locale copy from `frontend/src/i18n/locales/en/admin.json` and `frontend/src/i18n/locales/cs/admin.json`
  - updated `/users` workflow guidance in `docs/admin/user-management.md`, `docs/admin-cs/user-management.md`, `docs/user/access-management.md`, `docs/user-cs/access-management.md`
  - updated related admin runbooks in `docs/admin/incident-quick-reference.md`, `docs/admin-cs/incident-quick-reference.md`, `docs/admin/departments.md`, and `docs/admin-cs/departments.md`
- Updated automation coverage to stop assuming dynamic user-detail routes:
  - removed `/users` deep-detail expansion from `tests/frontend/e2e/polish-audit.spec.ts`
- Phase 3 frontend verification:
  - `cd frontend && npm run test:run -- ../tests/frontend/unit/src/pages/__tests__/UsersPage.modes.test.tsx ../tests/frontend/unit/src/pages/__tests__/UserNewPage.sso.test.tsx ../tests/frontend/unit/src/pages/__tests__/DepartmentDetailPage.kri-monitoring.test.tsx` -> `13 passed`
  - `cd frontend && npx tsc --noEmit`
  - active-surface grep now finds only historical planning artifacts for the retired standalone user-detail contract

### Users Surface Contract Realignment - Phase 4 (2026-03-29)

- Tightened lifecycle/detail endpoint drift on the backend:
  - added `backend/app/api/v1/endpoints/users/_lifecycle.py` as the shared Admin-only lifecycle guard
  - `GET /api/v1/users/{id}` now requires explicit platform-admin lifecycle authority and no longer allows self-detail reads
  - `GET /api/v1/users/roles` is now treated as an Admin-only lifecycle helper instead of a generic authenticated role list
  - access-management role selection remains on `GET /api/v1/access/roles`
- Removed the remaining frontend dependency on `/users/roles`:
  - `frontend/src/pages/UserNewPage.tsx` now loads role options from `accessApi.listAccessRoles()`
  - `frontend/src/services/userApi.ts` no longer exposes frontend helpers for `/users/{id}` reads or `/users/roles`
- Added explicit auth regression coverage:
  - `tests/backend/pytest/test_users.py` now covers Admin-only enforcement for `/api/v1/users/{id}`, `/api/v1/users/{id}` self-access denial, `/api/v1/users/{id}` patches, and `/api/v1/users/roles`
  - `tests/backend/pytest/test_directory_lookup.py` now covers CRO denial for directory search
  - frontend user-onboarding tests now mock `accessApi.listAccessRoles()` and keep `UsersPage.sso-cta` under a router wrapper after the Phase 3 `useLocation()` dependency
- Phase 4 verification:
  - `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend pytest --override-ini addopts='-p no:langsmith_plugin -p no:cacheprovider' tests/backend/pytest/test_users.py tests/backend/pytest/test_access_management.py tests/backend/pytest/test_directory_import.py tests/backend/pytest/test_directory_lookup.py -q` -> `41 passed`
  - `cd frontend && npm run test:run -- ../tests/frontend/unit/src/pages/__tests__/UserNewPage.sso.test.tsx ../tests/frontend/unit/src/pages/__tests__/UsersPage.sso-cta.test.tsx ../tests/frontend/unit/src/pages/__tests__/UsersPage.modes.test.tsx` -> `14 passed`
  - `cd frontend && npx tsc --noEmit`

### Users Surface Contract Realignment - Phase 5 (2026-03-29)

- Revalidated the full users-surface series on the actual `codex/users-surface-realignment` branch after rebuilding the Docker frontend/backend from that branch; discarded an earlier stale `main` runtime check on `localhost`.
- Final branch-local regression:
  - `cd frontend && npm run test:run` -> `77 passed (77 files), 259 passed (259 tests)`
  - `cd frontend && npx tsc --noEmit`
  - `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend pytest --override-ini addopts='-p no:langsmith_plugin -p no:cacheprovider' tests/backend/pytest -q` -> `786 passed, 9 skipped`
- Final active-surface grep gate:
  - `rg -n 'UserDetailPage|/users/:id|user_detail|users/roles|listVisibleUsers' frontend backend tests docs`
  - remaining active-code matches are intentional:
    - `userApi.listVisibleUsers()` remains only in picker/search consumers (`frontend/src/hooks/useDepartmentDetail.ts`, `frontend/src/components/KRIForm.tsx`, `frontend/src/components/kri/KRIModal.tsx`)
    - `/api/v1/users/roles` remains only in backend tests and the business-logic/backend endpoint docs that now describe it as an Admin-only lifecycle helper
    - `UserDetailPage` references outside active code are historical/generated artifacts (`docs/reference/file_list.txt`, `frontend/i18n-audit/*`, `tests/results/*`)
- Demo-account `/users` verification against the rebuilt branch runtime (`http://localhost`):
  - `admin@riskhub.local` (`System Admin`) -> `/users` stayed in access-management mode, loaded `/api/v1/access/users`, showed `Check AD` + `Add from AD`, and exposed 18 row action buttons; opening access edit showed one email input, confirming admin identity editing stayed on `/users`
  - `cro@riskhub.local` (`Anna Kowalski`) -> `/users` stayed in access-management mode, loaded `/api/v1/access/users`, showed 9 row edit actions only, and exposed zero email inputs in the access edit modal, confirming CRO access-only editing without lifecycle controls
  - `risk.manager@riskhub.local` (`Petra Svobodová`) -> `/users` stayed in the global access-management view via `/api/v1/access/users` with zero row actions
  - `ops.head@riskhub.local` (`Eva Králová`) -> `/users` stayed in department access mode via `/api/v1/access/users/my-department` with two visible rows and zero row actions
  - `ops.analyst@riskhub.local` (`Jana Horáková`) -> direct `/users` access redirected to `/`; this supersedes the earlier provisional Phase 2 note that the analyst demo account looked like a directory-mode user
  - current seeded demo matrix therefore has no canonical directory-only actor; directory mode remains a supported contract but requires explicit API/unit/browser coverage rather than manual demo-account verification until product intentionally seeds a non-access-view `users:read` role
- Residual runtime observations discovered during Phase 5:
  - password-mode `/users` originally still rendered both `Add from AD` and `Add user`; the current branch now aligns the page with the intended auth-mode-specific CTA contract and keeps password mode on the direct `Add user` lifecycle path

### Docker Live Verification + Postgres Marker Reconciliation (2026-03-29)

- Attempted deterministic Docker reset:
  - `./scripts/compose.sh reset --dataset test`
  - now completes end to end after aligning the bootstrap service to the backend `dbtasks` build target
- Verified Docker app runtime on the canonical compose path:
  - `docker compose -f docker-compose.yml --profile full run --rm bootstrap python -c "import psycopg2"` -> success
  - backend now reaches `healthy` under the inherited image healthcheck
- Runtime preflight passed:
  - `curl -fsS http://localhost:8000/api/v1/health` → `healthy`, `database=connected`
  - `curl -fsS http://localhost:8000/api/v1/auth/config` → `auth_mode=hybrid_dev`, `demo_login_enabled=true`
  - `curl -I -fsS http://localhost/login` → `HTTP/1.1 200 OK`
- Created isolated Postgres test database:
  - `docker exec riskhub-db psql -U riskhub -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS riskhub_test;" -c "CREATE DATABASE riskhub_test OWNER riskhub;"`
- Postgres marker suite passed against the isolated DB:
  - `cd backend && TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test pytest -m postgres -v`
  - result: `5 passed, 767 deselected in 5.33s`
  - backend artifact root: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/backend/coverage_html`
- Docker-targeted browser automation now clears the original login-helper blocker:
  - targeted business-logic rerun:
    - `cd frontend && FRONTEND_URL=http://localhost npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/access-scope.spec.ts --project=chromium --grep "GLOBAL user can see all departments in department list"`
    - result: `1 passed`
  - targeted polish rerun:
    - `cd frontend && FRONTEND_URL=http://localhost POLISH_AUDIT_DEEP=1 npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/polish-audit.spec.ts --project=chromium --grep "RISK_MANAGER / theme=riskhub / lang=en"`
    - result: `1 passed`
  - the shared login helper is now origin-aware and works against both `http://localhost:5173` and `http://localhost/`
- Manual live UI verification against the Docker-served app:
  - `RISK_MANAGER`, `theme=dark`, `lang=en`:
    - `/kris` → pass
    - `/approvals` → pass
    - `/activity-log` → pass
    - `/governance` → redirected to `/` as expected
    - direct `/users/1` → route shell loaded but API returned `403` and the page rendered `User not found`; needs follow-up to confirm whether this is intended for non-admin users
  - `CRO`, `theme=riskhub`, `lang=cs`:
    - `/governance` → pass, heading rendered as `Dohled nad správou`
  - `ADMIN`, `theme=light`, `lang=en`:
    - `/admin` → pass
    - `/governance` → redirected to `/admin` as expected
    - `/users/1` → pass via login `returnTo` flow; user detail rendered for `System Admin`
- Browser evidence confirmed the current polish automation scope still covers `riskhub` and `light`; `dark` remains a manual-only theme check.
- Reconciled docs to match the actual verification path and blockers:
  - `docs/TESTING.md`
  - `docs/E2E_TESTING.md`
  - `docs/development/README.md`
  - `.planning/codebase/TESTING.md`
  - `docs/agent/PYTEST_RUNTIME_NOTES.md`
  - `tests/frontend/e2e/README.md`

### Pre-Release Deployment / Installation Deep Review (2026-03-17)

- Current release status is **NO-GO** based on the latest pre-release deployment/install review.
- Human report:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/docs/security/reports/pre-release-deploy-install-audit-2026-03-17.md`
- Review artifact root:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/pre-release-deploy-install-review-20260317T143939Z`
- Supporting parity artifacts:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/release-parity-audit-20260317T143939Z-skip`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/release-parity-audit-20260317T143939Z-full`
- This supersedes the February 22 release-readiness `GO/PASS` stance as current truth.
- Blocking reasons at closeout:
  - `make -f scripts/Makefile verify-prod-install-scripts` currently fails on `main`
  - Docker deploy dry-run corrupts rendered runtime-file arguments via stdout pollution
  - `scripts/security/run_prod_readiness_audit_local.sh` aborts before meaningful lifecycle evidence
  - the mandatory Linux production wave was not executed on a real Linux host, so overall release sign-off remains incomplete

### Reliability Hardening Follow-Up (2026-03-07)

- ✅ Completed scheduler ownership hardening with Postgres advisory locking, runtime/job ledgering, and admin-visible scheduler status.
- ✅ Added transactional outbox persistence + dispatcher, then migrated approval, issue, questionnaire, vendor-assessment, and related request-driven notifications off inline best-effort delivery.
- ✅ Removed governance write-on-read behavior:
  - orphan scan is scheduler-managed
  - `/governance` now reads the overview snapshot and pending items instead of triggering scans on page load
- ✅ Added aggregate/cached read models and frontend polling consolidation:
  - `/api/v1/users/me/shell-summary`
  - `/api/v1/dashboard/overview`
  - `/api/v1/orphaned-items/overview`
  - shared adaptive polling + smoother auth/bootstrap coordination
- ✅ Extended Admin Console health with scheduler and outbox status surfaces.
- ✅ Updated production runtime validation:
  - smoke checks now verify `scheduler_job_runs`, `app_outbox_events`, one active scheduler runtime row, and zero dead-letter outbox rows
  - `scripts/prod/verify_runtime.sh` now reports reliability runtime state
- Verification executed during this follow-up:
  - `cd backend && pytest -q ../tests/backend/pytest/test_scheduler_runtime.py ../tests/backend/pytest/test_outbox_approval_flow.py ../tests/backend/pytest/test_aggregate_overviews.py ../tests/backend/pytest/test_orphaned_items_scan_and_stats.py` → passed
  - `cd frontend && npm run test:run -- src/components/layout/__tests__/SidebarPolling.test.tsx src/components/notifications/__tests__/NotificationBell.test.tsx src/hooks/__tests__/useAdaptivePollingQuery.test.tsx src/pages/__tests__/DashboardPage.overview.test.tsx src/pages/__tests__/GovernancePage.overview.test.tsx src/pages/admin-console/__tests__/AdminConsoleOpsPanels.outbox.test.tsx src/services/__tests__/accessTokenStore.test.ts src/services/__tests__/apiClient.401-recovery.test.ts` → passed
  - `cd frontend && npx tsc --noEmit` → passed
  - targeted docs/deployment and admin/user runbooks reconciled
  - production smoke/verify-runtime scripts updated and syntax-checked

### Release Parity GO + Documentation Reconciliation (2026-02-22)

- ✅ Completed release-parity fixes and validation loop for startup/runtime/dependency parity.
- ✅ Final full-run parity decision: `GO` (`P0=0`, `P1=0`, `P2=0`).
- Evidence root:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/release-parity-audit-20260222-130000`
- ✅ Reconciled canonical and planning docs for parity workflow and release gate requirements:
  - `scripts/security/README.md`
  - `docs/deployment/README.md`
  - `docs/TESTING.md`
  - `.planning/codebase/TESTING.md`
  - `AGENTS.md`
  - `.planning/codebase/STACK.md`
  - `docs/security/README.md`
  - `docs/security/reports/README.md`
  - `docs/security/reports/release-parity-go-2026-02-22.md`

### Admin Boundary Verification + Documentation Reconciliation (2026-03-05)

- ✅ Re-verified the admin/business boundary and RBAC seed contract after the latest fixes.
- ✅ Focused authz/RBAC regression pack passed on current test topology:
  - `PYTHONPATH=backend pytest tests/backend/pytest/test_activity_log.py tests/backend/pytest/test_orphaned_items_scan_and_stats.py tests/backend/pytest/test_executions.py tests/backend/pytest/api/v1/test_issues_rbac_api.py tests/backend/pytest/api/v1/test_dashboard_issue_metrics.py tests/backend/pytest/api/v1/test_reports_issues.py tests/backend/pytest/test_seed_rbac_parity.py -q` → `50 passed`
- ✅ Full backend regression gate passed:
  - `make -f scripts/Makefile test` → `631 passed, 8 skipped, 13 warnings in 610.37s`
- ✅ Frontend regression gates re-passed:
  - `cd frontend && npm run test:run` → `48 files, 181 tests passed`
  - `cd frontend && npx tsc --noEmit` → passed
- ✅ Business-logic E2E regression gate passed:
  - `cd frontend && npm run e2e:business-logic` → `572 passed, 152 skipped`
- ✅ Documentation validation gates passed:
  - `python3 scripts/check_docs_contract.py` → `Documentation contract OK`
  - `make -f scripts/Makefile docs-topology-consistency` → passed after refreshing `.planning/codebase/STRUCTURE.md` to current tracked-file counts
  - `cd backend && venv/bin/pytest ../tests/backend/pytest/test_admin_docs.py -q` → `4 passed`
  - `cd frontend && npm run test:run -- src/components/settings/__tests__/DocumentationSettings.test.tsx` → `6 passed`
- ✅ Canonical docs reconciled so the current contract is explicit across user/admin libraries:
  - platform `admin` is console-only
  - business `/governance` is CRO-only
  - business `/activity-log` is permission-gated and blocked for platform admin
  - `controls:execute` seed + convergence role set is aligned (`cro`, `risk_manager`, `compliance`, `internal_audit`, `actuarial`, `department_head`, `employee`)

### Phase 501 Execution (2026-02-16)

- ✅ Executed full hardening scope from deep-scan findings across frontend, backend auth, stale code cleanup, lint debt, and CI quality/security gates.
- ✅ Frontend hardening:
  - restored strict TypeScript/build stability for generic table and related typed surfaces,
  - upgraded `axios` to non-vulnerable lock state,
  - verified lint/typecheck/build/test/audit gates.
- ✅ Backend hardening:
  - replaced `python-jose` with `PyJWT[crypto]` while preserving token claim contract and SSO verification behavior,
  - removed stale legacy test artifact + dead translation module,
  - cleared Ruff debt across `tests/` and `scripts/`.
- ✅ CI hardening:
  - added frontend `tsc --noEmit` and `npm run build` gates,
  - expanded backend Ruff scope to `app tests scripts`,
  - made security scans blocking for actionable issues with explicit pip-audit allowlist mechanism.
- Added Phase 501 summaries:
  - `.planning/phases/501-production-readiness-hardening/501-01-SUMMARY.md` through `501-08-SUMMARY.md`
- Verification executed:
  - `cd frontend && npm run lint -- --max-warnings=0` → passed
  - `cd frontend && npx tsc --noEmit` → passed
  - `cd frontend && npm run build` → passed
  - `cd frontend && npm run test:run` → passed
  - `cd frontend && npm audit --audit-level=high` → passed (`0 vulnerabilities`)
  - `cd backend && ./venv/bin/python -m ruff check app tests scripts` → passed
  - `cd backend && ./venv/bin/pytest -q` → passed
  - `cd backend && ./venv/bin/pytest -q tests/test_sso_token_service.py tests/test_sso_exchange.py tests/test_users.py tests/test_production_hardening.py` → passed
  - `cd backend && ./venv/bin/bandit --ini .bandit -r app -f txt --severity-level high` → passed (no high findings)
  - `cd backend && ./venv/bin/python -m pip_audit -r requirements.txt` → passed (`No known vulnerabilities found`)

### Phase 17/19/70/156 Reconciliation (2026-02-16)

- Removed `17-07` (Azure deployment) from active roadmap scope because deployment target is no longer Azure.
- Implemented and verified `17-12`, `17-13`, and `17-14` with closeout summaries:
  - `.planning/phases/17-production-deploy/17-12-SUMMARY.md`
  - `.planning/phases/17-production-deploy/17-13-SUMMARY.md`
  - `.planning/phases/17-production-deploy/17-14-SUMMARY.md`
- Phase `19` remains deferred (confirmed and unchanged).
- Phase `70` is now deferred (plans `70-08..70-12` paused for post-release).
- `156-08` confirmed not done; it remains intentionally deferred per summary.

### Phase 70/156 Metadata Reconciliation (2026-02-16)

- Reconciled planning drift for Phase 70 and Phase 156 in roadmap/state metadata.
- Corrected Phase 156 progress from `1/8` to `7/8` based on phase plan+summary evidence.
- Kept `156-08` open and explicitly deferred (intentional, not implemented).
- Kept Phase 70 at `8/12`; `70-08..70-12` remain open due missing implementation evidence and missing summary artifacts.
- Re-verified no code-level implementation matches for open Phase 70 items:
  - `kri_strict_period_submission`
  - `control_execution_logging`
  - `departments:read_all`

### Phase 150 Open Items Completion (2026-02-16)

- Completed remaining Phase 150 plans in sequence:
  - `150-04` (Webhook + Mock Auth Hardening)
  - `150-10` (Backend Counts + Lookup Scoping)
  - `150-11` (Department Detail Pagination Reset)
- Added summary artifacts:
  - `.planning/phases/150-audit/150-04-SUMMARY.md`
  - `.planning/phases/150-audit/150-10-SUMMARY.md`
  - `.planning/phases/150-audit/150-11-SUMMARY.md`
- Verification executed:
  - `cd backend && pytest -q tests/test_directory_sync.py` → passed
  - `cd backend && pytest -q tests/test_users.py` → passed
  - `cd backend && pytest -q tests/test_production_hardening.py` → passed
  - `cd backend && pytest -q tests/test_departments.py` → passed
  - `cd frontend && npm run lint` → passed (warnings only)
  - `cd frontend && npx tsc --noEmit` → passed
- Updated roadmap/state metadata for Phase 150 closeout (`11/11`, complete on 2026-02-16).

### Unfinished-Plan Reconciliation (2026-02-16)

- Reconciled unfinished-plan closeout scope across Phases 17, 19, 90, and 150.
- Closed as superseded:
  - `17-06` via Phase 500 production scripts/docs (`scripts/prod/*`, `docs/deployment/*`)
  - `17-08` via Phase 500 deployment documentation/runbook consolidation
- Closed as implemented:
  - `17-12` (Directory lookup/import via Graph provider + frontend picker)
  - `17-13` (Refresh-token lifecycle with rotation, revocation, and admin real sessions)
  - `17-14` (Directory deprovision checks, manual sync APIs, scheduler path)
  - `90-15` (Governance UI redesign + KRI orphan handling already present in backend/frontend)
- Skipped unchanged (not implemented or partial-only):
  - `19-01`, `19-02` (phase remains deferred)
- Added ex-post summaries:
  - `.planning/phases/17-production-deploy/17-06-SUMMARY.md`
  - `.planning/phases/17-production-deploy/17-08-SUMMARY.md`
  - `.planning/phases/17-production-deploy/17-12-SUMMARY.md`
  - `.planning/phases/17-production-deploy/17-13-SUMMARY.md`
  - `.planning/phases/17-production-deploy/17-14-SUMMARY.md`
  - `.planning/phases/90-ad-integration/90-15-SUMMARY.md`
- Reconciled roadmap/state metadata drift for phases 17, 18, 19, 90 AD Integration, 150, 201, and 500.

### Phase 500 Planning (2026-02-16)

- Added new planning phase for production installation scripts with explicit external PostgreSQL requirement (no DB container in RiskHub deploy scripts).
- Created planning artifacts:
  - `.planning/phases/500-production-installation-scripts/500-CONTEXT.md`
  - `.planning/phases/500-production-installation-scripts/500-RESEARCH.md`
  - `.planning/phases/500-production-installation-scripts/500-01-PLAN.md` through `500-08-PLAN.md`
- Locked interpretation for execution: backend container + frontend container are independently installed/operated; PostgreSQL is externally managed and only referenced through `DATABASE_URL`.

### Phase 500 Execution (2026-02-16)

- ✅ Implemented Phase 500 production install scripts under `scripts/prod/`:
  - external PostgreSQL only (no DB container), Redis installed as `riskhub-redis`,
  - backend API container (`riskhub-backend`) + isolated scheduler container (`riskhub-backend-scheduler`, forced `--workers 1`),
  - frontend nginx container (`riskhub-frontend`) proxying `/api/*` to docker alias `backend`,
  - deploy/upgrade/rollback/status/logs/stop operational entrypoints.
- ✅ Added DB bootstrap automation:
  - RBAC + departments seeding in ephemeral backend containers,
  - idempotent SSO user bootstrap by email (`backend/scripts/bootstrap_sso_user.py`) to prevent SSO admin lockout.
- ✅ Published operator runbook and reconciled deployment/security docs for the external-PostgreSQL install path.
- Verification:
  - `make verify-prod-install-scripts` → passed (bash syntax, dockerized shellcheck, `tests/test_production_hardening.py`)
  - `scripts/prod/preflight.sh --backend-env scripts/prod/config/backend.env.example --frontend-env scripts/prod/config/frontend.env.example --dry-run` → `Preflight: OK`
  - `cd backend && ./venv/bin/python -m compileall scripts/bootstrap_sso_user.py` → passed

### Phase 15 Reopen Planning (2026-02-16)

- Reopened Phase 15 to address Settings documentation quality and navigation feedback.
- Added planning artifacts:
  - `.planning/phases/15-settings-page/15-RESEARCH.md`
  - `.planning/phases/15-settings-page/15-06-PLAN.md`
- Locked follow-up scope:
  - simplify Settings documentation library UX,
  - add tags on documentation bubbles/cards with quick tag filters,
  - enforce strict split: platform admin users see only admin docs, non-admin users see only user docs.
- Planning metadata reconciled to in-progress (`5/6`) pending execution of `15-06`.

### Phase 15 Reopen Execution (2026-02-16)

- ✅ Executed `15-06` to complete settings documentation remediation scope.
- Backend delivery:
  - Enforced strict docs audience split in `GET /api/v1/admin/docs`:
    - `admin` receives only admin docs
    - all non-admin roles (including CRO) receive only user docs
  - Added docs metadata contract fields: `audience`, `tags`.
  - Implemented per-file locale fallback to English when localized files are missing.
- Frontend delivery:
  - Added audience label, tag chips, and quick tag filtering on Settings Documentation tab.
  - Mirrored audience label + tag filtering behavior on `/admin/docs`.
  - Updated docs API types for new metadata fields.
- Added verification artifacts:
  - `.planning/phases/15-settings-page/15-06-SUMMARY.md`
- Verification:
  - `cd backend && venv/bin/pytest tests/test_admin_docs.py -q` → `4 passed`
  - `cd frontend && npm run test:run -- src/components/settings/__tests__/DocumentationSettings.test.tsx` → `3 passed`
  - `cd frontend && npx tsc --noEmit` → passed
- Reconciled planning metadata to complete (`6/6`).

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
- ✅ **17-12**: AD User Directory lookup/import (Graph provider + admin import UI)
- ✅ **17-13**: Session management (refresh cookie flow, rotation, logout/logout-all, admin real sessions)
- ✅ **17-14**: AD deprovision checks (manual/admin + scheduler service path with revocation/orphan handling)

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
- ✅ **72-07**: Full-modality permission independence + documentation reconciliation
- ✅ **72-08**: Full-modality cleanup (RBAC enforcement, migration convergence, repo hygiene)
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
| Governance Surface Access | Governance is a CRO-only business surface; platform admin is blocked from direct route/API access | 2026-03-05 |
| Control Execution Seed Contract | Canonical seed + convergence both grant `controls:execute` to `cro`, `risk_manager`, `compliance`, `internal_audit`, `actuarial`, `department_head`, `employee` | 2026-03-05 |
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
- Reopened Phase `15` for settings documentation remediation, added research + execution plan `15-06` for UX simplification, tags, and strict audience separation (2026-02-16).
- Executed Phase `15` plan `15-06` end-to-end with strict admin/user docs segmentation, tag-based navigation UX, and passing targeted backend/frontend verification; Phase `15` now complete (`6/6`) (2026-02-16).

### Next Step

- Resume next open roadmap item for Phase `17` (Production Deployment hardening + runbook verification).

---

*Updated: 2026-02-16*
