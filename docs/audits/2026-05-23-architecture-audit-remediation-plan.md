# RiskHub Architecture Audit Remediation Plan - 2026-05-23

> For agentic workers: REQUIRED SUB-SKILLS before implementation are
> `superpowers:test-driven-development`, `improve-codebase-architecture`, and
> `code-simplifier`. Use `superpowers:executing-plans` or
> `superpowers:subagent-driven-development` to execute this file. Work items use
> checkbox syntax so progress can be tracked in place.

## 0. Plan Metadata

| Field | Value |
|---|---|
| Source audit | `docs/audits/2026-05-18-architecture-and-simplify-audit.md` |
| Audit baseline | `fb359c46 Deepen architecture ownership seams` |
| Planning baseline | `9392fb7e docs: add corrected architecture audit` |
| Plan owner | Main-thread orchestrator |
| Scope | Fix every repo-verifiable finding in the corrected architecture audit |
| Non-scope | PR creation, branch/worktree creation, cosmetic rewrites unrelated to audit findings |
| Required method | Strict test-first vertical slices: RED, GREEN, REFACTOR, VERIFY |
| Critical reviewers used | Backend correctness reviewer, frontend reviewer, architecture/simplification reviewer |

## 1. Acceptance Criteria

This plan is complete when all of the following are true:

- [ ] C-1 through C-10 in the source audit are fixed with behavior tests, not only shape tests.
- [ ] Every high-leverage refactor listed in the audit has either landed or has a narrow architecture lock preventing regression while the remaining work is explicitly deferred by owner decision.
- [ ] The 22 dead-pinned dataclasses are either deleted or converted into live behavior-backed Interfaces. No `hasattr` test preserves a dead name.
- [ ] Every deletion target in the Top 15 simplification table is either deleted or retained with a documented live production/test caller and a behavior test.
- [ ] Endpoint files remain HTTP Adapters. ORM reads/writes move behind service Modules where the audit calls out inline ORM reach.
- [ ] The transaction Seam is real: `commit_service_boundary` rolls back, carries a useful boundary tag into logs/metrics, and has adoption ratchets.
- [ ] Operational loss modes are observable: durable outbox for KRI breach notifications, logged DB health probe failures, surfaced approval projection corruption, Prometheus docs/tests, and OpenTelemetry export support.
- [ ] Frontend route protection, render crash containment, dirty-form preservation, and dialog accessibility are verified by user-facing tests.
- [ ] ADR-001, ADR-002, and ADR-007 match the final code and architecture locks.
- [ ] Final verification commands in section 15 pass, or any residual failure is documented with owner-approved scope and evidence.

## 2. Core Rules For Implementation

- [ ] Before touching production code, write the RED test for the exact behavior or deletion ratchet.
- [ ] Run the RED test and capture that it fails for the expected reason. If it passes, stop and rewrite the test.
- [ ] Implement the smallest GREEN change. Do not batch unrelated audit findings.
- [ ] REFACTOR only after GREEN. Preserve behavior while improving Module Depth, Locality, and Leverage.
- [ ] Use behavior tests for live Interfaces and negative-existence tests only for verified-dead files or shims.
- [ ] Use AST parsing for architecture locks. Avoid subprocess `grep` inside tests unless no parser applies.
- [ ] Do not delete invariant-protected exports such as `app.api.v1.endpoints.users.get_password_hash` unless the invariant docs and tests are changed in the same slice.
- [ ] Do not add frontend-only authorization policy. Frontend guards mirror backend capability semantics; backend remains authoritative.
- [ ] Do not introduce broad generic helpers that hide domain rules. A helper must reduce real duplication while keeping domain-specific meaning visible.
- [ ] Keep slices small enough to revert independently. Schema changes get their own Alembic migration and rehearsal.

## 3. Architecture Vocabulary

Use this vocabulary in code reviews, comments, ADR edits, and commit messages:

- **Module**: a code unit with an Interface and hidden Implementation.
- **Interface**: what callers rely on. It must be smaller and more stable than the Implementation.
- **Implementation**: private details behind the Interface.
- **Depth**: how much complexity the Module hides behind a small Interface.
- **Seam**: the point where behavior can change without spreading edits across callers.
- **Adapter**: glue that translates between external shape and internal Interface. FastAPI endpoints and React route wrappers are Adapters.
- **Leverage**: the amount of repeated or risky work removed by one Interface.
- **Locality**: related policy and data changes live together instead of being scattered.

## 4. Evidence Inputs

Primary evidence:

- `docs/audits/2026-05-18-architecture-and-simplify-audit.md`
- `docs/adr/ADR-001-capabilities-module-unification.md`
- `docs/adr/ADR-002-service-owned-transactions.md`
- `docs/adr/ADR-007-bounded-context-taxonomy.md`
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
- `tests/backend/pytest/architecture/`
- `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards*.tsx`
- `tests/frontend/unit/src/pages/shared/useRegisterPageController.test.ts`

Critical reviewer constraints incorporated:

- Backend reviewer: treat C-1 through C-6 as vertical backend lanes, add durable outbox payload Interfaces, handle KRI duplicate data explicitly, surface approval corruption, test metrics and OTel, and make the transaction Seam real.
- Frontend reviewer: fix user-visible Wave 4 items first, map route guards to backend capability semantics, preserve dirty remediation fields, and use a shared accessible dialog shell without changing public props.
- Architecture reviewer: define each target Module Interface before moving code, replace dead name pins with behavior, add locks only after the corresponding migration, and update ADRs in the same slices as code.

## 5. Parallel Work Lanes

The safest sequencing is three lanes with explicit join points:

| Lane | Owner profile | Starts after | Must join before |
|---|---|---|---|
| A. Critical backend correctness | Backend reviewer | Wave 0 | Global outbox lock, transaction adoption |
| B. Frontend release blockers | Frontend reviewer | Wave 0 | Page-state and detail-fetch simplification |
| C. Architecture cleanup and locks | Architecture reviewer | Wave 0 | Broad endpoint/private import lock |

Single-threaded order:

1. Wave 0 - Baseline and drift inventory.
2. Wave 1 - Critical backend correctness and observability.
3. Wave 2 - Frontend release blockers.
4. Wave 3 - Verified dead code and dead-pin retirement.
5. Wave 4 - Performance and read-shape deepening.
6. Wave 5 - Transaction Seam and service commit adoption.
7. Wave 6 - Endpoint Adapter thinning.
8. Wave 7 - Listing and archive simplification.
9. Wave 8 - Frontend register and detail-fetch simplification.
10. Wave 9 - Architecture locks, ADRs, and final gates.

Parallel order:

- Wave 2 can run alongside Wave 1 after Wave 0.
- Verified-dead deletion from Wave 3 can run alongside Wave 1 only when it does not touch KRI history, approval queue, admin telemetry, metrics, or account lockout files.
- Wave 4 dashboard work must land before the broad dashboard endpoint ORM ban.
- Wave 6 restore/dashboard extraction must land before the broad endpoint/private import discipline lock.

## 6. Wave 0 - Baseline And Drift Inventory

Goal: prove the current tree, anchors, and counts before implementing fixes.

### W0.1 Clean-start guard

- [ ] RED: none. This is an execution guard.
- [ ] Run `git status --short --branch`.
- [ ] Confirm branch is `main` and no unrelated user changes are present.
- [ ] If unrelated changes exist, stop and classify them before editing.
- [ ] Run `git rev-parse --short HEAD` and record the baseline in the implementation notes.

### W0.2 Audit anchor revalidation

- [ ] Run:

```bash
rg -n 'C-[0-9]|Theme [0-9]|Wave summary|Top 15|Top 10' docs/audits/2026-05-18-architecture-and-simplify-audit.md
```

- [ ] Re-run the corrected-document invalid-phrase guard:

```bash
rg -n 'No `/metrics`|NO `/metrics`|zero metrics|never scrapable|NameError|~1100|87 LOC|4x listing sentinels|22-line shim|6-line shim|verified twice|riskhub-audit-2026-05-18' docs/audits/2026-05-18-architecture-and-simplify-audit.md
```

- [ ] Expected result: no matches. If matches appear, repair the audit document before implementation.

### W0.3 Current source inventory

- [ ] Run these source inventories and save the counts in implementation notes:

```bash
rg -n 'NotificationService\.(create_notification|bulk_create)|run_best_effort_notification_batch' backend/app
rg -n 'await db\.commit\(' backend/app/services
rg -n 'commit_service_transaction|commit_auth_transaction' backend/app
rg -n 'from app\.services\._authorization_capabilities|from app\.services\._[a-z_]+ import' backend/app/api/v1/endpoints
rg -n 'from app\.models import|import app\.models' backend/app/api/v1/endpoints
rg -n 'role="dialog"|aria-modal|focus trap|ErrorBoundary|useDetailResource|useIssueDetail|useRegisterPageController' frontend/src tests/frontend
```

- [ ] Do not use these counts as tests. Convert only stable invariants into AST-based locks in later waves.

### W0.4 Verification baseline

- [ ] Run:

```bash
make -f scripts/Makefile test-architecture-locks
python3 scripts/security/validate_authz_capability_contract.py
cd backend && ./venv/bin/ruff check .
cd frontend && npx tsc --noEmit
cd frontend && npm run lint -- --max-warnings=0
cd backend && ./venv/bin/python -m mypy --config-file mypy.ini . --no-error-summary --no-pretty
```

- [ ] Expected baseline: architecture locks pass, authz validator passes, ruff passes, frontend type/lint pass, mypy does not exceed the known 103-error baseline unless a later slice intentionally reduces it.

## 7. Wave 1 - Critical Backend Correctness And Observability

Goal: fix C-1 through C-6 with durable behavior and observable failure modes.

### W1.1 C-2 KRI period uniqueness

Target Interface:

- Module: `backend/app/models/kri_history.py`
- Interface: `KRIValueHistory` guarantees at most one row per `(kri_id, period_end)`.
- Seam: database constraint plus service-side conflict mapping.

Steps:

- [ ] RED: add `tests/backend/pytest/test_kri_period_protection.py::test_duplicate_kri_value_history_period_rejected_by_database`.
- [ ] RED: add a Postgres migration rehearsal test under `tests/backend/pytest/migrations/` that introspects the unique constraint name.
- [ ] Run the focused tests and confirm they fail because no DB constraint exists.
- [ ] GREEN: add `UniqueConstraint("kri_id", "period_end", name="uq_kri_value_history_kri_period_end")` to `KRIValueHistory`.
- [ ] GREEN: add a forward-only Alembic migration.
- [ ] GREEN: migration preflight must explicitly handle existing duplicates. Preferred behavior: fail with a clear diagnostic listing duplicate `(kri_id, period_end)` groups rather than silently deleting data.
- [ ] GREEN: map duplicate insert errors to the existing domain conflict pattern where API callers can hit this path.
- [ ] REFACTOR: keep KRI period algebra in `_kri_history/periods.py`; do not duplicate date normalization in the migration or service.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_kri_period_protection.py ../tests/backend/pytest/migrations/test_kri_value_history_period_unique_constraint.py -q
cd backend && TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test ./venv/bin/python -m pytest ../tests/backend/pytest/migrations/test_kri_value_history_period_unique_constraint.py -q
```

### W1.2 C-1 KRI breach notifications through outbox

Target Interface:

- Module: `backend/app/services/outbox/`
- Interface: a typed KRI breach notification payload with a deterministic idempotency key.
- Adapter: an outbox handler that calls `NotificationService.create_notification`.
- Seam: `_kri_history` enqueues an event; only the outbox handler emits the notification.

Steps:

- [ ] RED: add `tests/backend/pytest/test_kri_value_submission_api.py::test_kri_breach_submission_enqueues_outbox_without_inline_notification`.
- [ ] RED: add `tests/backend/pytest/test_outbox_kri_notifications.py::test_kri_breach_outbox_handler_creates_notification`.
- [ ] RED: add `tests/backend/pytest/test_outbox_kri_notifications.py::test_kri_breach_outbox_handler_failure_is_retryable`.
- [ ] RED: add AST lock `tests/backend/pytest/architecture/test_kri_history_outbox_only_emit_red.py` that fails on direct `NotificationService.*` calls under `backend/app/services/_kri_history/`.
- [ ] Confirm the first and architecture tests fail on `backend/app/services/_kri_history/direct_application.py`.
- [ ] GREEN: add a KRI breach payload model in `backend/app/services/outbox/payloads.py` with `extra="forbid"`.
- [ ] GREEN: add handler registration in `backend/app/services/outbox/registry.py`.
- [ ] GREEN: add handler implementation under `backend/app/services/outbox/handlers/`.
- [ ] GREEN: generate idempotency keys from `kri_id`, `period_end`, recipient id, and breach transition. Do not collapse separate breach transitions into one event.
- [ ] GREEN: replace the direct notification in `_kri_history/direct_application.py` with `OutboxService.enqueue` in the same transaction as the KRI history write.
- [ ] REFACTOR: keep KRI-specific recipient selection in `_kri_history`; keep notification delivery in the outbox handler Adapter.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_kri_value_submission_api.py ../tests/backend/pytest/test_outbox_kri_notifications.py ../tests/backend/pytest/architecture/test_kri_history_outbox_only_emit_red.py -q
make -f scripts/Makefile test-architecture-locks
```

### W1.3 C-3 in-memory account lockout runtime guard

Target Interface:

- Module: `backend/app/main.py` plus `backend/app/services/account_lockout_service.py`
- Interface: supported production startup requires Redis; in-memory lockout is allowed only for debug/demo single-worker runtime.
- Seam: a startup guard resolves worker count once and rejects production-like multi-worker in-memory use.

Steps:

- [ ] RED: add `tests/backend/pytest/test_account_lockout_runtime.py::test_debug_false_requires_redis_lockout_backend`.
- [ ] RED: add `tests/backend/pytest/test_account_lockout_runtime.py::test_in_memory_lockout_rejected_for_multi_worker_production_like_runtime`.
- [ ] RED: add `tests/backend/pytest/test_account_lockout_runtime.py::test_debug_demo_single_worker_can_use_in_memory_lockout`.
- [ ] Confirm tests fail because multi-worker in-memory mode is not guarded.
- [ ] GREEN: reuse or extract the worker-count resolver already used by scheduler jobs for `API_WORKERS`, `UVICORN_WORKERS`, and `WEB_CONCURRENCY`.
- [ ] GREEN: keep supported `DEBUG=false` Redis path unchanged.
- [ ] GREEN: reject or hard-fail production-like multi-worker in-memory startup with an actionable error message.
- [ ] REFACTOR: keep the guard near startup wiring; do not put environment parsing inside `InMemoryAccountLockoutBackend`.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_account_lockout_runtime.py -q
cd backend && ./venv/bin/ruff check app/main.py app/services/account_lockout_service.py
```

### W1.4 C-4 admin telemetry DB probe logging

Target Interface:

- Module: `backend/app/services/_admin_telemetry/lifecycle.py`
- Interface: DB health probe returns the same response shape but logs traceback-bearing failures.
- Seam: failure classification remains tolerant; observability changes.

Steps:

- [ ] RED: add `tests/backend/pytest/test_admin_telemetry.py::test_system_status_db_failure_logs_exception_with_context`.
- [ ] Confirm the test fails because no `logger.exception` call occurs.
- [ ] GREEN: call `logger.exception` when the DB probe catches `Exception`.
- [ ] GREEN: include stable context fields such as probe name and operation without logging secrets.
- [ ] REFACTOR: keep the API response semantics unchanged.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_admin_telemetry.py -q
```

### W1.5 C-5 approval queue corrupt projection observability

Target Interface:

- Module: `backend/app/services/_approval_queue/`
- Interface: corrupt payload tolerance is explicit and surfaced; capability-code bugs are not silently hidden.
- Seam: projection returns valid rows plus observable skipped-count metadata.

Steps:

- [ ] RED: add `tests/backend/pytest/test_approval_queue_projection.py::test_corrupt_projection_logs_traceback_and_surfaces_skipped_count`.
- [ ] RED: add API response coverage in `tests/backend/pytest/test_approvals.py` or `tests/backend/pytest/api/v1/approvals/`.
- [ ] RED: add metric coverage if metrics infrastructure already exposes a suitable counter; otherwise add the counter in this slice.
- [ ] Confirm tests fail because `skipped_corrupt_payloads` is dropped before the API response and logging lacks traceback.
- [ ] GREEN: replace non-traceback `logger.error` with `logger.exception` for unexpected projection exceptions.
- [ ] GREEN: add `skipped_corrupt_payloads` to the API response or admin-only metadata, using a backwards-compatible default.
- [ ] GREEN: add `approval_queue_projection_skipped_total` or equivalent Prometheus counter behind the existing metrics registry.
- [ ] GREEN: distinguish tolerated corrupt payloads from capability-code bugs. Capability calculation exceptions should fail loudly unless explicitly classified as corrupt persisted data.
- [ ] REFACTOR: keep projection contracts small; avoid passing raw ORM rows to response serializers.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_approval_queue_projection.py ../tests/backend/pytest/test_approvals.py -q
```

### W1.6 C-6 metrics docs, Prometheus tests, and OTel Adapter

Target Interface:

- Module: `backend/app/core/settings/metrics.py`
- Interface: metrics are explicit runtime configuration, documented for deployment, and test-covered.
- Adapter: OpenTelemetry export is optional, disabled by default, and configured through settings.

Steps:

- [ ] RED: add `tests/backend/pytest/test_metrics_runtime.py::test_metrics_route_absent_by_default_and_present_when_enabled`.
- [ ] RED: add `tests/backend/pytest/test_metrics_runtime.py::test_rate_limit_backend_unavailable_counter_is_scrapable_when_metrics_enabled`.
- [ ] RED: add a docs/config guard test under `tests/backend/pytest/architecture/` that requires `METRICS_ENABLED` in deployment docs and env examples.
- [ ] RED: add `tests/backend/pytest/test_metrics_runtime.py::test_otel_exporter_is_configured_only_when_endpoint_set`.
- [ ] Confirm the docs guard and OTel test fail.
- [ ] GREEN: document `METRICS_ENABLED=true` in deployment README, reference docs, and env examples used for production install.
- [ ] GREEN: add OTel settings, for example `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME`, default disabled.
- [ ] GREEN: add an OTel Adapter Module that wires exporter setup during startup only when configured. Startup must not require OTel when unset.
- [ ] GREEN: add required runtime dependencies only if no existing dependency supports the Adapter.
- [ ] REFACTOR: keep Prometheus route registration and OTel setup separate; do not make `/metrics` depend on OTel.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_metrics_runtime.py ../tests/backend/pytest/architecture/test_deployment_metrics_setting_documented_red.py -q
cd backend && ./venv/bin/ruff check app/core/settings app/main.py
```

## 8. Wave 2 - Frontend Release Blockers

Goal: fix C-7 through C-10 with user-facing tests.

### W2.1 C-7 app-level ErrorBoundary

Target Interface:

- Module: `frontend/src/components/ErrorBoundary.tsx`
- Interface: catches route render crashes, shows recoverable fallback, resets on route changes.
- Adapter: `frontend/src/App.tsx` wraps protected route shell without changing route definitions.

Steps:

- [ ] RED: add `tests/frontend/unit/src/components/ErrorBoundary.test.tsx::renders_fallback_when_child_route_throws`.
- [ ] RED: add `tests/frontend/unit/src/components/ErrorBoundary.test.tsx::resets_error_on_location_change`.
- [ ] Confirm tests fail because no boundary exists.
- [ ] GREEN: implement class or supported React error boundary component with accessible fallback.
- [ ] GREEN: wrap the protected route shell in `App.tsx` while preserving `Suspense`.
- [ ] REFACTOR: keep fallback text concise and operational; do not create a marketing or explanatory page.
- [ ] VERIFY:

```bash
cd frontend && npm run test:run -- ErrorBoundary.test.tsx
cd frontend && npx tsc --noEmit
```

### W2.2 C-8 route guards for protected pages

Target Interface:

- Module: `frontend/src/authz/BusinessRouteGuards.tsx`
- Interface: typed route guard components mirror backend capability semantics.
- Adapter: route config wraps `/vendor-reports`, `/audit-trail`, `/admin`, and `/admin/docs`.

Steps:

- [ ] RED: extend `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx` for direct navigation with denied authz redirects.
- [ ] RED: extend `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.factory.test.tsx` for any new guard exports.
- [ ] RED: add structural coverage that protected route manifests cannot rely only on sidebar `isVisible`.
- [ ] Confirm tests fail for currently unguarded route configs.
- [ ] GREEN: add or reuse guard factories for vendor reports, audit trail, admin console, and admin docs.
- [ ] GREEN: map each guard to backend capability semantics. Do not invent new frontend-only policy.
- [ ] GREEN: wrap route entries in `frontend/src/routing/business.tsx` and `frontend/src/routing/admin.tsx`.
- [ ] REFACTOR: keep route config readable; route guards stay thin Adapters.
- [ ] VERIFY:

```bash
cd frontend && npm run test:run -- BusinessRouteGuards
cd frontend && npm run test:run -- routing
cd frontend && npx tsc --noEmit
```

### W2.3 C-9 remediation workflow dirty-field preservation

Target Interface:

- Module: `frontend/src/components/issues/remediation/useRemediationPlanWorkflow.ts`
- Interface: server refreshes update clean fields; dirty local fields survive; changing `issue.id` resets all fields.
- Seam: local dirty tracking separates "same issue refresh" from "new issue".

Steps:

- [ ] RED: add `tests/frontend/unit/src/components/issues/__tests__/useRemediationPlanWorkflow.test.tsx::server_refresh_does_not_clobber_dirty_fields`.
- [ ] RED: add `tests/frontend/unit/src/components/issues/__tests__/useRemediationPlanWorkflow.test.tsx::changing_issue_id_resets_workflow_fields`.
- [ ] Include progress, status, blocker, completion, and validation fields.
- [ ] Confirm dirty-field test fails on current effect dependencies.
- [ ] GREEN: track a saved baseline or dirty field map.
- [ ] GREEN: reset only when `issue.id` changes or after a successful local save acknowledges the current value.
- [ ] REFACTOR: keep the hook API stable for `RemediationPlanCard`.
- [ ] VERIFY:

```bash
cd frontend && npm run test:run -- useRemediationPlanWorkflow
```

### W2.4 C-10 shared accessible dialog shell

Target Interface:

- Module: `frontend/src/components/DialogShell.tsx` or equivalent.
- Interface: role, modal semantics, labels, initial focus, focus trap, Escape handling, opener focus restoration.
- Adapters: `ConfirmDialog` and `ArchiveConfirmDialog` retain public props.

Steps:

- [ ] RED: add `tests/frontend/unit/src/components/__tests__/ConfirmDialog.a11y.test.tsx`.
- [ ] RED: add `tests/frontend/unit/src/components/__tests__/ArchiveConfirmDialog.a11y.test.tsx`.
- [ ] Cover `role="dialog"`, `aria-modal="true"`, labelled title, described body/error, close button `aria-label`, initial focus, Escape behavior, Tab and Shift+Tab trap, focus restoration, loading-disabled close semantics, archive reason validation, and portal/backdrop behavior.
- [ ] Confirm tests fail on current dialogs.
- [ ] GREEN: extract a shared dialog shell.
- [ ] GREEN: migrate `ConfirmDialog` and `ArchiveConfirmDialog` to the shell without changing caller props.
- [ ] REFACTOR: remove duplicated behavior only after all a11y tests are green.
- [ ] VERIFY:

```bash
cd frontend && npm run test:run -- ConfirmDialog ArchiveConfirmDialog
cd frontend && npm run lint -- --max-warnings=0
```

## 9. Wave 3 - Verified Dead Code And Dead-Pin Retirement

Goal: remove shape-only scaffolding and replace name pins with behavior.

### W3.1 Negative-existence ratchet for verified-dead files

Targets:

- `backend/app/api/v1/endpoints/auth/_sso_helpers.py`
- `backend/app/api/v1/endpoints/controls/_helpers.py`
- `backend/app/services/_approval_execution/kri_changes.py`
- `scripts/security/authz_validator/`
- `backend/app/services/_directory_sync/`
- `frontend/src/components/layout/Header.tsx`
- dead helpers in `frontend/src/components/access/usersTablePresentation.ts`
- unused `currentUserId` prop in `frontend/src/pages/approvals/ApprovalList.tsx`

Steps:

- [ ] RED: add parametrized AST/path test `tests/backend/pytest/architecture/test_verified_dead_code_deleted_red.py`.
- [ ] RED: add frontend architecture test under `tests/frontend/unit/src/architecture/verifiedDeadCodeDeleted.test.ts`.
- [ ] Confirm tests fail because files or symbols exist.
- [ ] GREEN: delete only targets with zero live production/test callers.
- [ ] GREEN: adjust imports/barrels and allowlists that only preserve dead targets.
- [ ] REFACTOR: collapse duplicated negative-existence tests into the new parametrized tests.
- [ ] VERIFY:

```bash
make -f scripts/Makefile test-architecture-locks
cd frontend && npm run test:run -- verifiedDeadCodeDeleted
cd backend && ./venv/bin/ruff check .
cd frontend && npx tsc --noEmit
```

### W3.2 Replace 22 `hasattr` dead-type pins

Steps:

- [ ] RED: add a contract test that fails while `tests/backend/pytest/test_architecture_deepening_contracts.py` still pins dead names with `hasattr`.
- [ ] For each live Module, write a behavior test through the public Interface before deleting name pins.
- [ ] For each dead type, run `rg -n '\b<Name>\b' backend tests docs` and confirm only test/docs references remain.
- [ ] GREEN: remove dead dataclasses and dead Literal members:
  - `EntityMutationOptions`
  - `EntityApprovalPlan`
  - `EntityDirectApplyPlan`
  - `DeadlineRunPlan`
  - `DeadlineRunOutcome`
  - `build_deadline_notification_plan`
  - `IssueLinkedContextDefinition`
  - `IssueRegisterPlan`
  - `IssueSourceMutationPlan`
  - `VendorLinkAccessPlan`
  - `VendorLinkedResourceProjection`
  - `VendorReportDefinition`
  - `DirectorySyncOutcome`
  - `DirectoryImportOutcome`
  - `DashboardMetricPlan`
  - `DashboardMetricOutcome`
  - `DashboardSnapshotDecision`
  - `MetricAvailability`
  - `RegisterListingDefinition`
  - `RegisterListingCriteria`
  - `RegisterSerializerContext`
  - `ReportExportExecutionPlan`
  - `ReportExportOutcome`
- [ ] GREEN: preserve live types named in the audit, including `EntityMutationOutcome`, `SideEffectResult`, `VendorListingGovernance`, `RegisterListingPlan`, and `ReportExportDefinition`.
- [ ] REFACTOR: split `test_architecture_deepening_contracts.py` into smaller behavior-oriented tests where useful.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_architecture_deepening_contracts.py -q
make -f scripts/Makefile test-architecture-locks
```

## 10. Wave 4 - Performance And Read-Shape Deepening

Goal: remove hot-path N+1 patterns through deeper read Modules.

### W4.1 Dashboard metrics Modules

Target Interface:

- Module: `backend/app/services/_dashboard_metrics/`
- Interface: `load_risk_dashboard_metrics`, `load_kri_dashboard_metrics`, `load_control_dashboard_metrics`, `load_department_dashboard_metrics`.
- Adapter: dashboard endpoints translate request/session data and return API schemas.

Steps:

- [ ] RED: add API parity tests for `dashboard/risks.py`, `dashboard/kris.py`, `dashboard/controls.py`, and `dashboard/departments.py`.
- [ ] RED: add query-budget test `tests/backend/pytest/api/v1/test_dashboard_query_budget.py::test_department_metrics_query_count_is_bounded`.
- [ ] RED: add AST lock that fails while dashboard endpoint files import ORM models or sibling route handlers after migration.
- [ ] GREEN: move ORM aggregation into `_dashboard_metrics/{risks,kris,controls,departments}.py`.
- [ ] GREEN: replace enum-loop counts with grouped SQL queries.
- [ ] GREEN: remove `dashboard/overview.py` route-calling-route imports.
- [ ] REFACTOR: keep endpoint files as HTTP Adapters only.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_dashboard.py ../tests/backend/pytest/api/v1/test_dashboard_query_budget.py -q
make -f scripts/Makefile test-architecture-locks
```

### W4.2 Issue register capability preload

Steps:

- [ ] RED: add query-count coverage to `tests/backend/pytest/api/v1/test_issue_register_projection.py` proving issue summaries do not call the capability loader per row.
- [ ] GREEN: introduce a batch/preload capability Seam aligned with risks, controls, and KRIs.
- [ ] REFACTOR: keep per-row capability response shape unchanged.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/api/v1/test_issue_register_projection.py -q
```

### W4.3 Approval queue SQL visibility and index

Steps:

- [ ] RED: add `tests/backend/pytest/test_approval_queue_visibility.py::test_visibility_filter_applies_before_pagination`.
- [ ] GREEN: push visibility filtering into SQL before pagination.
- [ ] RED: after the query shape is finalized, add migration rehearsal for composite index on `ApprovalRequest(status, created_at)`.
- [ ] GREEN: add the Alembic migration and model/index declaration if the model owns indexes locally.
- [ ] REFACTOR: move `approval_queue_visibility.py` into `_approval_queue/` if imports stay local and tests remain clear.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_approval_queue_visibility.py -q
cd backend && TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test ./venv/bin/python -m pytest ../tests/backend/pytest/migrations/test_approval_request_status_created_index.py -q
```

### W4.4 Dashboard issue aggregate reuse

Steps:

- [ ] RED: add a query-budget test proving summary, aging, and severity do not each load the full scoped issue set independently.
- [ ] GREEN: share one aggregate query path or use SQL aggregation.
- [ ] REFACTOR: keep existing dashboard API response schemas stable.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/api/v1/test_dashboard_issue_metrics.py -q
```

## 11. Wave 5 - Transaction Seam And Service Commit Adoption

Goal: turn a decorative helper into a real service-owned commit Seam.

### W5.1 Define `commit_service_boundary`

Target Interface:

- Module: `backend/app/services/transaction_boundary.py`
- Interface: `commit_service_boundary(db, *, boundary: str)` commits, rolls back on commit failure, and emits useful boundary metadata.
- Seam: service Modules commit through one observable primitive.

Steps:

- [ ] RED: add `tests/backend/pytest/test_transaction_boundary.py::test_commit_service_boundary_rolls_back_and_logs_boundary_on_commit_failure`.
- [ ] RED: add `tests/backend/pytest/test_transaction_boundary.py::test_commit_service_boundary_commits_once_on_success`.
- [ ] Confirm tests fail because current `commit_service_transaction` is a shallow commit wrapper.
- [ ] GREEN: implement `commit_service_boundary`.
- [ ] GREEN: make `commit_auth_transaction` delegate to or share implementation with the generic helper while preserving auth call sites.
- [ ] REFACTOR: keep the old endpoint helper as a temporary compatibility Adapter if needed, but mark it for migration.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_transaction_boundary.py -q
```

### W5.2 Ratchet service-side raw commits

Steps:

- [ ] RED: add AST lock `tests/backend/pytest/architecture/test_service_commit_boundary_ratchet_red.py`.
- [ ] Seed an allowlist with current raw service commits and clear ownership/rationale.
- [ ] GREEN: migrate single-commit candidates first:
  - `_notification_inbox/lifecycle.py`
  - `_identity_access_lifecycle/execution.py`
  - `_identity_access_lifecycle/profile_updates.py`
  - `_control_execution/workflow.py`
  - `_control_execution/link_policy.py`
  - `_orphaned_items/resolution.py`
  - `_orphaned_items/flagging.py`
  - low-risk `_auth_session/*` callers after auth helper delegation
- [ ] REFACTOR: avoid mass-changing high-risk multi-step workflows until each has local tests.
- [ ] VERIFY after each Module:

```bash
cd backend && ./venv/bin/python -m pytest <focused-test-file> -q
make -f scripts/Makefile test-architecture-locks
```

### W5.3 ADR-002 update

- [ ] RED: add/extend an ADR consistency test that fails while ADR-002 names stale transaction primitives or stale auth-flow exemption text.
- [ ] GREEN: update ADR-002 to describe `commit_service_boundary`, retired auth-flow endpoint exemptions, rollback behavior, and the adoption ratchet.
- [ ] VERIFY:

```bash
make -f scripts/Makefile test-architecture-locks
```

## 12. Wave 6 - Endpoint Adapter Thinning

Goal: endpoints stop owning domain queries, model imports, and private service details where the audit called out drift.

### W6.1 Restore orchestrators

Target Interface:

- Module: `backend/app/services/_entity_mutation_lifecycle/lifecycle.py`
- Interface: restore operations for risks, controls, and KRIs use the same mutation Seam as archive/update paths.
- Adapter: restore endpoints pass actor, id, and request data only.

Steps:

- [ ] RED: add public API tests for `/risks/{id}/restore`, `/controls/{id}/restore`, and `/kris/{id}/restore` covering archived visibility, activity logs, `can_restore` metadata, and RBAC.
- [ ] RED: add AST lock `tests/backend/pytest/architecture/test_restore_endpoints_thin_adapters_red.py` that fails on model imports, `select(...)`, or endpoint-side commit shims in restore endpoints after migration.
- [ ] GREEN: implement restore orchestration in `_entity_mutation_lifecycle`.
- [ ] GREEN: move endpoint ORM reads/writes into the service Module.
- [ ] REFACTOR: keep endpoints thin and keep response schemas unchanged.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_risks.py ../tests/backend/pytest/test_kris_rbac.py ../tests/backend/pytest/architecture/test_restore_endpoints_thin_adapters_red.py -q
```

### W6.2 Risk create retry loop into service

Steps:

- [ ] RED: add service-level behavior test for risk-code collision retry and final conflict after max retries.
- [ ] GREEN: move retry loop from `backend/app/api/v1/endpoints/risks/crud/create.py` into the risk service Module.
- [ ] REFACTOR: endpoint remains an Adapter around service Interface.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_risks.py -q
```

### W6.3 Private capability import discipline

Steps:

- [ ] RED: add AST lock that fails for endpoint imports from `app.services._authorization_capabilities` when the symbol exists on `app.services.authorization_capabilities`.
- [ ] GREEN: migrate true bypasses such as `endpoints/users/summary.py` to the public facade.
- [ ] GREEN: keep forced bypasses allowlisted with rationale until facade policy is decided.
- [ ] GREEN: migrate `_register_listings/risks.py` true service-layer bypass if the public facade supports the symbol.
- [ ] REFACTOR: decide and document Option A or Option B from audit section 8.
- [ ] VERIFY:

```bash
make -f scripts/Makefile test-architecture-locks
python3 scripts/security/validate_authz_capability_contract.py
```

### W6.4 Reporting and docs Adapters

Steps:

- [ ] RED: add architecture tests for `admin/docs.py`, audit-trail Excel, and summary export endpoints to ensure they call service Modules rather than doing document/report assembly inline.
- [ ] GREEN: extract to `_documentation_service` and `_reporting/excel` Modules where appropriate.
- [ ] REFACTOR: keep endpoint response types and filenames stable.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/api/v1/test_reports_kris.py -q
make -f scripts/Makefile test-architecture-locks
```

## 13. Wave 7 - Listing And Archive Simplification

Goal: reduce duplication without flattening domain semantics.

### W7.1 Register listing sentinels and group parsing

Steps:

- [ ] RED: add characterization tests for risks, controls, KRIs, and vendors grouped list output:
  - unlinked vendor
  - uncategorized
  - structurally parallel unlinked risk
  - `vendor:` and `risk:` prefixed filters
  - capability metadata
- [ ] GREEN: extract shared sentinel values for the 3x identical vendor-related sentinels.
- [ ] GREEN: keep vendor/risk sentinel semantics explicit; do not claim four identical sentinels.
- [ ] GREEN: extract `parse_prefixed_group_value` helper.
- [ ] REFACTOR: delete duplicated parser code only after characterization tests pass.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/api/v1/test_issue_register_module.py ../tests/backend/pytest/test_kris_department_filters_api.py -q
```

### W7.2 Vendor-context subquery helper

Steps:

- [ ] RED: add tests proving controls, KRIs, and risks vendor-context filters return identical rows before and after extraction.
- [ ] GREEN: extract a small helper in `_register_listings/`.
- [ ] REFACTOR: keep entity-specific joins and capability decisions outside the helper.
- [ ] VERIFY with focused register-list tests.

### W7.3 Archive detail consolidation

Steps:

- [ ] RED: add behavior tests for `archive_risk_detail`, `archive_control_detail`, and `archive_kri_detail` covering pending delete, existing archived entity, actor metadata, and response detail.
- [ ] GREEN: consolidate `archive_X_no_commit` and `archive_X_detail` through a typed internal descriptor or function.
- [ ] REFACTOR: keep exception classes domain-specific where existing behavior differs.
- [ ] VERIFY:

```bash
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_risks.py ../tests/backend/pytest/test_kris_rbac.py ../tests/backend/pytest/test_architecture_deepening_contracts.py -q
```

### W7.4 Other low-risk simplifications

- [ ] Consolidate `resolve_safe_default_role` with an `on_missing` or exception factory callback after tests cover all three current behaviors.
- [ ] Consolidate `_to_directory_user` normalization after AD and Graph tests cover the same seven fields.
- [ ] Extract `_kri_history/queries.py` shared overdue/due-soon period-row builder after tests cover both call paths.
- [ ] Consolidate export builders through a registry after current export tests characterize filenames, filters, and row shapes.

## 14. Wave 8 - Frontend Register And Detail-Fetch Simplification

Goal: bring frontend architecture in line with backend register/detail patterns.

### W8.1 Register page-state migration

Rules:

- Migrate only risks, issues, vendors, and KRIs. Controls are the template and should not be rewritten except to adjust shared types.
- Do one register at a time.
- Preserve sorting, grouped views, export filters, URL-param initial state, archived visibility, vendor-context exclusions, page reset semantics, group reset semantics, access-denied state, and error state.

Slices:

- [ ] Risks: add RED tests for `useRisksPageState`, migrate to `useRegisterPageController`, run focused tests.
- [ ] Issues: add RED tests for `useIssuesPageState`, migrate to controller, preserve remediation/approval filters.
- [ ] Vendors: add RED tests for `useVendorsPageState`, migrate to controller, preserve vendor-context exclusions.
- [ ] KRIs: add RED tests for `useKrisPageState`, migrate to controller, preserve period/status filters.

Verification:

```bash
cd frontend && npm run test:run -- useRegisterPageController useRisksPageState useIssuesPageState useVendorsPageState useKrisPageState
cd frontend && npx tsc --noEmit
```

### W8.2 Detail-fetch migration to React Query

Scope decision:

- In scope: the three audit-framed detail pages using `useDetailResource`.
- Also in scope unless current inspection disproves manual fetch: `VendorDetailPage` via `useVendorDetailState`.
- Template: `frontend/src/pages/issues/issue-detail/useIssueDetail.ts`.

Steps:

- [ ] RED: add tests for invalid IDs not calling APIs, 403 mapping to access-denied, retry/refetch behavior, session-scoped query keys, and stale data not overwriting local tabs/dialog state.
- [ ] GREEN: migrate one detail page at a time to React Query.
- [ ] GREEN: decide whether `frontend/src/lib/issueQueryKeys.ts` moves into `frontend/src/lib/queryKeys/`; if it remains separate, document why in the code or README.
- [ ] REFACTOR: remove `useDetailResource` only after zero callers remain and negative-existence tests are in place.
- [ ] VERIFY:

```bash
cd frontend && npm run test:run -- useDetailResource useIssueDetail detail
cd frontend && npm run lint -- --max-warnings=0
```

### W8.3 Dialog simplification completion

- [ ] After W2.4 is green, delete `ArchiveConfirmDialog` duplication that is now covered by the shared shell.
- [ ] Keep public props stable until all seven callers migrate or compatibility is deliberately removed with tests.
- [ ] Run dialog and archive/restore action tests.

## 15. Wave 9 - Architecture Locks, ADRs, And Final Gates

Goal: make the fixed architecture hard to regress.

### W9.1 Global outbox-only lock

- [ ] RED: expand outbox-only architecture lock beyond issues to catch direct notification emission in services where outbox is required.
- [ ] GREEN: allowlist documented scheduler replay paths such as deadline checks when they have dedupe and replay semantics.
- [ ] VERIFY: the lock fails before W1.2 and passes after W1.2.

### W9.2 Endpoint Adapter locks

- [ ] Add lock for dashboard endpoints importing ORM after W4.1.
- [ ] Add lock for restore endpoints containing `select(...)`, model imports, or endpoint-side commit shims after W6.1.
- [ ] Add lock for route-calling-route imports in dashboard overview.
- [ ] Add private capability import discipline lock after W6.3.

### W9.3 Phantom Module and allowlist hygiene

- [ ] Add phantom adapter detection for `_bounded_context_adapters.toml`.
- [ ] Remove `_directory_sync` from adapter TOML or populate it with real code and an expiration decision.
- [ ] Tighten empty or meaningless allowlist ceilings:
  - `_endpoint_commit_allowlist.toml`
  - `_naming_allowlist.toml`
  - `_capability_catalog_access_user_baseline.toml`
- [ ] Prefer parametrized tests for duplicate single-assertion negative-existence locks.

### W9.4 ADR updates

- [ ] ADR-001: update invariant wording and tests for public facade/private capability import discipline.
- [ ] ADR-002: document `commit_service_boundary`, rollback behavior, retired auth-flow exemptions, and service adoption ratchet.
- [ ] ADR-007: resolve `_directory_sync` phantom adapter and update bounded-context taxonomy.
- [ ] Run docs topology and architecture-lock gates after each ADR slice.

### W9.5 Final verification gate

Run all commands:

```bash
make -f scripts/Makefile test-architecture-locks
python3 scripts/security/validate_authz_capability_contract.py
cd backend && ./venv/bin/ruff check .
cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest -q
cd backend && ./venv/bin/python -m mypy --config-file mypy.ini . --no-error-summary --no-pretty
cd frontend && npx tsc --noEmit
cd frontend && npm run lint -- --max-warnings=0
cd frontend && npm run test:run
make -f scripts/Makefile test-e2e
```

If a full backend pytest run is too slow for an intermediate slice, run the focused tests plus architecture locks. The final gate still requires the full command set or an explicit owner-approved limitation.

## 16. Evidence Map

| Plan area | Audit evidence |
|---|---|
| C-1 through C-6 | Source audit section 1 and Theme 4 |
| C-7 through C-10 | Source audit section 1 and Theme 5 |
| Dead-pinned dataclasses | Source audit Theme 1 and section 6 dead-type inventory |
| Service commit dispersion | Source audit Theme 3 and ADR-002 drift |
| N+1 read paths | Source audit Theme 6 |
| Dead code deletion | Source audit Theme 7 and Top 15 simplification targets |
| Frontend page-state/detail duplication | Source audit Theme 8 |
| Listing/archive duplication | Source audit Theme 9 |
| Endpoint private imports and inline ORM | Source audit Theme 10 |
| Architecture-lock and ADR drift | Source audit Theme 11 and section 9 |

## 17. Known Risks And Stop Conditions

- Stop if a RED test cannot be made to fail for the audited reason. That usually means the finding was already fixed or the test is targeting the wrong seam.
- Stop if a migration sees existing duplicate KRI period rows and no owner has approved cleanup behavior.
- Stop if dashboard query changes alter department scoping or cross-department exceptions.
- Stop if frontend route guards require a capability that backend does not expose or enforce.
- Stop if a cleanup would delete an invariant-protected public import without updating the documented invariant.
- Stop if OpenTelemetry dependencies materially change startup/runtime behavior when OTel settings are unset.
- Stop if a helper extraction increases Interface size more than it hides Implementation complexity.

## 18. Done Report Template

Use this format when execution completes:

```markdown
## Result

- Fixed C-1..C-10: <yes/no, with exceptions>
- Removed/deepened dead pins: <count>
- Deleted verified-dead targets: <count>
- Added architecture locks: <list>
- ADRs updated: <list>

## Verification

<command> -> <result>

## Evidence

- <file:line or test name>

## Limitations

- <only if needed>
```
