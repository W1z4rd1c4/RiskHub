# RiskHub Architecture Cleanup Implementation Log

## Pre-flight Baseline

- Started: 2026-05-09
- Baseline SHA: `18f42150980d998c2454bc0b5ab8027ebfee2138`
- Branch: `main`
- Plan: `.planning/audits/resolution-plan.md`
- Status: in progress

### Baseline Gates

- `git status --short --branch`: clean at baseline capture
- `make -f scripts/Makefile test-architecture-locks`: passed (`65 passed`, 1 snapshot passed)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `pytest -m contract`: passed under backend venv activation (`109 passed`, `1708 deselected`, 1 warning)
- `ruff check backend/app`: passed under backend venv activation (`All checks passed!`)
- `mypy backend/app`: baseline captured under backend venv activation (`8 errors in 6 files`)

### Baseline Environment Notes

- Default shell `pytest` resolved to system Python 3.13 and failed importing `syrupy`.
- Backend venv pytest resolved to `backend/venv/bin/pytest` and passed the contract gate.
- Default shell had no `ruff`; backend venv provided `ruff`.
- Baseline mypy error count for delta tracking: 8.

## Wave 1 — ADRs Ratified

- Completed: 2026-05-09 19:41:11 CEST
- Commit SHA: recorded by the Wave 1 commit containing this entry
- Items completed: `#72`, `#73`, `#74a`, `#10`
- Items failed: none
- Elapsed time: current session wave execution

### Phase 4 Corrections Honored

- `#74a`: used `_bounded_context_cross_cutting.toml`, not a `core` registry.
- `#74a`: paired `_orphaned_items` and `_notification_inbox` with `_identity_access_lifecycle`.
- `#73`: removed duplicate `REPORTING_GRACE_DAYS = 15` from `_config/lookup.py` and kept `_kri_history/constants.py` as SSOT.
- `#10`: corrected the frontend caller path to `frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx`.

### Gate Results

- `make -f scripts/Makefile test-architecture-locks`: passed (`84 passed`, 1 snapshot passed)
- `pytest -m contract`: passed under backend venv activation (`128 passed`, `1708 deselected`, 1 warning)
- `pytest tests/backend/pytest -m "not postgres and not benchmark" -x`: passed (`1803 passed`, `3 skipped`, `30 deselected`, 17 warnings)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `ruff check backend/app`: passed
- `mypy backend/app`: baseline delta clean (`8 errors in 6 files`, unchanged from baseline)
- Frontend gates: not run; Wave 1 did not edit frontend files

## Wave 2 — P1/P2 Cleanup

- Completed: 2026-05-09 20:21:52 CEST
- Commit SHA: recorded by the Wave 2 commit containing this entry
- Items completed: `#57`, `#37`, `#12`, `#13`, `#1`, `#19`, `#11`, `#14`, `#15`, `#76`
- Items failed: none
- Elapsed time: current session wave execution

### Phase 4 Corrections Honored

- `#37`: completed before `#12` so the shell summary capability extraction landed before exception tightening.
- `#13`: removed `vendor_link_helpers.py` citations from the authorization contract artifacts.
- `#19`: used the current `_entity_mutation_lifecycle.policy.validate_risk_type` helper instead of the stale recipe path.
- `#14`: removed the live `endpoints/issues/_shared/notifications.py` in-process helper and kept outbox emitters as the only notification path.
- `#15`: used the current capability catalog `id`/`fields` shape and made `access_user.capabilities` required across backend and frontend contracts.
- `#76`: kept the auth-flow endpoint commit cleanup inside the Wave 2 commit despite the recipe's internal multi-commit note.

### Gate Results

- `make -f scripts/Makefile test-architecture-locks`: passed (`100 passed`, 1 snapshot passed)
- `pytest -m contract`: passed under backend venv activation (`144 passed`, `1724 deselected`, 1 warning)
- `pytest tests/backend/pytest -m "not postgres and not benchmark" -x`: passed (`1835 passed`, `3 skipped`, `30 deselected`, 17 warnings)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `ruff check backend/app`: passed
- `mypy backend/app`: baseline delta clean (`8 errors in 6 files`, unchanged from baseline)
- `cd frontend && npx tsc --noEmit`: passed
- `cd frontend && npm run test:run`: passed (`163 passed`, `734 tests passed`)
- `cd frontend && npm run lint`: passed
- Fix-forward attempts: 1; the first frontend unit gate exposed stale access-user fixtures that still omitted required capability fields, then the full gate was restarted and passed.

## Wave 3 — P2 Dead-Code A

- Completed: 2026-05-09 21:03:31 CEST
- Commit SHA: recorded by the Wave 3 commit containing this entry
- Items completed: `#2`, `#3`, `#4`, `#5`, `#6`, `#7`, `#41`, `#50`, `#52`, `#53`, `#54`, `#75`, `#18`, `#20`
- Items failed: none
- Elapsed time: current session wave execution

### Phase 4 Corrections Honored

- `#2`: used the live issue source-validation aliases instead of stale line references.
- `#3` / `#4` / `#5` / `#6`: added frontend absence locks and updated the frontend architecture audit context.
- `#7`: updated backend endpoint context after removing the approval department shim.
- `#41`: repointed endpoint serialization barrels to the canonical issue-register functions.
- `#50`: removed `_kri_history/submission.py` from authorization contract artifacts.
- `#52`: updated the architecture-deepening contract for deleted KRI correction-plan facade.
- `#53`: used direct issue-workflow execution imports and deleted both facade modules.
- `#54`: rewrote approval-queue deepening locks to assert direct queue-module exports.
- `#75`: consolidated the KRI auto-reject helper in `_approval_execution.results`.
- `#18`: locked approval read response parity and repointed endpoints to `_approval_queue.projection`.
- `#20`: kept the risk ID package re-export stable and documented it as load-bearing.

### Gate Results

- `make -f scripts/Makefile test-architecture-locks`: passed (`113 passed`, 1 snapshot passed)
- `pytest -m contract`: passed under backend venv activation (`163 passed`, `1726 deselected`, 1 warning)
- `pytest tests/backend/pytest -m "not postgres and not benchmark" -x`: passed (`1856 passed`, `3 skipped`, `30 deselected`, 17 warnings)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `ruff check backend/app`: passed
- `mypy backend/app`: baseline delta clean (`8 errors in 6 files`, unchanged from baseline)
- `cd frontend && npx tsc --noEmit`: passed
- `npm run -w tests/frontend/unit test -- --run`: runbook command failed before tests (`ENOENT` for missing root `package.json`); equivalent repo command `cd frontend && npm run test:run` passed (`167 passed`, `737 tests passed`)
- `npm run -w tests/frontend/unit lint`: runbook command failed before lint (`ENOENT` for missing root `package.json`); equivalent repo command `cd frontend && npm run lint` passed

## Wave 4 — Boundary Facade Cleanup

- Completed: 2026-05-09 22:05:05 CEST
- Commit SHA: recorded by the Wave 4 commit containing this entry
- Items completed: `#21`, `#25`, `#26`, `#29`, `#33`, `#36`, `#35`, `#48`, `#64`, `#47`, `#22`, `#23`, `#55`, `#24`, `#51`, `#56`, `#61`
- Items failed: none
- Elapsed time: current session wave execution

### Phase 4 Corrections Honored

- `#55`: removed `access_user_service.py` and reconciled authorization contract validator data with the `usePermissions` deletion.
- `#24` + `#51`: landed atomically, repointed all KRI linked-vendor/value-application imports to `_kri_history.direct_application`, and stripped deleted citations from contract artifacts.
- `#56` + `#61`: landed atomically, used the corrected 13-name directory identity surface, moved Graph directory modules into `_graph_directory/`, and updated directory lifecycle contract paths.
- Frontend root npm workspace commands are still invalid in this repo because there is no root `package.json`; supported `frontend/` commands were used for effective validation.

### Gate Results

- `make -f scripts/Makefile test-architecture-locks`: passed (`132 passed`, 1 snapshot passed)
- `pytest -m contract`: passed under backend venv activation (`185 passed`, `1735 deselected`, 1 warning)
- `pytest tests/backend/pytest -m "not postgres and not benchmark" -x`: passed (`1887 passed`, `3 skipped`, `30 deselected`, 17 warnings)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `ruff check backend/app`: passed
- `mypy backend/app`: baseline delta clean (`8 errors in 6 files`, unchanged from baseline)
- `cd frontend && npx tsc --noEmit`: passed
- `npm run -w tests/frontend/unit test -- --run`: runbook command failed before tests (`ENOENT` for missing root `package.json`); equivalent repo command `cd frontend && pnpm vitest run ../tests/frontend/unit/src` passed (`180 files`, `775 tests passed`)
- `npm run -w tests/frontend/unit lint`: runbook command failed before lint (`ENOENT` for missing root `package.json`); equivalent repo command `cd frontend && pnpm lint` passed

## Wave 5 — Integration Cleanup

- Completed: 2026-05-09 23:00:48 CEST
- Commit SHA: recorded by the Wave 5 commit containing this entry
- Items completed: `#74b`, `#17`, `#49`, `#59`, `#9`, `#34`, `#27`, `#8`, `#28`, `#30`, `#16`, `#38`, `#31`, `#43`, `#44`
- Items failed: none
- Elapsed time: current session wave execution

### Phase 4 Corrections Honored

- `#34`: kept `can_resolve_approvals` canonical to policy/permissions, extracted `approval_privilege_tier`, and updated authz contract artifacts.
- `#8`: added `_issue_workflow.assignment` as the owner-validation home and updated contract sensitive paths for the new policy surface.
- `#16`: removed the legacy `/excel` tombstones while preserving `excel_export_removed` on `/export?format=xlsx`.
- `#38`: renamed `RiskFilters` to `BatchSendRiskFilters` and verified the frontend Zod mirror by running `cd frontend && npx tsc --noEmit`.
- `#43`: kept all 37 audit adapter functions at module scope and added the AST lock requiring `safe_entity_label=` on `emit_adapter` calls.
- `#44`: modeled `risk_questionnaires` as a dual-router module with both routes under the `questionnaires` tag, and matched the registry lock to current mounted route prefixes.

### Gate Results

- `make -f scripts/Makefile test-architecture-locks`: passed (`165 passed`, 1 snapshot passed)
- `pytest -m contract`: passed under backend venv activation (`226 passed`, `1740 deselected`, 1 warning)
- `pytest tests/backend/pytest -m "not postgres and not benchmark" -x`: passed (`1933 passed`, `3 skipped`, `30 deselected`, 17 warnings)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `ruff check backend/app`: passed
- `mypy backend/app`: baseline delta clean (`8 errors in 6 files`, unchanged from baseline)
- Frontend gates: not run at wave end; Wave 5 did not edit frontend files. Item `#38` frontend type sanity passed with `cd frontend && npx tsc --noEmit`.

## Wave 6a — Frontend Query and Vendor Ownership Cleanup

- Completed: 2026-05-09 23:45:13 CEST
- Commit SHA: recorded by the Wave 6a commit containing this entry
- Items completed: `#42`, `#58`, `#63`, `#46`, `#65`, `#67`, `#32/#6S`, `#62`, `#77a`, `#45a`
- Items failed: none
- Elapsed time: current session wave execution

### Phase 4 Corrections Honored

- `#42`: consolidated outbox actor payload inheritance in the canonical payload module and kept the Postgres-only outbox atomicity assertion skipped under SQLite.
- `#58`: removed both orphaned-item service facades and repointed endpoint, scheduler, script, and test imports to `_orphaned_items`.
- `#63`: added scheduler-run instrumentation inside the outbox dispatcher with service-owned transaction handling.
- `#46`: replaced inline frontend query-key arrays with typed query-key factories across the touched surfaces.
- `#65`: added the flat CRUD capability parser and reconciled authorization contract artifacts for the architecture-only capability surface.
- `#67`: extracted `useResourcePanelQuery` and kept the RiskHub config hook as a thin compatibility wrapper.
- `#32/#6S`: collapsed vendor linked risk/control/KRI tab behavior into the shared `useVendorLinkedEntities` and `VendorLinkedEntitiesTab` surface.
- `#62`: moved KRI vendor assignment into `_vendor_links.kri_assignment` and routed create/delete auditing through the canonical vendor-link service.
- `#77a`: made frontend vendor status tolerance optional ahead of the forward-only Wave 8 migration.
- `#45a`: added ownership characterization tests with local fixtures because the recipe's named fixtures were not present in the repository.

### Gate Results

- `make -f scripts/Makefile test-architecture-locks`: passed (`173 passed`, 1 snapshot passed)
- `pytest -m contract`: passed under backend venv activation (`262 passed`, `1740 deselected`, 1 warning)
- `pytest tests/backend/pytest -m "not postgres and not benchmark" -x`: passed (`1969 passed`, `3 skipped`, `30 deselected`, 17 warnings)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `ruff check backend/app`: passed
- `cd backend && ./venv/bin/mypy app`: passed (`no issues found in 587 source files`)
- `mypy backend/app`: baseline delta clean (`8 errors in 6 files`, unchanged from baseline)
- `cd frontend && npx tsc --noEmit`: passed
- `npm run -w tests/frontend/unit test -- --run`: runbook command failed before tests (`ENOENT` for missing root `package.json`); equivalent repo command `cd frontend && pnpm test:run` passed (`191 files`, `855 tests passed`)
- `npm run -w tests/frontend/unit lint`: runbook command failed before lint (`ENOENT` for missing root `package.json`); equivalent repo command `cd frontend && pnpm lint` passed

## Wave 6b — Capability and Admin Cleanup

- Completed: 2026-05-10 00:10:41 CEST
- Commit SHA: recorded by the Wave 6b commit containing this entry
- Items completed: `#39`, `#40`, `#66`
- Items failed: none
- Elapsed time: current session wave execution

### Phase 4 Corrections Honored

- `#39`: replaced the literal admin capability stub with `build_admin_capabilities`, added backend/Zod/catalog parity coverage, and registered `AdminConsoleCapabilities` in the capability catalog.
- `#40`: split the seven verified `console.py` routes into `system_status`, `operational_logs`, and `sessions` clusters while preserving URL paths; retained `console.py` only as an empty compatibility module and registered it as reserved.
- `#66`: split frontend auth state into `SessionContext`, `PreferencesContext`, and `AuthActionsContext`, kept `useAuth()` as the compatibility surface, and added the mandated render-counter test for preference mutations not re-rendering session consumers.

### Gate Results

- `make -f scripts/Makefile test-architecture-locks`: passed (`178 passed`, 1 snapshot passed)
- `pytest -m contract`: passed under backend venv activation (`272 passed`, `1740 deselected`, 1 warning)
- `pytest tests/backend/pytest -m "not postgres and not benchmark" -x`: passed (`1979 passed`, `3 skipped`, `30 deselected`, 17 warnings)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `ruff check backend/app`: passed
- `cd backend && ./venv/bin/mypy app`: passed (`no issues found in 591 source files`)
- `mypy backend/app`: baseline delta clean (`8 errors in 6 files`, unchanged from baseline)
- `cd frontend && npx tsc --noEmit`: passed
- `npm run -w tests/frontend/unit test -- --run`: runbook command failed before tests (`ENOENT` for missing root `package.json`); equivalent repo command `cd frontend && pnpm test:run` passed (`194 files`, `859 tests passed`)
- `npm run -w tests/frontend/unit lint`: runbook command failed before lint (`ENOENT` for missing root `package.json`); equivalent repo command `cd frontend && pnpm lint` passed
- Fix-forward attempts: 2; first the contract gate exposed a stale admin telemetry architecture lock still inspecting `admin.console`, then the validator required auth/session contract coverage for the new `SessionContext` local permission helper.

## Wave 7 — Ownership, Dashboard, Approvals, and Session Cleanup

- Completed: 2026-05-10 00:41:45 CEST
- Commit SHA: recorded by the Wave 7 commit containing this entry
- Items completed: `#45b`, `#68`, `#60`, `#71`
- Items failed: none
- Elapsed time: current session wave execution

### Phase 4 Corrections Honored

- `#45b`: generated the ownership resolver helpers through a factory while preserving KRI archived-target asymmetry.
- `#68`: introduced `WidgetShell`, scoped dashboard filter selectors, and render-counter coverage for selector isolation.
- `#60`: routed approvals endpoints through `PrivilegeContext` while keeping the approval-specific tier calculation explicit.
- `#71`: merged the frontend session service into four modules while preserving module-scope single-flight refresh, cooldown, bootstrap, and storage semantics.

### Gate Results

- `make -f scripts/Makefile test-architecture-locks`: passed (`178 passed`, 1 snapshot passed)
- `pytest -m contract`: passed under the root backend venv command (`278 passed`, `1740 deselected`, 1 warning)
- `pytest tests/backend/pytest -m "not postgres and not benchmark" -x`: passed (`1985 passed`, `3 skipped`, `30 deselected`, 17 warnings)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `ruff check backend/app`: passed
- Focused touched backend mypy: passed
- `mypy backend/app`: baseline delta clean (`8 errors in 6 files`, unchanged from baseline)
- `cd frontend && npx tsc --noEmit`: passed
- `npm run -w tests/frontend/unit test -- --run`: runbook command failed before tests (`ENOENT` for missing root `package.json`); equivalent repo command `cd frontend && pnpm test:run` passed (`201 files`, `879 tests passed`)
- `npm run -w tests/frontend/unit lint`: runbook command failed before lint (`ENOENT` for missing root `package.json`); equivalent repo command `cd frontend && pnpm lint` passed
- Fix-forward attempts: 1; the frontend full suite exposed a stale partial mock for `@/services/session/coordinator` in `apiClient.401-recovery.test.ts`, then passed after the mock included `clearAuthenticatedSession`.

## Wave 8 — Vendor Migration and Status Cleanup

- Completed: 2026-05-10 01:21:22 CEST
- Commit SHA: recorded by the Wave 8 commit containing this entry
- Items completed: `#69`, `#70`, `#77b`
- Items failed: none
- Elapsed time: current session wave execution

### Phase 4 Corrections Honored

- `#69/#70`: implemented the forward-only ADR-010 vendor migration, removed `Vendor.status`, added the shared vendor-link mixin, converted vendor/risk/control/KRI link foreign keys to cascade deletes, and kept `downgrade()` as `NotImplementedError`.
- `#69/#70`: added the required migration rehearsal coverage for cascade constraints, forward-only behavior, idempotency, concurrent writes, orphan precheck, and partial-failure rollback behavior; the optional pre-migration database setup remains blocked locally by historical revision `514f30f4b0c9`.
- `#77b`: removed `Vendor.status` from frontend types, Zod schemas, vendor-list query params, vendor form payloads, KRI vendor projections, and vendor page status display logic; frontend display now derives active/inactive from `is_archived`.
- Authz contract mirror updated to document that vendor archive visibility and report filtering now use `is_archived` while authorization policy and capability semantics remain unchanged.

### Gate Results

- `make -f scripts/Makefile test-architecture-locks`: passed (`187 passed`, 1 snapshot passed)
- `pytest -m contract`: passed under the root backend venv command (`290 passed`, `7 skipped`, `1739 deselected`, 1 warning)
- `pytest tests/backend/pytest -m "not postgres and not benchmark" -x`: passed (`1996 passed`, `3 skipped`, `37 deselected`, 17 warnings)
- `TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test make -f scripts/Makefile test-postgres-ci`: passed (`29 passed`, `2 skipped`, then `60 passed`)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `ruff check backend/app`: passed
- `mypy backend/app`: baseline delta clean (`8 errors in 6 files`, unchanged from baseline)
- `cd frontend && npx tsc --noEmit`: passed
- `cd frontend && pnpm test:run`: passed (`202 files`, `881 tests passed`)
- `cd frontend && pnpm lint`: passed
- Fix-forward attempts: contract async fixtures switched to `pytest_asyncio.fixture`; stale KRI linked-vendor response expectations removed; vendor as-of report status normalized after archive-state replay; authz Markdown and JSON mirror updated for the sensitive-path doc-touch requirement.

## Post-Wave 8 Cleanup — Vendor E2E Archive Helper

- Completed: 2026-05-10 02:45:40 CEST
- Commit SHA: recorded by the cleanup commit containing this entry
- Scope: Loop 6 cleanup noted by `#77b`
- Items completed: frontend E2E `ensureVendorStatus(...)` rename to `ensureVendorArchived(...)`
- Items failed: none

### Notes

- Removed the remaining E2E helper read of `vendor.status`; vendor archive setup now depends only on `is_archived`.
- Updated vendor, risk, control, KRI, and vendor CRUD E2E specs to call `ensureVendorArchived(registrationId, archived)`.

### Verification

- RED: `cd frontend && pnpm exec vitest run -c vitest.config.ts ../tests/frontend/unit/src/e2e/apiAuth.archive-state.test.ts` failed because `ensureVendorArchived` was not exported.
- GREEN: same focused Vitest command passed (`3 tests passed`).
- `grep` for `ensureVendorStatus`, `matchesVendorStatus`, `vendor.status`, and `VendorStatus` across `tests/frontend/e2e`, `tests/frontend/unit/src/e2e`, and `frontend/src`: clean.
- `cd frontend && npx tsc --noEmit`: passed.
- `cd frontend && pnpm lint`: passed.
- `cd frontend && pnpm exec playwright test -c playwright.config.ts ../tests/frontend/e2e/vendors.spec.ts ../tests/frontend/e2e/risks.spec.ts ../tests/frontend/e2e/controls.spec.ts ../tests/frontend/e2e/kris.spec.ts ../tests/frontend/e2e/permissions/vendors-crud.spec.ts --list`: passed (`116 tests` enumerated).
- Targeted ESLint on `tests/frontend/...` reported warnings only because those files are outside the configured frontend lint base path.
