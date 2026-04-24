# Testing

**Analysis Date:** 2026-04-24

## Test Stack Overview

- Backend: `pytest`, `pytest-asyncio`, `httpx`, `pytest-cov` (`backend/pytest.ini`)
- Frontend unit/integration: `Vitest` + Testing Library + MSW (`frontend/vitest.config.ts`, `tests/frontend/unit/src/test/mocks/`)
- Frontend/browser E2E: `Playwright` (`frontend/playwright.config.ts`, `tests/frontend/e2e/`)

## Backend Testing Patterns

### Configuration
- `backend/pytest.ini` sets discovery and coverage defaults
- Markers include:
  - `postgres` for PostgreSQL-required behavior
  - `slow` for longer-running suites
  - `redis_integration` for Docker-backed Redis fault-injection resilience checks

### Fixture strategy
- Default backend tests use fast SQLite in-memory (`TEST_DATABASE_URL=sqlite+aiosqlite:///:memory:`) (`tests/backend/pytest/conftest.py`)
- Postgres-mode is opt-in via `TEST_DATABASE_URL` and applies Alembic migrations once per session, then truncates tables per test (`tests/backend/pytest/conftest.py`)
- When a live Docker stack is already using `riskhub`, Postgres verification should target a sibling `riskhub_test` database rather than the live app database
- Role/user fixtures include wildcard and platform-admin variants (`tests/backend/pytest/conftest.py`)
- Dependency override and header-based auth patterns are both used in test clients
- Session-scoped engine disposal prevents pytest interpreter-exit hangs caused by leaked `aiosqlite` worker threads (`tests/backend/pytest/conftest.py`)

### Scale snapshot
- Backend test tree: 162 tracked files (159 Python)
- API-focused backend tests live under `tests/backend/pytest/api/` and domain-specific root test modules under `tests/backend/pytest/`

## Frontend Unit/Integration Patterns

- Vitest configured with jsdom and setup file (`frontend/vitest.config.ts`, `frontend/vitest.setup.ts`)
- Includes `src/**/*.{test,spec}.{ts,tsx}`
- MSW handlers provide deterministic API contracts during tests (`tests/frontend/unit/src/test/mocks/handlers.ts`)
- React Query/Auth providers are wrapped in reusable test utilities (`tests/frontend/unit/src/test/utils.tsx`)

## Frontend E2E Patterns

- Playwright projects: Chromium, Firefox, WebKit, plus CI profile (`frontend/playwright.config.ts`)
- Global setup performs health/preflight checks (`tests/frontend/e2e/setup/global-setup.ts`)
- Global setup also verifies deterministic seed fixtures for stable selectors and assertions (`tests/frontend/e2e/setup/global-setup.ts`)
- Domain-oriented E2E suites cover permissions, approvals, sensitive fields, cross-department access, and activity logging (`tests/frontend/e2e/`)
- CI keeps a fast hybrid-dev Playwright lane and a separate production-profile smoke lane for startup/auth/header/docs-disabled checks (`.github/workflows/e2e.yml`)
- “polish-audit” is intentionally heavier and is lightweight-by-default; set `POLISH_AUDIT_DEEP=1` when you want full-page/deep audit mode (`tests/frontend/e2e/polish-audit.spec.ts`)
- Docker full-stack browser runs must override `FRONTEND_URL=http://localhost`
- `polish-audit` coverage is expected to include `riskhub`, `light`, and `dark`
- The shared login helper is origin-aware for both `http://localhost:5173` and the Docker nginx surface at `http://localhost`

## CI Test/Security Execution

- E2E workflow provisions Postgres service, runs backend + Playwright chromium suite (`.github/workflows/e2e.yml`)
- Dedicated backend Postgres workflow runs `make -f scripts/Makefile test-postgres-ci` as a required PR signal for schema-sensitive behavior plus the named DB-sensitive regression pack (`.github/workflows/backend-postgres.yml`)
- Frontend Vitest is a blocking PR signal in the lint workflow (`.github/workflows/lint.yml`)
- Lint workflow enforces frontend debt/dead-code/no-inline-style gates with machine-readable validators, backend Ruff hard gate, backend suppression budget, docs topology consistency, and production contract doc parity (`.github/workflows/lint.yml`)
- Security workflow runs Bandit, pip-audit, npm audit, Trivy, Syft+Grype correlation, and gitleaks parse+scan (`.github/workflows/security.yml`)
- Security workflow also runs nightly non-blocking Redis resilience integration checks (`redis_integration`) (`.github/workflows/security.yml`)
- Startup/install contract coverage includes the public `scripts/install.sh` first-run and lifecycle surface even though the implementation now routes through `scripts/install_cli.py` and `scripts/install_lib/`; covered commands include `verify`, `status`, `logs`, `doctor`, and `upgrade` (`tests/backend/pytest/test_install_script_contracts.py`, `tests/backend/pytest/test_startup_script_contracts.py`)

## Canonical Commands

- Public local/demo install flows: `./scripts/install.sh demo`, `./scripts/install.sh demo --reset test`, and `./scripts/install.sh dev`
- Public production install/lifecycle flows: `./scripts/install.sh production --target docker|linux`, `./scripts/install.sh upgrade --target docker|linux`, `./scripts/install.sh verify --mode production --target docker|linux --config PATH --secret-dir PATH`, `./scripts/install.sh status --mode production --target docker|linux [--json]`, `./scripts/install.sh logs --mode production --target docker|linux [--tail N] [--follow]`, and `./scripts/install.sh doctor --mode production --target docker|linux [--repair] [--deep] [--json]`
- Backend tests: `make -f scripts/Makefile test` or `cd backend && pytest -v`
- Backend lint + suppression budget: `make -f scripts/Makefile lint-backend`
- Backend suppression budget only: `make -f scripts/Makefile quality-suppression-budget`
- Backend Postgres-sensitive tests: `TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test make -f scripts/Makefile test-postgres-ci`
- Backend KRI history/value workflow: `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_kris_history_listing_api.py ../tests/backend/pytest/test_kris_history_corrections_api.py ../tests/backend/pytest/test_kris_value_submission_api.py ../tests/backend/pytest/test_kris_submission_rbac_api.py ../tests/backend/pytest/test_kris_rbac.py ../tests/backend/pytest/test_approvals.py`
- Backend questionnaire workflow: `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/api/v1/test_risk_questionnaires.py ../tests/backend/pytest/api/v1/test_risk_questionnaire_review_flow.py ../tests/backend/pytest/api/v1/test_risk_questionnaires_notifications.py ../tests/backend/pytest/api/v1/test_riskhub_questionnaires.py`
- Backend issue workflow/deadline: `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/api/v1/test_issue_workflow.py ../tests/backend/pytest/api/v1/test_issues_crud_api.py ../tests/backend/pytest/api/v1/test_issues_rbac_api.py ../tests/backend/pytest/test_issue_deadline_service.py`
- Backend report export scope/as-of: `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_reports_rbac.py ../tests/backend/pytest/api/v1/test_reports_audit.py`
- Backend dashboard committee/quarterly: `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_dashboard.py ../tests/backend/pytest/test_dashboard_committee_vendor_metrics.py ../tests/backend/pytest/test_admin_snapshots.py`
- Backend Redis integration marker: `cd backend && pytest -m redis_integration -q`
- Frontend unit tests: `cd frontend && npm run test:run` (blocking in PR CI)
- Frontend capability/schema regressions: `cd frontend && npm run test:run -- ../tests/frontend/unit/src/services/__tests__/responseSchema.nullability.test.ts ../tests/frontend/unit/src/pages/__tests__/KRIDetailPage.edit-approval.test.tsx ../tests/frontend/unit/src/components/risks/__tests__/riskQuestionnaireOpenFlow.test.tsx ../tests/frontend/unit/src/components/riskhub/__tests__/RiskQuestionnairesPanel.test.tsx ../tests/frontend/unit/src/components/dashboard/__tests__/QuarterlyComparisonWidget.test.tsx`
- Frontend targeted KRI routing regression: `cd frontend && npm run test:run -- src/pages/__tests__/KRIsPage.monitoring-status.test.tsx`
- Frontend targeted vendor grouped-view regression: `cd frontend && npm run test:run -- src/pages/__tests__/VendorsPage.grouped-views.test.tsx`
- Frontend type checks: `cd frontend && npx tsc --noEmit`
- Frontend quality gate chain: `cd frontend && npm run lint && npx tsc --noEmit && npm run quality:debt -- --report-json && node scripts/quality/validate-debt-budget-report.mjs && npm run cleanup:deadcode && node scripts/cleanup/validate-unreachable-report.mjs && node scripts/quality/validate-no-inline-styles.mjs`
- E2E: `make -f scripts/Makefile test-e2e` or `cd frontend && npm run e2e`
- Docker-targeted business-logic E2E: `cd frontend && FRONTEND_URL=http://localhost npm run e2e:business-logic`
- Docker-targeted polish audit: `cd frontend && FRONTEND_URL=http://localhost POLISH_AUDIT_DEEP=1 npx playwright test -c playwright.config.ts ../tests/frontend/e2e/polish-audit.spec.ts --project=chromium`
- Production-profile backend smoke: see `.github/workflows/e2e.yml` job `production-profile-smoke`
- Docs topology consistency: `make -f scripts/Makefile docs-topology-consistency`
- Production contract doc parity: `python3 scripts/security/validate_production_contract_docs.py`
- Release parity (fast loop): `python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts> --skip-prod-readiness`
- Release parity (full gate): `python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts>`

## Release Gate Note

- For production release cuts, parity is a gate and `tests/results/release-parity-audit-<run-id>/decision.json` must report `GO`.
- Fast parity audits are non-blocking monitoring lanes (for `main`/nightly drift visibility), not PR/push required checks.

## E2E CI Contract Notes

- E2E CI must run backend in demo-auth mode: `AUTH_MODE=hybrid_dev`, `DEBUG=true`, `MOCK_AUTH_ENABLED=true`.
- E2E CI also enables scheduler ownership in its single-process backend lane (`ENABLE_SCHEDULER=true`, `SCHEDULER_JOB_PROFILE=outbox_only`) so outbox-dispatched notifications are part of the browser/runtime contract without enabling the unrelated periodic scheduler jobs.
- E2E CI seeding must be strict (no tolerant `|| true`): run `python -m app.db.seed` and `python -m scripts.seed_e2e_all`.
- The canonical base seed now reconciles and repairs the default system risk types required by `/api/v1/riskhub/public-risk-types` and risk-create validation.
- E2E CI should hard-fail if `/api/v1/auth/config` does not report `demo_login_enabled=true`.

## Practical Gaps to Watch

- SQLite-default tests still need the dedicated blocking Postgres regression contract to catch Postgres-specific datetime/enum behavior
- Public first-run and lifecycle wrapper flows rely on the `scripts/install.sh` contract staying stable while the internal implementation lives in `scripts/install_cli.py` and `scripts/install_lib/` on top of `scripts/dev.sh`, `scripts/compose.sh`, and `scripts/deploy.sh`
- Docker-origin Playwright runs still require `FRONTEND_URL=http://localhost`
- Authorization changes should be validated in both backend API tests and frontend gating tests
- Approval-execution changes should include high-confidence regression tests around side effects, stale auto-rejection, and single-apply locking
- KRI history/value changes should verify duplicate-period protection, deterministic latest selection, correction authorization, and approval stale handling
- Questionnaire changes should verify canonical risk visibility, action capability metadata, one-open-questionnaire protection, and per-questionnaire reminder dedupe
- Report export changes should verify post-replay final-row filtering for scoped and explicit department exports
- Committee dashboard changes should verify selected-quarter validation, scoped snapshots, and missing snapshot metadata
- `/kris` filter changes should be validated with the targeted route-backed regression covering monitoring/timeliness ownership, mutual exclusion, grouped-view parity, and rapid-click loading recovery
- `/vendors` grouped-view changes should be validated with the targeted regression covering tab parity, `By Risk` permission gating, overlapping linked-risk membership counts, grouped fetch behavior, and the `Unlinked Risk` fallback
- Route refactors must preserve static-route reachability (guarded by `tests/backend/pytest/test_route_shadowing.py`)
- Time policy regressions are guarded by `tests/backend/pytest/test_timezone_policy.py` + `tests/backend/pytest/test_no_datetime_utcnow.py`

---

*Testing audit refreshed on 2026-04-24*
