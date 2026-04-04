# RiskHub Testing Guide

> **Version**: 1.7
> **Last Updated**: 2026-03-29
> **Audience**: Engineering, QA
> **Source of Truth**: `tests/backend/pytest/`, `backend/pytest.ini`, `frontend/package.json`, `tests/frontend/e2e/playwright.config.ts`

This guide defines the current testing matrix for backend, frontend unit tests, frontend E2E, and docs-related verification.

## Testing Matrix

| Surface | Command | Purpose |
|---|---|---|
| Backend RBAC/authz sweep | `cd . && PYTHONPATH=backend pytest tests/backend/pytest/test_activity_log.py tests/backend/pytest/test_orphaned_items_scan_and_stats.py tests/backend/pytest/test_executions.py tests/backend/pytest/api/v1/test_issues_rbac_api.py tests/backend/pytest/api/v1/test_dashboard_issue_metrics.py tests/backend/pytest/api/v1/test_reports_issues.py tests/backend/pytest/test_seed_rbac_parity.py -q` | Focused admin-boundary, RBAC, and seed-contract regression pack |
| Backend targeted | `cd backend && venv/bin/pytest ../tests/backend/pytest/test_admin_docs.py -q` | Docs endpoint behavior and locale fallback |
| Backend reliability targeted | `cd backend && pytest -q ../tests/backend/pytest/test_scheduler_runtime.py ../tests/backend/pytest/test_outbox_approval_flow.py ../tests/backend/pytest/test_aggregate_overviews.py ../tests/backend/pytest/test_orphaned_items_scan_and_stats.py` | Scheduler ownership, outbox retry path, aggregate overview endpoints, and governance overview |
| Backend broad | `make -f scripts/Makefile test` | Full backend regression |
| Backend lint + suppression budget | `make -f scripts/Makefile lint-backend` | Ruff hard gate plus backend/app suppression budget enforcement |
| Backend Postgres marker | `cd backend && TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test pytest -m postgres -v` | Postgres-sensitive behavior against a dedicated test database |
| Backend Redis integration marker | `cd backend && pytest -m redis_integration -q` | Redis fault-injection resilience checks (Docker-backed) |
| Frontend unit | `cd frontend && npm run test:run` | Component and integration tests |
| Frontend KRI filter regression | `cd frontend && npm run test:run -- src/pages/__tests__/KRIsPage.monitoring-status.test.tsx` | Route-backed `/kris` monitoring/timeliness filters, rapid-click loading safety, and grouped-view parity |
| Frontend vendor grouped-view regression | `cd frontend && npm run test:run -- src/pages/__tests__/VendorsPage.grouped-views.test.tsx` | `/vendors` grouped tabs, `By Risk` permission gating, overlapping risk-group membership, and `Unlinked Risk` fallback |
| Frontend reliability targeted | `cd frontend && npm run test:run -- src/components/layout/__tests__/SidebarPolling.test.tsx src/components/notifications/__tests__/NotificationBell.test.tsx src/hooks/__tests__/useAdaptivePollingQuery.test.tsx src/pages/__tests__/DashboardPage.overview.test.tsx src/pages/__tests__/GovernancePage.overview.test.tsx src/pages/admin-console/__tests__/AdminConsoleOpsPanels.outbox.test.tsx src/services/__tests__/accessTokenStore.test.ts src/services/__tests__/apiClient.401-recovery.test.ts` | Aggregate polling, admin outbox panel, and auth/bootstrap regression pack |
| Frontend docs UI | `cd frontend && npm run test:run -- src/components/settings/__tests__/DocumentationSettings.test.tsx` | Docs cards/filter/audience behavior |
| Frontend types | `cd frontend && npx tsc --noEmit` | Type safety gate |
| Frontend quality chain | `cd frontend && npm run lint && npx tsc --noEmit && npm run quality:debt -- --report-json && npm run cleanup:deadcode && npm run build` | Full frontend production quality gate |
| Frontend E2E | `cd frontend && npm run e2e` | Browser-level regression |
| Frontend business-logic E2E | `cd frontend && npm run e2e:business-logic` | Focused role/scope/admin-boundary and workflow regression |
| Docs topology consistency | `cd . && make -f scripts/Makefile docs-topology-consistency` | README coverage, docs tree audit scope, and structure metrics consistency |
| Suppression budget only | `cd . && make -f scripts/Makefile quality-suppression-budget` | Enforce backend suppression allowlist max budget/no-expired entries |
| Docs contract | `cd . && python3 scripts/check_docs_contract.py` | Header/parity/link/audience checks |
| Release parity (fast, non-blocking lane) | `python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts> --skip-prod-readiness` | Monitoring lane for startup/dependency/UI parity checks (main/nightly; not PR-blocking) |
| Release parity (full) | `python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts>` | Final pre-release parity gate including prod-readiness execution/ingestion |

## Backend Testing Notes

- `backend/pytest.ini` defines discovery and default coverage settings.
- SQLite in-memory is used by default test path unless `TEST_DATABASE_URL` is set.
- Postgres-specific tests are marked with `@pytest.mark.postgres`.
- When the Docker app stack is using the live `riskhub` database, point Postgres marker runs at a sibling `riskhub_test` database instead; Postgres-mode truncates tables between tests.
- Advisory-lock coverage is only valid in Postgres mode. Do not treat SQLite-only passes as sufficient for scheduler ownership enforcement.
- Redis integration tests are marked with `@pytest.mark.redis_integration` and require Docker-backed test dependencies.
- For docs endpoint behavior, keep role-scoped fixtures (`client_platform_admin`, `client_cro`, `client_employee`) green.

## Development Startup

- Canonical startup guidance lives in [`docs/development/README.md`](./development/README.md).
- Use `./scripts/dev.sh` for active local backend/frontend iteration.
- Use `./scripts/compose.sh up` for Docker onboarding/manual appliance-style runs.
- Use `./scripts/compose.sh reset --dataset test` for deterministic Docker-backed E2E fixture resets.

## Local Startup Preflight

- `./scripts/dev.sh` now performs a schema-head preflight before it starts the local backend in `full` and `backend` modes.
- If the connected non-SQLite database revision does not match the app head, startup stops before the frontend is launched.
- The expected recovery path is:

```bash
cd backend
./venv/bin/alembic upgrade head
```

- After a local backend launch attempt, `scripts/dev.sh` also verifies backend readiness and prints the backend log tail immediately if startup failed during lifespan initialization.
- Docker onboarding/reset paths intentionally keep the app startup guards unchanged; migrations and base seeding happen in the `./scripts/compose.sh` bootstrap flow rather than by weakening app startup checks.

## Docker Live Verification

Preferred deterministic path:

```bash
./scripts/compose.sh reset --dataset test
```

Current behavior:

- `./scripts/compose.sh reset --dataset test` is the canonical deterministic Docker path for migrations, base seed, deterministic E2E seed, and app startup.
- The Docker bootstrap service now reuses the backend runtime image and runs migrations + seed commands inline.
- Docker Compose now inherits the backend image's Python healthcheck instead of overriding it with `curl`.

Preflight:

```bash
curl -fsS http://localhost:8000/api/v1/health
curl -fsS http://localhost:8000/api/v1/auth/config
curl -I -fsS http://localhost/login
```

Docker-targeted verification commands:

```bash
cd backend
TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test pytest -m postgres -v

cd ../frontend
FRONTEND_URL=http://localhost npm run e2e:business-logic
FRONTEND_URL=http://localhost POLISH_AUDIT_DEEP=1 npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/polish-audit.spec.ts --project=chromium
```

Current browser-lane caveats:

- `polish-audit.spec.ts` automates `riskhub` and `light` themes; `dark` still requires manual verification.
- Docker-targeted Playwright runs should set `FRONTEND_URL=http://localhost`; the shared demo-login helper is now origin-aware for both the local Vite app and the Docker nginx surface.

## Frontend Testing Notes

- Unit/integration tests run with Vitest.
- Docs UI behavior is covered in `DocumentationSettings.test.tsx`.
- `/kris` route regressions must include `src/pages/__tests__/KRIsPage.monitoring-status.test.tsx`.
- The KRI regression gate must cover URL-sourced monitoring/timeliness filters, mutual exclusion between those filters, rapid filter-click loading recovery, and grouped-view parity.
- `/vendors` grouped-view regressions must include `src/pages/__tests__/VendorsPage.grouped-views.test.tsx`.
- The vendor grouped-view regression gate must cover `All` vs grouped tabs, `By Risk` visibility only with readable risks, grouped fetch behavior under active filters, overlapping vendor membership across linked risks, the `Unlinked Risk` fallback bucket, and `By Flag` multi-membership with the `Insignificant vendors` fallback.
- Vendor detail parity regressions should run:
  - `cd frontend && npx vitest run -c ../tests/frontend/unit/vitest.config.ts src/pages/__tests__/VendorDetailPage.presentation.test.ts src/pages/__tests__/VendorDetailPage.issue-entry.test.tsx src/pages/__tests__/RiskForms.vendor-context.test.tsx src/pages/__tests__/ControlForms.vendor-context.test.tsx src/pages/__tests__/KRIForms.vendor-context.test.tsx src/pages/__tests__/KRIDetailPage.edit-approval.test.tsx src/components/__tests__/KRIForm.vendor-context.test.tsx src/components/__tests__/KRIModal.vendor-selection.test.tsx`
  - `cd frontend && npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/vendors.spec.ts ../tests/frontend/e2e/issues-contextual-create.spec.ts`
- The vendor detail regression gate must cover risk-detail-style linked sections, split action bars (`Link Existing` + `Add Risk` / `Add Control` / `Add KRI`), archived linked-item group rendering, vendor-linked KRIs, transactional vendor-context KRI create, and approval-aware KRI edit save behavior.
- Vendor-centric grouped-view regressions should run:
  - `cd frontend && npx vitest run -c ../tests/frontend/unit/vitest.config.ts src/pages/__tests__/RisksPage.presentation.test.ts src/pages/__tests__/ControlsPage.presentation.test.ts src/pages/__tests__/IssuesPage.grouped-views.test.tsx src/pages/__tests__/KRIsPage.monitoring-status.test.tsx src/pages/__tests__/VendorsPage.grouped-views.test.tsx`
  - `cd frontend && npx playwright test -c ../tests/frontend/e2e/playwright.config.ts --project=chromium ../tests/frontend/e2e/risks.spec.ts ../tests/frontend/e2e/controls.spec.ts ../tests/frontend/e2e/kris.spec.ts ../tests/frontend/e2e/vendors.spec.ts ../tests/frontend/e2e/issues-workflow.spec.ts --grep "groups linked risks by vendor|groups linked controls by vendor|groups linked KRIs by vendor|groups vendors by flag|links an existing KRI|groups vendor-context issues by vendor"`
- Backend vendor-link regressions must cover linked KRI list/link/unlink behavior and vendor summaries on risk/control/issue/KRI list payloads:
  - `cd  && PYTHONPATH=backend pytest tests/backend/pytest/test_vendor_links.py -q`
- Playwright runs live browser flows from `tests/frontend/e2e`.
- CI E2E contract requires demo auth mode:
  - backend env includes `AUTH_MODE=hybrid_dev`, `DEBUG=true`, `MOCK_AUTH_ENABLED=true`
  - deterministic seed commands run without tolerance (`python -m app.db.seed` and `python -m scripts.seed_e2e_all`)
  - backend preflight must confirm `/api/v1/auth/config` reports `demo_login_enabled=true`
- Role-sensitive behavior must be verified for admin/non-admin views when docs contracts change.

## Release Gate (Parity)

- For release candidates, parity artifacts are emitted under `tests/results/release-parity-audit-<run-id>/`.
- Evaluate `decision.json` at that path.
- Release candidate is blocked unless parity `decision` is `GO`.
- Fast parity audits are intentionally non-blocking and should run on `main` and/or nightly schedules for drift monitoring.

## Quality Gate Contract (Blocking)

- Frontend dead-code non-regression is enforced by `npm run cleanup:deadcode` in local Make targets and CI lint workflow.
- Frontend debt budget non-regression is enforced by `npm run quality:debt -- --report-json`.
- Backend suppression non-regression is enforced by `scripts/tools/suppression_budget.py` against:
  - `scripts/quality/backend-suppression-allowlist.json`
- Docs topology consistency is enforced by `make -f scripts/Makefile docs-topology-consistency`.

## Docs Change Verification (Required)

When editing documentation libraries (`docs/admin*`, `docs/user*`) or docs endpoint behavior:

```bash
cd ""
python3 scripts/check_docs_contract.py
make -f scripts/Makefile docs-topology-consistency

cd backend
venv/bin/pytest ../tests/backend/pytest/test_admin_docs.py -q

cd ../frontend
npm run test:run -- src/components/settings/__tests__/DocumentationSettings.test.tsx
npx tsc --noEmit
```

For RBAC/docs reconciliation sweeps that touch role boundaries or permission contracts, add:

```bash
cd ""
PYTHONPATH=backend pytest tests/backend/pytest/test_activity_log.py tests/backend/pytest/test_orphaned_items_scan_and_stats.py tests/backend/pytest/test_executions.py tests/backend/pytest/api/v1/test_issues_rbac_api.py tests/backend/pytest/api/v1/test_dashboard_issue_metrics.py tests/backend/pytest/api/v1/test_reports_issues.py tests/backend/pytest/test_seed_rbac_parity.py -q

cd frontend
npm run e2e:business-logic
```

For vendor grouped-view/detail documentation or permission-gating changes, also add:

```bash
cd ""
PYTHONPATH=backend pytest tests/backend/pytest/test_vendors.py tests/backend/pytest/test_vendor_links.py -q

cd frontend
npm run test:run -- src/pages/__tests__/VendorsPage.grouped-views.test.tsx
npx vitest run -c ../tests/frontend/unit/vitest.config.ts src/pages/__tests__/VendorDetailPage.presentation.test.ts src/pages/__tests__/VendorDetailPage.issue-entry.test.tsx
npx vitest run -c ../tests/frontend/unit/vitest.config.ts src/pages/__tests__/RiskForms.vendor-context.test.tsx src/pages/__tests__/ControlForms.vendor-context.test.tsx src/pages/__tests__/KRIForms.vendor-context.test.tsx src/pages/__tests__/KRIDetailPage.edit-approval.test.tsx src/components/__tests__/KRIForm.vendor-context.test.tsx src/components/__tests__/KRIModal.vendor-selection.test.tsx
npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/vendors.spec.ts ../tests/frontend/e2e/issues-contextual-create.spec.ts
```

For vendor-centric grouped views and vendor-linked KRI changes, also add:

```bash
cd ""
PYTHONPATH=backend pytest tests/backend/pytest/test_vendor_links.py -q

cd frontend
npx vitest run -c ../tests/frontend/unit/vitest.config.ts src/pages/__tests__/RisksPage.presentation.test.ts src/pages/__tests__/ControlsPage.presentation.test.ts src/pages/__tests__/IssuesPage.grouped-views.test.tsx src/pages/__tests__/KRIsPage.monitoring-status.test.tsx src/pages/__tests__/VendorsPage.grouped-views.test.tsx
npx playwright test -c ../tests/frontend/e2e/playwright.config.ts --project=chromium ../tests/frontend/e2e/risks.spec.ts ../tests/frontend/e2e/controls.spec.ts ../tests/frontend/e2e/kris.spec.ts ../tests/frontend/e2e/vendors.spec.ts ../tests/frontend/e2e/issues-workflow.spec.ts --grep "groups linked risks by vendor|groups linked controls by vendor|groups linked KRIs by vendor|groups vendors by flag|links an existing KRI|groups vendor-context issues by vendor"
```

## Troubleshooting

- If docs endpoint tests fail after locale edits, verify per-file fallback logic and file parity.
- If docs UI tests fail, inspect expected tags/audience labels in mocked payloads.
- If type-check fails, ensure docs API interfaces still include `audience` and `tags`.
