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
**Active Phases:** 90 (AD Emulator) and 253 (Professionalization & AI-Signal Removal) remain active; 253.1 completed on 2026-04-20; 19 and 70 deferred
**Documentation Status:** Reconciled with phase folders and canonical docs (2026-04-05)

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
| 156 Audit | ✅ Complete (8/8) | 2026-04-05 |
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
| 252 Quality Closure Loop | ✅ Complete (11/11) | 2026-04-07 |
| 253 Professionalization & AI-Signal Removal | ⏳ In progress (0/8) | - |
| 253.1 Backend Audit Remediation | ✅ Complete (4/4) | 2026-04-20 |
| 500 Production Installation Scripts | ✅ Complete (8/8) | 2026-02-16 |
| 501 Production Readiness Hardening | ✅ Complete (8/8) | 2026-02-16 |

## Session Context

### Phase 253.1 Backend Audit Remediation (2026-04-20)

- Inserted and completed urgent phase `253.1-backend-audit-remediation` with 4 serial plans and per-plan summaries.
- Plan `253.1-01` completed:
  - reordered middleware so CORS is outermost and request-id/security headers wrap short-circuit responses
  - exempted preflight `OPTIONS` from rate limiting
  - coerced audit/executions datetime filters with `coerce_utc()`
  - enabled DB `pool_pre_ping`/`pool_recycle`
  - switched production Redis limiter outages to settings-controlled fail-closed behavior
- Plan `253.1-02` completed:
  - auto-rejected edit approvals when targets are missing at apply time
  - aligned orphaned-items overview authz with governance routes
  - replaced `/admin/fix-orphans` random behavior with explicit mapping + `dry_run`
  - restored privileged lifecycle invariants in `PATCH /users/{user_id}`
  - blocked issue reassignment for closed issues
- Plan `253.1-03` completed:
  - fixed dashboard `controls_by_form`
  - clamped quarterly comparison to `min(current_quarter_end, now)`
  - guaranteed `critical_vendors` in committee empty responses
  - normalized queued mutation `202` envelopes across risk/control/KRI edit+delete flows
  - bounded executions pagination and excluded inactive vendors from DORA export
  - updated frontend approval parsing/types and UTC date filter submission
- Plan `253.1-04` completed:
  - changed KRI approval execution to apply-time validation with explicit stale auto-rejects
  - added `backend/scripts/report_pending_kri_approval_preflight.py` for rollout reporting
  - hardened backend/frontend `return_to` sanitization and sanitized server-provided post-login redirects before navigation
  - blocked known weak default secrets in non-debug mode
  - updated deployment/security docs for Redis fail-closed posture and the new KRI preflight step
- Deferred follow-ups explicitly recorded from this phase:
  - evolve auth-route rate-limit keying beyond pure IP+path
  - hard-fail non-Postgres outbox claim behavior under unsafe multi-worker runtime
- Verification completed:
  - `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_rate_limit_components.py ../tests/backend/pytest/test_rate_limit_redis_resilience.py ../tests/backend/pytest/test_runtime_middleware_contracts.py ../tests/backend/pytest/test_security_headers.py ../tests/backend/pytest/test_activity_log.py ../tests/backend/pytest/test_executions.py ../tests/backend/pytest/test_approval_edit_apply.py ../tests/backend/pytest/test_approval_workflow.py ../tests/backend/pytest/test_admin_orphans.py ../tests/backend/pytest/test_orphaned_items_scan_and_stats.py ../tests/backend/pytest/test_users.py ../tests/backend/pytest/test_dashboard.py ../tests/backend/pytest/test_dashboard_committee_vendor_metrics.py ../tests/backend/pytest/test_vendor_reports.py ../tests/backend/pytest/test_kris_submission_rbac_api.py ../tests/backend/pytest/test_approvals.py ../tests/backend/pytest/test_sso_exchange.py ../tests/backend/pytest/test_production_hardening.py ../tests/backend/pytest/test_pending_kri_approval_preflight.py` -> `213 passed`
  - `cd frontend && npm run test:run -- src/services/__tests__/authRedirect.test.ts src/services/__tests__/sessionManager.test.ts src/__tests__/approval_edit_update_handling.spec.ts src/services/__tests__/dashboardApi.committee.test.ts src/components/kri/KRIValueModal.test.tsx src/pages/__tests__/KRIDetailPage.edit-approval.test.tsx src/components/__tests__/KRIForm.edit.test.tsx src/services/__tests__/kriApi.delete.test.ts src/__tests__/approval_ui_rendering.spec.tsx` -> `35 passed`
  - `cd frontend && npx tsc --noEmit` -> passed
- Postgres-targeted verification was attempted with `TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_test@127.0.0.1:55432/riskhub_test`, but the local test instance was unavailable (`connection refused`).

### Phase 253 Professionalization Baseline (2026-04-09)

- The public PR path has been reduced to frontend correctness plus repo/security contracts:
  - `.github/workflows/lint.yml` no longer depends on `docs-topology-consistency`
  - changed-file ratchets, debt budgets, cleanup audits, suppression budgets, and lint-ratchet docs moved to `.github/workflows/maintenance-governance.yml`
- Backend bootstrap has been collapsed into `backend/app/main.py`; `bootstrap.py`, `bootstrap_app.py`, `bootstrap_runtime.py`, and `bootstrap_validation.py` were deleted.
- Approval resolution now routes through one public orchestration entrypoint in `backend/app/services/approval_execution_service.py`.
- Frontend route-entry pages are being standardized to default exports, and auth/session state now lives under `frontend/src/services/session/`.
- Current discrepancy to keep visible:
  - `make -f scripts/Makefile docs-topology-consistency` is still red on structure metrics drift and is now maintainer-facing rather than part of the PR path.

### Architecture and Governance Closure Baseline (2026-04-06)

- Baseline verification before the new closure loops:
  - `python3 scripts/check_docs_contract.py` -> passed
  - `make -f scripts/Makefile docs-topology-consistency` -> passed after reconciling stale structure counts in `.planning/codebase/STRUCTURE.md`
  - `make -f scripts/Makefile test` -> `940 passed, 15 skipped`
  - `TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_test@127.0.0.1:55432/riskhub_test make -f scripts/Makefile test-postgres-ci` -> `11 passed` + `20 passed`
  - `cd frontend && npm run test:run` -> `83 files passed`, `290 tests passed`
  - `cd frontend && npm run lint && npx tsc --noEmit && npm run build && npm run quality:debt -- --report-json && node scripts/quality/validate-debt-budget-report.mjs && npm run cleanup:deadcode && node scripts/cleanup/validate-unreachable-report.mjs && node scripts/quality/validate-no-inline-styles.mjs` -> all passed
- Finding ledger for the 30-item architecture/governance review:

| Finding | Disposition | Notes |
|---|---|---|
| 1 | fix now | SQLite outbox semantics still diverge from Postgres on claim behavior. |
| 2 | fix now | Frontend session/auth authority is still split across multiple stores/helpers. |
| 3 | fix now | Config implementation is still too centralized even though section models now exist. |
| 4 | fix now | Outbox dispatcher still retries broad unclassified exceptions. |
| 5 | fix now | `outbox/handlers.py` is still accumulating multi-domain responsibilities. |
| 6 | fix now | `rate_limit.py` still mixes policy, backend, fallback, and response concerns. |
| 7 | fix now | Fast parity auditing remains non-blocking and does not protect PRs. |
| 8 | fix now | `run_release_parity_audit.py` remains a monolith and should be split with the governance pass. |
| 9 | fix now | CI/workflow orchestration still duplicates some contract logic outside canonical validators. |
| 10 | drop/reword | Reworded to one remaining shell-gate cleanup, not a broad `lint.yml` structural defect. |
| 11 | fix now | Container security scanning still misses relevant PR paths. |
| 12 | fix now | Broad trusted proxies still warn instead of failing closed in production. |
| 13 | fix now | Graph/MSAL boundary still uses an over-broad catch classification. |
| 14 | fix now | Graph cache identity still depends on full secret/private-key material. |
| 15 | fix now | Compatibility facades remain active and need migration/removal discipline. |
| 16 | defer | Postgres should become a broader oracle later, but current blocking Postgres CI coverage is already in place. |
| 17 | fix now | Startup smoke is still too shallow to be a meaningful contract lane. |
| 18 | fix now | Health endpoint still collapses component state to one status string. |
| 19 | fix now | Rate-limit policies remain hardcoded in runtime code instead of typed settings. |
| 20 | fix now | Rate-limit path matching still uses brittle first-prefix semantics. |
| 21 | defer | In-memory limiter memory shape should be tightened during the rate-limit refactor, but it is not a separate first-pass blocker. |
| 22 | fix now | `bootstrapSessionCache` still duplicates session/token semantics. |
| 23 | fix now | `AuthContext` still falls back to bootstrap cache for effective auth/permissions. |
| 24 | fix now | Security tests still permanently encode COOP/COEP absence. |
| 25 | fix now | Several security header assertions should be semantic rather than exact-string contracts. |
| 26 | defer | `scripts/Makefile` breadth is real, but only the touched governance entrypoints should move now. |
| 27 | defer | `graph_directory_auth.py` still does too much, but the first-pass closure focuses on boundary typing and cache identity. |
| 28 | drop/reword | Dropped as a top-level target; `LoginPage.tsx` is no longer a material architecture risk. |
| 29 | fix now | Security/runtime/doc truth still needs stronger single-validator enforcement. |
| 30 | drop/reword | Synthesis only; resolved by closing the concrete items above rather than treating it as a separate defect. |

### Phase 252 Kickoff - Quality Closure Loop (2026-04-06)

- User-directed priority shifted to a new serial remediation phase focused on the surviving current quality issues:
  - audit-log redaction
  - `KRIForm.tsx`
  - `VendorForm.tsx`
  - `IssueDetailPage.tsx`
  - `DashboardPage.tsx`
  - `apiClient.ts`
  - `adminApi.ts`
  - frontend TS safety ratchet
  - scoped backend typing/lint ratchet
  - coverage thresholds
  - duplicated DB default
  - Redis `BaseException`
  - low-priority doc/package/compose polish
- Explicitly out of scope for Phase 252 unless needed for compilation or test repair:
  - `AuthContext` / `useAuth*` / session authority internals
  - `backend/app/core/config.py` / settings architecture
  - broad backend bootstrap reshaping
  - repo-wide backend Ruff class expansion
- Execution model:
  - serial waves only
  - fast-sanity gate first
  - full repo gate only at final closeout
  - each completed wave must add a `252-0X-SUMMARY.md` and update this state file
- Wave `252-00` completed:
  - created Phase 252 roadmap/state/phase scaffolding
  - added README coverage for newly in-scope directories uncovered by docs-topology
  - refreshed `.planning/codebase/STRUCTURE.md` tracked metrics/date after recent repo churn
  - fast sanity verification:
    - `python3 scripts/check_docs_contract.py` -> passed
    - `make -f scripts/Makefile docs-topology-consistency` -> passed
    - `make -f scripts/Makefile test` -> `918 passed, 15 skipped`
    - `cd frontend && npm run test:run` -> `83 files passed`, `290 tests passed`
    - `cd frontend && npm run lint && npx tsc --noEmit && npm run build && npm run quality:debt -- --report-json && node scripts/quality/validate-debt-budget-report.mjs && npm run cleanup:deadcode && node scripts/cleanup/validate-unreachable-report.mjs && node scripts/quality/validate-no-inline-styles.mjs` -> all passed
- Wave `252-01` completed:
  - added a dedicated activity-log redaction policy module
  - switched activity logging to sanitize before truncation and reuse the same sanitized payload for DB and SIEM output
  - redacted sensitive fields, free text, and unknown fields by default while preserving safe structural fields
  - updated admin/operator docs to document redacted audit payload behavior
  - verification:
    - `cd backend && ./venv/bin/python -m pytest -q ../tests/backend/pytest/test_activity_log.py ../tests/backend/pytest/test_activity_log_redaction.py ../tests/backend/pytest/test_siem_logging.py` -> `22 passed`
    - `cd backend && TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_test@127.0.0.1:55432/riskhub_test ./venv/bin/python -m pytest -q ../tests/backend/pytest/test_activity_log.py` -> `18 passed`
    - `make -f scripts/Makefile docs-topology-consistency` -> passed
- Wave `252-02` completed:
  - enabled the blocking frontend TS-safety rules and fixed the full measured offender baseline
  - added typed frontend coverage tooling and blocking thresholds (`57/47/47/58`)
  - replaced the old Phase 252 backend slice with changed-file mypy plus changed-file Ruff `UP`/`SIM` ratchets for backend/app Python paths, backed by a git-diff helper with full-tree fallback
  - added backend coverage enforcement with `--cov-fail-under=69`
  - added a non-blocking full-tree backend/app mypy lane and updated CI/workflow contract docs to match the steady-state gates
  - verification:
    - `cd frontend && npm run lint` -> passed
    - `cd frontend && npx tsc --noEmit` -> passed
    - `cd frontend && npm run test:coverage` -> `83 files passed`, `290 tests passed`, coverage `57.02/47.17/47.57/58.67`
    - `cd backend && ./venv/bin/mypy --config-file mypy.ini app/core/activity_logger.py app/core/activity_redaction.py app/bootstrap_runtime.py app/bootstrap_validation.py` -> passed
    - `cd backend && ./venv/bin/ruff check app/core/activity_logger.py app/core/activity_redaction.py app/bootstrap_runtime.py app/bootstrap_validation.py --select UP,SIM` -> passed
    - `make -f scripts/Makefile test` -> `922 passed, 15 skipped`, backend coverage gate passed at `69.90%`
- Wave `252-03` completed:
  - replaced the old `KRIForm.tsx` implementation with a stable façade over a new `frontend/src/components/kri-form/` module set
  - extracted KRI form state, lookups, submit flow, selectors, and step rendering into typed internal modules
  - preserved vendor-context create flow, vendor mismatch handling, and approval-queued edit handling
  - removed raw `console.error` calls from the KRI form path
  - added focused selector/state tests for the new internal modules
  - verification:
    - `cd frontend && npm run test:run -- src/components/__tests__/KRIForm.vendor-context.test.tsx src/components/__tests__/KRIModal.vendor-selection.test.tsx src/pages/__tests__/KRIForms.vendor-context.test.tsx src/__tests__/approval_edit_update_handling.spec.ts src/components/kri-form/kriForm.selectors.test.ts src/components/kri-form/useKriFormState.test.tsx` -> `6 files passed`, `23 tests passed`
    - `cd frontend && npm run lint && npx tsc --noEmit` -> passed

### Phase 252 Expansion - Repo-wide Professional Quality Closure (2026-04-07)

- Phase `252` is widened beyond the original narrow hotspot list and now covers five areas:
  - data and migration safety
  - backend workflow decomposition
  - frontend controller/form decomposition
  - repo professionalism and product-surface artifact hygiene
  - systemic quality gates and test-shape cleanup
- Execution model remains serial and GSD-aligned:
  - research -> analyze -> baseline test capture -> implementation waves
  - each implementation wave follows `analyze -> patch -> review -> targeted test`
  - do not advance while the owning wave is red
- Baseline captured before the first expansion patch:
  - `python3 -m py_compile scripts/tools/generate_pdf.py` -> failed (broken checked-in utility)
  - `node --check frontend/generate_pdf.js` -> failed (broken checked-in utility)
  - `make -f scripts/Makefile docs-topology-consistency` -> failed on missing README coverage for newly added directories
  - `cd frontend && npm run test:run` -> `89 files passed`, `305 tests passed`
  - `cd frontend && npm run lint && npx tsc --noEmit && npm run build && npm run quality:debt -- --report-json && node scripts/quality/validate-debt-budget-report.mjs && npm run cleanup:deadcode && node scripts/cleanup/validate-unreachable-report.mjs && node scripts/quality/validate-no-inline-styles.mjs` -> failed on service query-param typing
  - `make -f scripts/Makefile test` -> failed on pre-existing KRI submission/correction regressions plus tracked-ignored-path hygiene drift
  - Postgres contract lane unavailable locally at baseline time (`127.0.0.1:55432` not listening)
- Wave `252-10` completed:
  - expanded Phase 252 planning/context to reflect the broader five-area closure scope
  - removed broken checked-in PDF helper utilities from tracked product/reviewer surfaces
  - retired placeholder static docs under `frontend/public/docs/` in favor of the canonical docs-reader pipeline
  - removed the giant tracked `docs/reference/file_list.txt` archive inventory from the live repo surface
  - repaired README coverage for the new KRI/activity-log component test directories
  - hardened repo hygiene contracts so the retired artifact surfaces cannot be reintroduced silently
  - fixed frontend service query-param typing regressions introduced by the newer stricter client contract
  - verification:
    - `make -f scripts/Makefile docs-topology-consistency`
    - `bash -n scripts/install.sh scripts/compose.sh scripts/dev.sh scripts/deploy.sh`
    - `python3 -m py_compile backend/scripts/migrate_controls.py backend/scripts/migrate_kris.py backend/scripts/migrate_risks.py backend/scripts/seed_users.py backend/scripts/seed_demo.py`
    - `cd frontend && npm run test:run`
    - `cd frontend && npm run lint && npx tsc --noEmit && npm run build && npm run quality:debt -- --report-json && node scripts/quality/validate-debt-budget-report.mjs && npm run cleanup:deadcode && node scripts/cleanup/validate-unreachable-report.mjs && node scripts/quality/validate-no-inline-styles.mjs`
- Wave `252-11` completed:
  - added `make -f scripts/Makefile quality-repo-contracts` to enforce startup/deploy shell syntax, migration/seed script syntax, and repo hygiene contracts in one fast local gate
  - expanded `make -f scripts/Makefile verify` so repo artifact/script syntax drift is part of the default fast verification path
  - wired the new repo-contract gate into the blocking GitHub lint workflow and uploaded its evidence alongside the other lint artifacts
  - updated the testing/scripts docs to document the hardened gate as part of the normal verification matrix
  - verification:
    - `make -f scripts/Makefile quality-repo-contracts`
    - `make -f scripts/Makefile verify`
    - `make -f scripts/Makefile docs-topology-consistency`
- Wave `252-12` completed:
  - replaced the legacy workbook migration scripts with explicit `--input` / dry-run / `--apply` / `--allow-reset` / `--report` contracts
  - corrected risk import so non-reset apply matches exact normalized `(process, subprocess, name)` instead of workbook-generated `risk_id_code`
  - restored the canonical risk workbook mapping of column `F -> name` and column `G -> description`
  - preserved existing `risk_id_code` values for matched risks and generated new non-reset risk codes via the canonical `generate_risk_id_code(...)` helper
  - made control import upsert by normalized control name and rebuild links per imported control instead of clearing the full controls table by default
  - removed the KRI migration script's random fallback and made unmatched rows fail closed with JSON reporting
  - added focused backend regression tests covering dry-run non-destructiveness, risk row reordering/insertion safety, duplicate/ambiguous risk identity failure, control upsert behavior, and unmatched-KRI fail-closed behavior
  - updated `backend/scripts/README.md` so the new import-safety contract is documented for operators
  - verification:
    - `python3 -m py_compile backend/scripts/import_contracts.py backend/scripts/migrate_risks.py backend/scripts/migrate_controls.py backend/scripts/migrate_kris.py`
    - `cd backend && pytest -q ../tests/backend/pytest/test_import_migration_contracts.py`
    - `cd backend && pytest -q ../tests/backend/pytest/test_repo_hygiene_contracts.py`
    - `uvx ruff check backend/scripts/import_contracts.py backend/scripts/migrate_risks.py backend/scripts/migrate_controls.py backend/scripts/migrate_kris.py tests/backend/pytest/test_import_migration_contracts.py`
- Wave `252-04` completed:
  - replaced `VendorForm.tsx` with a stable facade over the new `frontend/src/components/vendor-form/` module set
  - extracted vendor lookups, local form state, submit/payload mapping, and section rendering into typed internal modules
  - preserved process/subprocess suggestions, owner-to-department autofill, and existing vendor create/update payload behavior
  - added focused Vendor form behavior and payload regression coverage
  - verification:
    - `cd frontend && npm run test:run -- src/components/__tests__/VendorForm.test.tsx src/components/__tests__/VendorForm.payloads.test.ts` -> `2 files passed`, `4 tests passed`
    - `cd frontend && npm run lint && npx tsc --noEmit` -> passed
- Wave `252-05` completed:
  - replaced `IssueDetailPage.tsx` with a stable route facade over typed hooks, tabs, and formatter helpers
  - extracted issue detail loading/history fetching into bounded hooks and split overview/workflow/history rendering into dedicated modules
  - preserved the existing route contract and human-readable “Unknown risk” fallback behavior
  - verification:
    - `cd frontend && npm run test:run -- src/pages/__tests__/IssueDetailPage.tabs.test.tsx` -> `1 file passed`, `2 tests passed`
    - `cd frontend && npm run lint && npx tsc --noEmit` -> passed
- Wave `252-06` completed:
  - reduced `DashboardPage.tsx` to a route facade over extracted dashboard state, stat-card helpers, navigation/export helpers, and presentation sections
  - preserved overview-query behavior, committee view switching, and dashboard export/drilldown behavior
  - added focused dashboard stats regression coverage
  - verification:
    - `cd frontend && npm run test:run -- src/pages/__tests__/DashboardPage.overview.test.tsx src/pages/dashboard/dashboardStats.test.ts` -> `2 files passed`, `2 tests passed`
    - `cd frontend && npm run lint && npx tsc --noEmit` -> passed
- Wave `252-07` completed:
  - decomposed `apiClient.ts` and `adminApi.ts` behind stable public imports by creating bounded internal service modules under `frontend/src/services/api/` and `frontend/src/services/admin/`
  - preserved `401` retry handling, blob download behavior, UI message-key mapping, and the current admin API surface consumed by the frontend
  - added focused service request-builder and error-path coverage
  - verification:
    - `cd frontend && npm run test:run -- src/services/__tests__/apiClient.401-recovery.test.ts src/services/__tests__/apiClient.errors.test.ts src/services/__tests__/apiClient.requestBuilder.test.ts src/pages/admin-console/__tests__/AdminConsoleOpsPanels.outbox.test.tsx src/pages/__tests__/UsersPage.sso-cta.test.tsx` -> `5 files passed`, `12 tests passed`
    - `cd frontend && npm run lint && npx tsc --noEmit` -> passed
- Wave `252-08` completed:
  - deduplicated the default DB URL constant by making `bootstrap_validation.py` consume the canonical value from `app.core.settings.database`
  - replaced the Redis ping `BaseException` catch in `bootstrap_runtime.py` with `Exception`
  - replaced the placeholder `backend/app/core/README.md`, gave `frontend/package.json` a real package identity, clarified `docker-compose.yml` as the local demo/dev topology, and repaired dashboard-test README coverage
  - verification:
    - `cd backend && pytest -q ../tests/backend/pytest/test_log_rotation_config.py ../tests/backend/pytest/test_production_hardening.py ../tests/backend/pytest/test_bootstrap_split_contracts.py` -> `23 passed`
    - `cd frontend && npm run lint && npx tsc --noEmit` -> passed
    - `python3 scripts/check_docs_contract.py` -> passed
    - `make -f scripts/Makefile docs-topology-consistency` -> passed
- Wave `252-09` completed:
  - closed the final verification loop after fixing the remaining admin/shell accessibility contrast defects
  - added explicit sidebar active-state CSS so shell contrast no longer depends on theme-specific utility overrides
  - expanded accessibility smoke attachments with violating node targets and failure summaries for faster future diagnosis
  - verified the full Chromium suite against a persistent Vite server after the Playwright-managed web server proved transport-unstable mid-suite
  - marked Phase 252 complete in roadmap/state metadata
  - verification:
    - `python3 scripts/check_docs_contract.py` -> passed
    - `make -f scripts/Makefile docs-topology-consistency` -> passed
    - `make -f scripts/Makefile quality-repo-contracts` -> `19 passed`
    - `make -f scripts/Makefile test` -> `1029 passed, 15 skipped`
    - `TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@127.0.0.1:5432/riskhub_test make -f scripts/Makefile test-postgres-ci` -> `11 passed`, `28 passed`
    - `cd frontend && npm run lint` -> passed
    - `cd frontend && npx tsc --noEmit` -> passed
    - `cd frontend && npm run test:run` -> `94 files passed`, `314 tests passed`
    - `cd frontend && npm run build && npm run quality:debt -- --report-json && node scripts/quality/validate-debt-budget-report.mjs && npm run cleanup:deadcode && node scripts/cleanup/validate-unreachable-report.mjs && node scripts/quality/validate-no-inline-styles.mjs` -> passed
    - `cd frontend && FRONTEND_URL=http://localhost:5173 BACKEND_URL=http://localhost:8000 npx playwright test -c playwright.config.ts --project=chromium --workers=1` -> `219 passed, 41 skipped`
- Post-closeout Phase 252 gap closure (2026-04-07):
  - normalized process-name department planning in `backend/scripts/migrate_risks.py` so case-only and whitespace-only process variants reuse one logical department plan and one department assignment path
  - restored issue-history refresh in `frontend/src/pages/issues/issue-detail/useIssueHistory.ts` so History re-fetches after issue reloads while staying on the same issue ID
  - switched reset-mode risk imports to canonical `generate_risk_id_code(...)` so reset imports and later non-reset/UI-created risks stay in the same `risk_id_code` namespace
  - added regression coverage for mixed-case workbook process imports, reset-mode canonical ID continuity, and issue-detail refresh-driven history reload
  - verification:
    - `cd backend && pytest -q ../tests/backend/pytest/test_import_migration_contracts.py` -> `10 passed`
    - `python3 -m py_compile backend/scripts/migrate_risks.py` -> passed
    - `cd frontend && npm run test:run -- src/pages/__tests__/IssueDetailPage.tabs.test.tsx` -> `1 file passed`, `3 tests passed`
    - `cd frontend && npm run lint && npx tsc --noEmit` -> passed

### Seven-Wave Closure Plan Completion (2026-04-05)

- Closed the remaining CI/runtime/docs parity work from the seven-wave remediation pass:
  - centralized production invariant enforcement behind `backend/app/core/production_contract.py`
  - expanded workflow/image immutability checks across the full workflow directory
  - made frontend Vitest PR-blocking and widened the named Postgres CI contract
  - added a separate production-profile smoke lane while keeping the fast hybrid-dev Playwright lane
  - restored prod-safe config/runtime defaults and narrowed remaining runtime catch-all handling outside the accepted MSAL/outbox boundaries
  - decomposed bootstrap, security middleware, Graph directory integration, and installer production helpers into smaller modules without changing public contracts
- Closed two late browser/runtime regressions discovered during the final verification loop:
  - the new-risk form now resolves a valid risk type from live Risk Hub config instead of assuming the stale hardcoded `operational` default
  - the canonical seed path now reconciles and repairs the default system risk types so `/api/v1/riskhub/public-risk-types` and risk-create validation stay aligned
  - the Playwright E2E runtime now enables scheduler ownership with `SCHEDULER_JOB_PROFILE=outbox_only` so questionnaire notification delivery is exercised through the real outbox path without enabling the unrelated periodic jobs
- Final verification:
  - docs/static/contracts:
    - `python3 scripts/check_docs_contract.py`
    - `make -f scripts/Makefile docs-topology-consistency`
    - `python3 scripts/security/validate_production_contract_docs.py`
    - `python3 scripts/security/validate_workflow_pins.py`
    - `python3 scripts/security/validate_repo_hardening.py`
    - all passed
  - backend full SQLite:
    - `make -f scripts/Makefile test` -> `914 passed, 15 skipped`
  - backend Postgres CI contract:
    - `TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_test@127.0.0.1:55432/riskhub_test make -f scripts/Makefile test-postgres-ci` -> `11 passed` + `20 passed`
  - backend targeted governance/hardening pack:
    - `cd backend && pytest -q ../tests/backend/pytest/test_outbox_approval_flow.py ../tests/backend/pytest/test_security_headers.py ../tests/backend/pytest/test_production_hardening.py ../tests/backend/pytest/test_settings_secret_files.py ../tests/backend/pytest/test_outbound_egress_guards.py ../tests/backend/pytest/test_health.py ../tests/backend/pytest/test_install_script_contracts.py ../tests/backend/pytest/test_workflow_pin_validator.py ../tests/backend/pytest/test_production_contract_docs.py ../tests/backend/pytest/test_seed_risk_types.py` -> `86 passed, 1 skipped`
  - frontend unit:
    - `cd frontend && npm run test:run` -> `83 files passed`, `290 tests passed`
  - frontend static/quality:
    - `cd frontend && npm run lint && npx tsc --noEmit && npm run build && npm run quality:debt -- --report-json && node scripts/quality/validate-debt-budget-report.mjs && npm run cleanup:deadcode && node scripts/cleanup/validate-unreachable-report.mjs && node scripts/quality/validate-no-inline-styles.mjs`
    - all passed
  - browser/runtime:
    - `cd frontend && BACKEND_URL=http://localhost:8000 npx playwright test -c playwright.config.ts --project=chromium --workers=1`
    - `221 passed, 39 skipped`

### Remediation and Documentation Reconciliation Closeout (2026-04-05)

- Restored the public installer wrapper contract after the Python control-plane extraction:
  - `scripts/install.sh` remains the public shell entrypoint
  - `scripts/install_cli.py` + `scripts/install_lib/` now carry the lifecycle implementation
  - production first-run behavior again covers config scaffolding, secret scaffolding/edit flow, placeholder refusal, lifecycle metadata, and non-secret runtime backups
- Completed the final production/runtime hardening follow-up:
  - production CSP no longer permits `style-src 'unsafe-inline'`
  - active frontend inline styles were removed behind shared SVG/swatches/badge primitives
  - repo hardening and no-inline-style validators were added to CI
- Completed settings/runtime cleanup:
  - `Settings` now exposes section models at `settings.auth`, `settings.outbound`, `settings.session`, `settings.redis`, and `settings.protocol_guard`
  - model-level strictness is back on (`extra="forbid"`) with file-backed secret env compatibility preserved
- Reconciled public/operator docs and deployment/security guidance with the current branch behavior:
  - installer wrapper remains public but is now documented as a Python-backed control plane
  - deployment docs now treat production `ALLOWED_HOSTS` as an explicit runtime requirement
  - security docs now describe the modern header baseline and strict production CSP
- Verification:
  - `cd backend && pytest -q ../tests/backend/pytest/test_outbox_approval_flow.py ../tests/backend/pytest/test_entra_confidential_credentials.py ../tests/backend/pytest/test_settings_secret_files.py ../tests/backend/pytest/test_security_headers.py ../tests/backend/pytest/test_production_hardening.py ../tests/backend/pytest/test_outbound_egress_guards.py ../tests/backend/pytest/test_rate_limit_redis_resilience.py ../tests/backend/pytest/test_log_rotation_config.py ../tests/backend/pytest/test_install_script_contracts.py` → `74 passed, 1 skipped`
  - `cd frontend && npm run test:run -- src/services/__tests__/authTimeoutFlow.test.ts src/contexts/__tests__/AuthLogoutFlow.test.tsx src/contexts/__tests__/AuthBootstrapRouteGuard.test.tsx src/pages/__tests__/LoginPage.auth-modes.test.tsx src/pages/__tests__/SsoCallbackPage.test.tsx src/__tests__/login_sso_rendering.spec.tsx src/services/__tests__/apiClient.401-recovery.test.ts` → `28 passed`
  - `cd frontend && npm run lint && npx tsc --noEmit && npm run quality:debt -- --report-json && node scripts/quality/validate-debt-budget-report.mjs && npm run cleanup:deadcode && node scripts/cleanup/validate-unreachable-report.mjs && node scripts/quality/validate-no-inline-styles.mjs` → passed
  - `python3 scripts/security/validate_workflow_pins.py .github/workflows/security.yml .github/workflows/release.yml && python3 scripts/security/validate_repo_hardening.py` → passed

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

### Open Issues Remediation and Regression Hardening - Phase 5 (2026-03-29)

- Extended `GET /api/v1/users/directory` with backend-driven `available_roles` facet metadata so the `/users` directory filter no longer relies on a hardcoded frontend role vocabulary.
- Added a test-only `directory_reader` fixture/client in backend pytest coverage instead of changing seeded product RBAC just to make directory mode manually demoable.
- `/users` directory mode now treats backend role facets as the source of truth for role-filter options while remaining read-only.
- Focused verification:
  - `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend pytest --override-ini addopts='-p no:langsmith_plugin -p no:cacheprovider' tests/backend/pytest/test_users.py tests/backend/pytest/test_directory_lookup.py tests/backend/pytest/test_directory_import.py -q` -> `34 passed`
  - `cd frontend && npm run test:run -- src/pages/__tests__/UsersPage.modes.test.tsx src/pages/__tests__/UsersPage.sso-cta.test.tsx` -> `11 passed`
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
    - `UserDetailPage` references outside active code are historical/generated artifacts (`frontend/i18n-audit/*`, `tests/results/*`)
- Demo-account `/users` verification against the rebuilt branch runtime (`http://localhost`):
  - `admin@riskhub.local` (`System Admin`) -> `/users` stayed in access-management mode, loaded `/api/v1/access/users`, showed `Check AD` + `Add from AD`, and exposed 18 row action buttons; opening access edit showed one email input, confirming admin identity editing stayed on `/users`
  - `cro@riskhub.local` (`Anna Kowalski`) -> `/users` stayed in access-management mode, loaded `/api/v1/access/users`, showed 9 row edit actions only, and exposed zero email inputs in the access edit modal, confirming CRO access-only editing without lifecycle controls
  - `risk.manager@riskhub.local` (`Petra Svobodová`) -> `/users` stayed in the global access-management view via `/api/v1/access/users` with zero row actions
  - `ops.head@riskhub.local` (`Eva Králová`) -> `/users` stayed in department access mode via `/api/v1/access/users/my-department` with two visible rows and zero row actions
  - `ops.analyst@riskhub.local` (`Jana Horáková`) -> direct `/users` access redirected to `/`; this supersedes the earlier provisional Phase 2 note that the analyst demo account looked like a directory-mode user
  - current seeded demo matrix therefore has no canonical directory-only actor; directory mode remains a supported contract but requires explicit API/unit/browser coverage rather than manual demo-account verification until product intentionally seeds a non-access-view `users:read` role
- Residual runtime observations discovered during Phase 5:
  - password-mode `/users` originally still rendered both `Add from AD` and `Add user`; the current branch now aligns the page with the intended auth-mode-specific CTA contract and keeps password mode on the direct `Add user` lifecycle path

### Open Issues Remediation and Regression Hardening - Phase 6 (2026-03-29)

- Completed the explicit compatibility audit for the tightened lifecycle helpers:
  - no active in-repo frontend/runtime consumer still depends on `GET /api/v1/users/{id}` or `GET /api/v1/users/roles`
  - the remaining live `/users/{id}` consumer is the Admin-only PATCH used for access-management status toggles on `/users`
  - remaining references are backend tests, active docs that describe the admin-only helper contract, or historical/generated artifacts
  - external compatibility risk still exists because both endpoints remain discoverable public API surfaces even though the repo no longer uses them for non-admin flows
- Re-ran the repaired stack and deterministic verification substrate:
  - `./scripts/compose.sh reset --dataset test`
  - `docker compose -f docker-compose.yml --profile full run --rm bootstrap python -c "import psycopg2"` -> success
  - preflight remained healthy:
    - `curl -fsS http://localhost:8000/api/v1/health`
    - `curl -fsS http://localhost:8000/api/v1/auth/config`
    - `curl -I -fsS http://localhost/login`
  - recreated isolated Postgres test database:
    - `docker exec riskhub-db psql -U riskhub -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS riskhub_test;" -c "CREATE DATABASE riskhub_test OWNER riskhub;"`
  - reran Postgres marker suite:
    - `cd backend && TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test pytest -m postgres -v` -> `5 passed, 800 deselected`
  - reran full backend pytest:
    - `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend pytest --override-ini addopts='-p no:langsmith_plugin -p no:cacheprovider' tests/backend/pytest -q` -> `796 passed, 9 skipped`
  - reran full frontend regression:
    - `cd frontend && npm run test:run` -> `79 passed (79 files), 269 passed (269 tests)`
    - `cd frontend && npx tsc --noEmit`
- Hardened the shared Docker/local demo-login helper again in `tests/frontend/e2e/helpers/login.ts`:
  - the helper now waits for auth/preferences hydration before asserting the authenticated shell, which removes the earlier false timeout where the app was still on the protected-route `Loading...` screen
- Browser verification after the helper hardening:
  - targeted Docker polish rerun passed:
    - `cd frontend && FRONTEND_URL=http://localhost POLISH_AUDIT_DEEP=1 npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/polish-audit.spec.ts --project=chromium --grep "RISK_MANAGER / theme=riskhub / lang=en"` -> `1 passed`
  - targeted Docker access-scope rerun moved beyond login bootstrap:
    - `cd frontend && FRONTEND_URL=http://localhost npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/access-scope.spec.ts --project=chromium --grep "GLOBAL user can view cross-department risk detail|DEPARTMENT user direct department access denied for other departments"` -> `1 passed, 1 failed`
    - the remaining failure is no longer in the login helper; it now times out in `tests/frontend/e2e/pages/RisksPage.ts` waiting for a `/api/v1/risks` response even though the filtered risk table is already rendered, which points at existing page-object synchronization debt in the broader business-logic suite rather than a remaining users-surface/auth-bootstrap contract failure
  - the full Docker-targeted `cd frontend && FRONTEND_URL=http://localhost npm run e2e:business-logic` lane still surfaces broader access-scope/browser-suite instability under parallel load, so the residual E2E blocker is now test-harness debt, not the original `localhost:5173` origin mismatch
- No product-side `/users` behavior changed in Phase 6; the Phase 5 live demo-account `/users` matrix remains the current runtime record for Admin, CRO, Risk Manager, department head, and analyst behavior on this repaired branch.

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
  - backend artifact root: `tests/results/backend/coverage_html`
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
  - `docs/security/reports/pre-release-deploy-install-audit-2026-03-17.md`
- Review artifact root:
  - `tests/results/pre-release-deploy-install-review-20260317T143939Z`
- Supporting parity artifacts:
  - `tests/results/release-parity-audit-20260317T143939Z-skip`
  - `tests/results/release-parity-audit-20260317T143939Z-full`
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
  - `tests/results/release-parity-audit-20260222-130000`
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
- Finalized Phase `500` / `501` closeout reconciliation for the wrapper-first installer control plane, production `ALLOWED_HOSTS` requirements, CI gate notes, and operator deployment parity already reflected in roadmap follow-up sections (2026-04-05).
- Executed approval-auth and SSO challenge hardening: delete-request authorization now mirrors underlying delete routes, backend-issued SSO challenge flow is mandatory for exchange, and production/operator docs were verified in sync (2026-04-06).
- Executed ownership reference validation hardening across risk/control/KRI create-update and approval-apply paths, with focused backend regression coverage for nonexistent and inactive assignees (2026-04-06).
- Added explicit reporting-owner `risks:read` regression coverage proving reporting ownership does not bypass base KRI/risk read permission gates (`4` focused tests; ownership validation suite green) (2026-04-06).
- Expanded Phase `252` to the repo-wide professional quality closure scope and completed Wave `252-10` for artifact hygiene, README coverage repair, and frontend query-param typing fixes (2026-04-07).

### Next Step

- Resume next open roadmap item for Phase `17` (Production Deployment hardening + runbook verification).

---

*Updated: 2026-04-07*
