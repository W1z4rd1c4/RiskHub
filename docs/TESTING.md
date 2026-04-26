# RiskHub Testing Guide

> **Version**: 1.9
> **Last Updated**: 2026-04-25
> **Audience**: Engineering, QA
> **Source of Truth**: `tests/backend/pytest/`, `backend/pytest.ini`, `frontend/package.json`, `frontend/playwright.config.ts`

This guide defines the current testing matrix for backend, frontend unit tests, frontend E2E, and docs-related verification.

## Testing Matrix

| Surface | Command | Purpose |
|---|---|---|
| Backend RBAC/authz sweep | `cd . && PYTHONPATH=backend pytest tests/backend/pytest/test_activity_log.py tests/backend/pytest/test_orphaned_items_scan_and_stats.py tests/backend/pytest/test_executions.py tests/backend/pytest/api/v1/test_issues_rbac_api.py tests/backend/pytest/api/v1/test_dashboard_issue_metrics.py tests/backend/pytest/api/v1/test_reports_issues.py tests/backend/pytest/test_seed_rbac_parity.py -q` | Focused admin-boundary, RBAC, and seed-contract regression pack |
| Authorization capability contract | `cd . && python3 scripts/security/validate_authz_capability_contract.py` | Enforces `docs/security/authorization-capability-contract.md` + JSON shape and requires authz-sensitive diffs to update the contract |
| Backend targeted | `cd backend && venv/bin/pytest ../tests/backend/pytest/test_admin_docs.py -q` | Docs endpoint behavior and locale fallback |
| Backend reliability targeted | `cd backend && pytest -q ../tests/backend/pytest/test_scheduler_runtime.py ../tests/backend/pytest/test_outbox_approval_flow.py ../tests/backend/pytest/test_aggregate_overviews.py ../tests/backend/pytest/test_orphaned_items_scan_and_stats.py` | Scheduler ownership, outbox fatal-vs-retry policy, SQLite single-worker guard, aggregate overview endpoints, and governance overview |
| Backend KRI history/value workflow | `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_kris_history_listing_api.py ../tests/backend/pytest/test_kris_history_corrections_api.py ../tests/backend/pytest/test_kris_value_submission_api.py ../tests/backend/pytest/test_kris_submission_rbac_api.py ../tests/backend/pytest/test_kris_rbac.py ../tests/backend/pytest/test_approvals.py` | KRI read policy, value submission, duplicate-period protection, correction policy, and stale approval handling |
| Backend questionnaire workflow | `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/api/v1/test_risk_questionnaires.py ../tests/backend/pytest/api/v1/test_risk_questionnaire_review_flow.py ../tests/backend/pytest/api/v1/test_risk_questionnaires_notifications.py ../tests/backend/pytest/api/v1/test_riskhub_questionnaires.py` | Questionnaire visibility, capabilities, batch send, one-open invariant, clarification, and reminder dedupe |
| Backend issue workflow/deadline | `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/api/v1/test_issue_workflow.py ../tests/backend/pytest/api/v1/test_issues_crud_api.py ../tests/backend/pytest/api/v1/test_issues_rbac_api.py ../tests/backend/pytest/test_issue_deadline_service.py` | Remediation completion invariant, close validation, exception revoke/expiry, RBAC, CRUD surfaces, and link-backed source provenance |
| Backend deadline/notification scheduler | `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_deadline_notifications.py ../tests/backend/pytest/test_kri_deadline_service.py ../tests/backend/pytest/test_issue_deadline_service.py ../tests/backend/pytest/api/v1/test_risk_questionnaires_notifications.py ../tests/backend/pytest/test_scheduler_runtime.py` | Shared deadline dedupe, KRI period/state-aware reminders, issue exception suppression, questionnaire reminder dedupe, and scheduler run semantics |
| Backend report export scope/as-of | `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_reports_rbac.py ../tests/backend/pytest/api/v1/test_reports_audit.py ../tests/backend/pytest/api/v1/test_reports_export_pipeline.py ../tests/backend/pytest/api/v1/test_reports_issues.py ../tests/backend/pytest/test_vendor_reports.py` | Post-replay department filtering, strict explicit department filters, audit linked-risk visibility, vendor evidence exports, and legacy export behavior |
| Backend vendor governance/reports | `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_vendors.py ../tests/backend/pytest/test_vendor_reports.py ../tests/backend/pytest/test_vendor_links.py` | Vendor visibility, owner exceptions, strict department report filters, lifecycle actions, and link behavior |
| Backend control execution/linking | `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_executions.py ../tests/backend/pytest/test_controls.py ../tests/backend/pytest/test_cross_department_access.py` | Control execution creation, inactive/archived-control conflicts, deterministic execution ordering, linked-risk filtering, ownership exceptions, and control-risk linking |
| Backend access/Risk Hub config | `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_access_management.py ../tests/backend/pytest/test_users.py ../tests/backend/pytest/test_riskhub_roles.py ../tests/backend/pytest/test_riskhub_departments.py ../tests/backend/pytest/test_admin_sessions.py` | Access split policy, backend capability metadata, admin session workflow, atomic role permission replacement, department manager validation, and delete blockers |
| Backend SSO/auth session boundary | `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_admin_sessions.py ../tests/backend/pytest/test_sso_token_service.py ../tests/backend/pytest/test_sso_exchange.py ../tests/backend/pytest/test_auth_refresh.py ../tests/backend/pytest/test_auth_config_endpoint.py` | Admin session revocation, token-version invalidation, SSO challenge/exchange, verifier cache-key separation, outbound guard coverage, and refresh-token contracts |
| Backend orphan governance | `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_admin_orphans.py ../tests/backend/pytest/test_orphaned_items_scan_and_stats.py ../tests/backend/pytest/test_user_deactivation_orphans.py` | Orphan scan/stats/read scope, capability metadata, stale resolution conflicts, and admin batch fix parity |
| Backend dashboard committee/quarterly | `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_dashboard.py ../tests/backend/pytest/test_dashboard_committee_vendor_metrics.py ../tests/backend/pytest/test_admin_snapshots.py` | Quarter validation, scoped snapshots, missing snapshot metadata, and admin snapshot capture |
| Backend install contract | `cd backend && pytest -q ../tests/backend/pytest/test_install_script_contracts.py ../tests/backend/pytest/test_startup_script_contracts.py` | Public `scripts/install.sh` and startup wrapper contract, including the Python-backed lifecycle control plane |
| Backend broad | `make -f scripts/Makefile test` | Full backend regression excluding the `benchmark` marker |
| Backend fast (SQLite) | `make -f scripts/Makefile test-fast` | Fast backend regression on the default SQLite harness |
| Backend PR CI (SQLite) | `cd backend && pytest -m "not postgres and not benchmark" -q` | Blocking PR lane for broad backend regression on the default fast harness |
| Backend lint (maintainer lane) | `make -f scripts/Makefile lint-backend` | Maintainer-focused Ruff plus suppression budget visibility; not part of the protected PR path in Phase 253 |
| Backend Postgres marker | `cd backend && TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test pytest -m postgres -v` | Postgres-sensitive behavior against a dedicated test database |
| Backend PR CI (Postgres) | `TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_test@localhost:5432/riskhub_test make -f scripts/Makefile test-postgres-ci` | Blocking PR lane for Postgres marker coverage plus the broader DB-sensitive regression contract |
| Backend Redis integration marker | `cd backend && pytest -m redis_integration -q` | Redis fault-injection resilience checks (Docker-backed) |
| Frontend unit | `cd frontend && npm run test:run` | Component and integration tests; PR-blocking in CI |
| Frontend KRI filter regression | `cd frontend && npm run test:run -- src/pages/__tests__/KRIsPage.monitoring-status.test.tsx` | Route-backed `/kris` monitoring/timeliness filters, rapid-click loading safety, and grouped-view parity |
| Frontend vendor grouped-view regression | `cd frontend && npm run test:run -- src/pages/__tests__/VendorsPage.grouped-views.test.tsx` | `/vendors` grouped tabs, `By Risk` permission gating, overlapping risk-group membership, and `Unlinked Risk` fallback |
| Frontend vendor governance/report regressions | `cd frontend && npm run test:run -- ../tests/frontend/unit/src/components/__tests__/VendorForm.test.tsx ../tests/frontend/unit/src/components/__tests__/VendorForm.payloads.test.ts ../tests/frontend/unit/src/pages/__tests__/VendorsPage.grouped-views.test.tsx ../tests/frontend/unit/src/pages/__tests__/VendorDetailPage.presentation.test.ts ../tests/frontend/unit/src/services/__tests__/vendorReportApi.test.ts` | Vendor form payloads, capability-driven detail/list actions, grouped views, and report department filter requests |
| Frontend control execution/detail regressions | `cd frontend && npm run test:run -- ../tests/frontend/unit/src/components/__tests__/ExecutionHistory.test.tsx ../tests/frontend/unit/src/pages/__tests__/ControlDetailPage.execution-status.test.tsx ../tests/frontend/unit/src/pages/__tests__/ControlDetailPage.issue-entry.test.tsx ../tests/frontend/unit/src/pages/__tests__/ControlsPage.presentation.test.ts` | Execution history rendering, retryable load errors, execution-specific issue entry, control detail monitoring, and capability-aware action visibility |
| Frontend access/Risk Hub capability regressions | `cd frontend && npm run test:run -- ../tests/frontend/unit/src/components/access/AccessEditModal.test.tsx ../tests/frontend/unit/src/pages/__tests__/UsersPage.sso-cta.test.tsx` | Access modal backend capability precedence and Users page SSO/access visibility |
| Frontend SSO/admin session UI | `cd frontend && npm run test:run -- ../tests/frontend/unit/src/pages/__tests__/SsoCallbackPage.test.tsx ../tests/frontend/unit/src/pages/__tests__/UserNewPage.sso.test.tsx ../tests/frontend/unit/src/pages/__tests__/UsersPage.sso-cta.test.tsx ../tests/frontend/unit/src/pages/admin-console/__tests__/AdminConsoleOpsPanels.sessions.test.tsx` | SSO callback denied/unavailable handling, directory CTA visibility, admin session names/emails, and revoke-error refresh behavior |
| Frontend reliability targeted | `cd frontend && npm run test:run -- src/components/layout/__tests__/SidebarPolling.test.tsx src/components/notifications/__tests__/NotificationBell.test.tsx src/hooks/__tests__/useAdaptivePollingQuery.test.tsx src/pages/__tests__/DashboardPage.overview.test.tsx src/pages/__tests__/GovernancePage.overview.test.tsx src/pages/admin-console/__tests__/AdminConsoleOpsPanels.outbox.test.tsx src/services/__tests__/accessTokenStore.test.ts src/services/__tests__/sessionManager.test.ts src/services/__tests__/apiClient.401-recovery.test.ts src/services/__tests__/authTimeoutFlow.test.ts src/contexts/__tests__/AuthLogoutFlow.test.tsx src/contexts/__tests__/AuthBootstrapRouteGuard.test.tsx src/contexts/__tests__/AuthSessionAuthority.test.tsx` | Aggregate polling, admin outbox panel, and canonical auth/session regression pack under `frontend/src/services/session/**` |
| Frontend orphan governance | `cd frontend && npm run test:run -- ../tests/frontend/unit/src/components/governance/OrphanedItemsTable.test.tsx ../tests/frontend/unit/src/pages/__tests__/GovernancePage.overview.test.tsx` | Governance overview loading and backend capability-driven orphan resolve action visibility |
| Frontend notification routing | `cd frontend && npm run test:run -- ../tests/frontend/unit/src/components/notifications/__tests__/NotificationBell.test.tsx ../tests/frontend/unit/src/services/__tests__/notificationsApi.test.ts` | Notification bell rendering, resource path mapping, and notifications API schema behavior |
| Frontend docs UI | `cd frontend && npm run test:run -- src/components/settings/__tests__/DocumentationSettings.test.tsx` | Docs cards/filter/audience behavior |
| Frontend workflow capability/schema tests | `cd frontend && npm run test:run -- ../tests/frontend/unit/src/services/__tests__/responseSchema.nullability.test.ts ../tests/frontend/unit/src/pages/__tests__/KRIDetailPage.edit-approval.test.tsx ../tests/frontend/unit/src/components/risks/__tests__/riskQuestionnaireOpenFlow.test.tsx ../tests/frontend/unit/src/components/riskhub/__tests__/RiskQuestionnairesPanel.test.tsx ../tests/frontend/unit/src/components/dashboard/__tests__/QuarterlyComparisonWidget.test.tsx` | Runtime schema compatibility and capability-driven UI for KRI, questionnaires, Risk Hub, and committee snapshots |
| Frontend capability/display guardrails | `cd frontend && npm run test:run -- ../tests/frontend/unit/src/lib/capabilities.test.ts ../tests/frontend/unit/src/quality/noRawIdDisplay.test.ts` | Shared backend-first capability resolver and protected no-raw-ID display surfaces |
| Frontend types | `cd frontend && npx tsc --noEmit` | Type safety gate |
| Frontend quality chain | `cd frontend && npm run lint && npx tsc --noEmit && npm run quality:debt -- --report-json && node scripts/quality/validate-debt-budget-report.mjs && npm run cleanup:deadcode && node scripts/cleanup/validate-unreachable-report.mjs && node scripts/quality/validate-no-inline-styles.mjs` | Frontend lint/type/debt/dead-code/inline-style gate mirrored by CI |
| Frontend E2E | `cd frontend && npm run e2e` | Browser-level regression |
| Frontend business-logic E2E | `cd frontend && npm run e2e:business-logic` | Focused role/scope/admin-boundary and workflow regression |
| Production-profile smoke | `.github/workflows/e2e.yml` job `production-profile-smoke` | PR-blocking backend startup/auth/header/docs-disabled smoke under production-safe config |
| Docs topology consistency | `cd . && make -f scripts/Makefile docs-topology-consistency` | Maintainer-facing docs governance lane for README coverage, docs tree audit scope, and structure metrics consistency |
| Repo artifact + script syntax contracts | `cd . && make -f scripts/Makefile quality-repo-contracts` | Blocks tracked retired artifacts, tracked ignored paths, broken startup shell syntax, and broken migration/seed script syntax |
| Suppression budget only | `cd . && make -f scripts/Makefile quality-suppression-budget` | Enforce backend suppression allowlist max budget/no-expired entries |
| Docs contract | `cd . && python3 scripts/check_docs_contract.py` | Header/parity/link/audience/manual-section checks |
| Production contract docs parity | `cd . && python3 scripts/security/validate_production_contract_docs.py` | Ensures `.env.example`, deployment reference, and runtime production invariants stay synchronized |
| Release parity (fast, non-blocking lane) | `python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts> --skip-prod-readiness` | Monitoring lane for startup/dependency/UI parity checks (main/nightly; not PR-blocking) |
| Release parity (full) | `python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts>` | Final pre-release parity gate including prod-readiness execution/ingestion |

## Backend Testing Notes

- `backend/pytest.ini` defines discovery and default coverage settings.
- SQLite in-memory is used by the default fast path unless `TEST_DATABASE_URL` is set.
- Postgres-specific tests are marked with `@pytest.mark.postgres`.
- PR CI runs a broad SQLite lane, a blocking Postgres regression contract, a blocking frontend Vitest lane, frontend lint/type/build, and repo/security validators.
- Backend Ruff/mypy debt remains visible in maintainer workflows, but is not part of the protected PR path in this phase.
- Installer regression coverage is anchored to the public `./scripts/install.sh` contract even though the implementation now routes through `scripts/install_cli.py` and `scripts/install_lib/`.
- Schema-sensitive changes should keep the dedicated Postgres pytest lane green; do not rely on browser E2E as the only Postgres signal.
- When the Docker app stack is using the live `riskhub` database, point Postgres marker runs at a sibling `riskhub_test` database instead; Postgres-mode truncates tables between tests.
- Advisory-lock coverage is only valid in Postgres mode. Do not treat SQLite-only passes as sufficient for scheduler ownership enforcement.
- SQLite/non-Postgres outbox dispatch is intentionally single-worker only; if scheduler ownership is enabled with `API_WORKERS>1`, the runtime must fail fast instead of pretending it has Postgres claim semantics.
- Trusted proxy ranges that cover broad private networks now fail closed in production unless `ALLOW_BROAD_TRUSTED_PROXIES_IN_PRODUCTION=true` is set deliberately.
- The Postgres lane is the authority for migration-defined indexes and live schema typing checks, and now runs a named DB-sensitive regression contract instead of only `pytest -m postgres`.
- KRI history/value changes should cover duplicate-period rejection, deterministic latest-row correction, capability metadata, and stale approved value auto-rejection.
- Risk questionnaire changes should cover canonical risk visibility, backend capabilities, one-open-questionnaire protection, batch skip semantics, and per-questionnaire deadline reminder dedupe.
- Issue workflow changes should cover completion normalization, contradictory payload conflicts, progress downgrade from `ready_for_validation`, close prerequisites, and exception expiry/revoke behavior.
- Report export changes should cover post-replay final-row filtering, explicit department strictness, and unfiltered ownership/reporting-owner exceptions.
- Committee dashboard changes should cover selected-quarter validation, live-vs-stored snapshot source selection, scoped snapshots, and missing snapshot metric metadata.
- CI publishes maintainer-only backend quality visibility for suppression budget, full-tree Ruff, and full-tree mypy.
- Redis integration tests are marked with `@pytest.mark.redis_integration` and require Docker-backed test dependencies.
- For docs endpoint behavior, keep role-scoped fixtures (`client_platform_admin`, `client_cro`, `client_employee`) green.

## Development Startup

- Canonical startup guidance lives in [`docs/development/README.md`](./development/README.md).
- Use `./scripts/install.sh dev` for active local backend/frontend iteration.
- Use `./scripts/install.sh demo` for Docker onboarding/manual appliance-style runs.
- Use `./scripts/install.sh demo --reset test` for deterministic Docker-backed E2E fixture resets.
- `./scripts/install.sh` remains the public wrapper; do not bypass it in runbooks even though its lifecycle control plane now lives in Python under `scripts/install_cli.py` and `scripts/install_lib/`.
- Keep `./scripts/dev.sh` and `./scripts/compose.sh` as the underlying advanced/manual entrypoints.

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
./scripts/install.sh demo --reset test
```

Current behavior:

- `./scripts/install.sh demo --reset test` is the canonical deterministic Docker path for migrations, base seed, deterministic E2E seed, and app startup.
- The Docker bootstrap service now reuses the backend runtime image and runs migrations + seed commands inline.
- Docker Compose now inherits the backend image's Python healthcheck instead of overriding it with `curl`.
- The underlying advanced/manual reset command remains `./scripts/compose.sh reset --dataset test`.

Preflight:

```bash
curl -fsS http://localhost:8000/api/v1/readyz
curl -fsS http://localhost:8000/api/v1/health
curl -fsS http://localhost:8000/api/v1/auth/config
curl -I -fsS http://localhost/login
```

Notes:

- `GET /api/v1/readyz` is the machine-facing readiness probe and returns `200` or `503`.
- `GET /api/v1/health` is the diagnostic probe and returns readiness plus dependency detail for dashboards and smoke validation.
- Browser-authenticated `POST /api/v1/auth/refresh` now requires allowed Origin/Referer plus `X-CSRF-Token`, so scripted refresh checks must seed CSRF first via `GET /api/v1/auth/csrf` when they are not using a real browser session.

Docker-targeted verification commands:

```bash
cd backend
TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test pytest -m postgres -v

cd ../frontend
FRONTEND_URL=http://localhost npm run e2e:business-logic
FRONTEND_URL=http://localhost POLISH_AUDIT_DEEP=1 npx playwright test -c playwright.config.ts ../tests/frontend/e2e/polish-audit.spec.ts --project=chromium
```

Current browser-lane caveats:

- `polish-audit.spec.ts` automates `riskhub`, `light`, and `dark` themes.
- Docker-targeted Playwright runs should set `FRONTEND_URL=http://localhost`; the shared demo-login helper is now origin-aware for both the local Vite app and the Docker nginx surface.

## Frontend Testing Notes

- Unit/integration tests run with Vitest.
- Client auth/session truth now lives under `frontend/src/services/session/`; `session/store.ts` is canonical state, `session/manager.ts` is the transition layer, and `session/bootstrap.ts` owns restore behavior.
- Backend rate-limit policy/backend behavior is covered by `tests/backend/pytest/test_rate_limit_components.py`, `test_rate_limit_redis_resilience.py`, and `test_rate_limit_redis_integration.py`.
- Graph auth boundary/cache-key behavior is covered by `tests/backend/pytest/test_graph_directory_components.py` and `test_entra_confidential_credentials.py`.
- Docs UI behavior is covered in `DocumentationSettings.test.tsx`.
- In-app documentation changes should cover both settings-embedded docs and the full documentation page, including user-manual metadata hiding and admin runbook metadata visibility.
- `/kris` route regressions must include `src/pages/__tests__/KRIsPage.monitoring-status.test.tsx`.
- The KRI regression gate must cover URL-sourced monitoring/timeliness filters, mutual exclusion between those filters, rapid filter-click loading recovery, and grouped-view parity.
- `/vendors` grouped-view regressions must include `src/pages/__tests__/VendorsPage.grouped-views.test.tsx`.
- The vendor grouped-view regression gate must cover `All` vs grouped tabs, `By Risk` visibility only with readable risks, grouped fetch behavior under active filters, overlapping vendor membership across linked risks, the `Unlinked Risk` fallback bucket, and `By Flag` multi-membership with the `Insignificant vendors` fallback.
- Vendor detail parity regressions should run:
  - `cd frontend && npx vitest run -c vitest.config.ts ../tests/frontend/unit/src/pages/__tests__/VendorDetailPage.presentation.test.ts ../tests/frontend/unit/src/pages/__tests__/VendorDetailPage.issue-entry.test.tsx ../tests/frontend/unit/src/pages/__tests__/RiskForms.vendor-context.test.tsx ../tests/frontend/unit/src/pages/__tests__/ControlForms.vendor-context.test.tsx ../tests/frontend/unit/src/pages/__tests__/KRIForms.vendor-context.test.tsx ../tests/frontend/unit/src/pages/__tests__/KRIDetailPage.edit-approval.test.tsx ../tests/frontend/unit/src/components/__tests__/KRIForm.vendor-context.test.tsx ../tests/frontend/unit/src/components/__tests__/KRIModal.vendor-selection.test.tsx`
  - `cd frontend && npx playwright test -c playwright.config.ts ../tests/frontend/e2e/vendors.spec.ts ../tests/frontend/e2e/issues-contextual-create.spec.ts`
- The vendor detail regression gate must cover risk-detail-style linked sections, split action bars (`Link Existing` + `Add Risk` / `Add Control` / `Add KRI`), archived linked-item group rendering, vendor-linked KRIs, transactional vendor-context KRI create, and approval-aware KRI edit save behavior.
- Vendor-centric grouped-view regressions should run:
  - `cd frontend && npx vitest run -c vitest.config.ts ../tests/frontend/unit/src/pages/__tests__/RisksPage.presentation.test.ts ../tests/frontend/unit/src/pages/__tests__/ControlsPage.presentation.test.ts ../tests/frontend/unit/src/pages/__tests__/IssuesPage.grouped-views.test.tsx ../tests/frontend/unit/src/pages/__tests__/KRIsPage.monitoring-status.test.tsx ../tests/frontend/unit/src/pages/__tests__/VendorsPage.grouped-views.test.tsx`
  - `cd frontend && npx playwright test -c playwright.config.ts --project=chromium ../tests/frontend/e2e/risks.spec.ts ../tests/frontend/e2e/controls.spec.ts ../tests/frontend/e2e/kris.spec.ts ../tests/frontend/e2e/vendors.spec.ts ../tests/frontend/e2e/issues-workflow.spec.ts --grep "groups linked risks by vendor|groups linked controls by vendor|groups linked KRIs by vendor|groups vendors by flag|links an existing KRI|groups vendor-context issues by vendor"`
- Backend vendor-link regressions must cover linked KRI list/link/unlink behavior and vendor summaries on risk/control/issue/KRI list payloads:
  - `cd  && PYTHONPATH=backend pytest tests/backend/pytest/test_vendor_links.py -q`
- Playwright runs live browser flows from `tests/frontend/e2e`.
- CI E2E contract requires demo auth mode:
  - backend env includes `AUTH_MODE=hybrid_dev`, `DEBUG=true`, `MOCK_AUTH_ENABLED=true`
  - backend env also includes `ENABLE_SCHEDULER=true` together with `SCHEDULER_JOB_PROFILE=outbox_only` so transactional outbox delivery is exercised without enabling the unrelated periodic scheduler jobs in the single-process browser lane
  - deterministic seed commands run without tolerance (`python -m app.db.seed` and `python -m scripts.seed_e2e_all`)
  - the canonical base seed now reconciles and repairs the default system risk types expected by `/riskhub/public-risk-types` and risk-create validation
  - backend preflight must confirm `/api/v1/auth/config` reports `demo_login_enabled=true`
- CI also runs a separate production-profile smoke lane with `DEBUG=false`, `MOCK_AUTH_ENABLED=false`, `AUTH_MODE=microsoft_sso`, explicit `ALLOWED_HOSTS`, `DIRECTORY_PROVIDER=graph`, `ENTRA_JIT_PROVISIONING_ENABLED=false`, `AUTH_SSO_ALLOW_EMAIL_LINK=false`, and live Redis enabled.
- Role-sensitive behavior must be verified for admin/non-admin views when docs contracts change.

## Release Gate (Parity)

- For release candidates, parity artifacts are emitted under `tests/results/release-parity-audit-<run-id>/`.
- Evaluate `decision.json` at that path.
- Release candidate is blocked unless parity `decision` is `GO`.
- Fast parity audits are intentionally non-blocking and should run on `main` and/or nightly schedules for drift monitoring.
- Release parity contract and startup smoke are maintainer-triggered lanes, not PR-required status checks.

## Quality Gate Contract (Blocking)

- Frontend dead-code non-regression is enforced by `npm run cleanup:deadcode` in local maintainer and scheduled workflows.
- Frontend debt budget non-regression is enforced by `npm run quality:debt -- --report-json` in local maintainer and scheduled workflows.
- Frontend debt-budget JSON output is machine-checked by `node scripts/quality/validate-debt-budget-report.mjs`.
- Frontend dead-code report output is machine-checked by `node scripts/cleanup/validate-unreachable-report.mjs`.
- Frontend inline-style regressions are checked by `node scripts/quality/validate-no-inline-styles.mjs`.
- Backend suppression non-regression is enforced by `scripts/tools/suppression_budget.py` against:
  - `scripts/quality/backend-suppression-allowlist.json`
- Docs topology consistency is enforced by `make -f scripts/Makefile docs-topology-consistency` in the maintainer governance lane.
- Repo artifact and script syntax regressions are blocked by `make -f scripts/Makefile quality-repo-contracts`.
- Production contract doc parity is enforced by `python3 scripts/security/validate_production_contract_docs.py`.

## Docs Change Verification (Required)

When editing documentation libraries (`docs/admin*`, `docs/user*`) or docs endpoint behavior:

```bash
cd ""
python3 scripts/check_docs_contract.py
make -f scripts/Makefile docs-topology-consistency

cd backend
venv/bin/pytest ../tests/backend/pytest/test_admin_docs.py -q

cd ../frontend
npm run test:run -- src/components/settings/__tests__/DocumentationSettings.test.tsx src/pages/__tests__/DocumentationPage.test.tsx src/components/documentation
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
npx vitest run -c vitest.config.ts ../tests/frontend/unit/src/pages/__tests__/VendorDetailPage.presentation.test.ts ../tests/frontend/unit/src/pages/__tests__/VendorDetailPage.issue-entry.test.tsx
npx vitest run -c vitest.config.ts ../tests/frontend/unit/src/pages/__tests__/RiskForms.vendor-context.test.tsx ../tests/frontend/unit/src/pages/__tests__/ControlForms.vendor-context.test.tsx ../tests/frontend/unit/src/pages/__tests__/KRIForms.vendor-context.test.tsx ../tests/frontend/unit/src/pages/__tests__/KRIDetailPage.edit-approval.test.tsx ../tests/frontend/unit/src/components/__tests__/KRIForm.vendor-context.test.tsx ../tests/frontend/unit/src/components/__tests__/KRIModal.vendor-selection.test.tsx
npx playwright test -c playwright.config.ts ../tests/frontend/e2e/vendors.spec.ts ../tests/frontend/e2e/issues-contextual-create.spec.ts
```

For vendor-centric grouped views and vendor-linked KRI changes, also add:

```bash
cd ""
PYTHONPATH=backend pytest tests/backend/pytest/test_vendor_links.py -q

cd frontend
npx vitest run -c vitest.config.ts ../tests/frontend/unit/src/pages/__tests__/RisksPage.presentation.test.ts ../tests/frontend/unit/src/pages/__tests__/ControlsPage.presentation.test.ts ../tests/frontend/unit/src/pages/__tests__/IssuesPage.grouped-views.test.tsx ../tests/frontend/unit/src/pages/__tests__/KRIsPage.monitoring-status.test.tsx ../tests/frontend/unit/src/pages/__tests__/VendorsPage.grouped-views.test.tsx
npx playwright test -c playwright.config.ts --project=chromium ../tests/frontend/e2e/risks.spec.ts ../tests/frontend/e2e/controls.spec.ts ../tests/frontend/e2e/kris.spec.ts ../tests/frontend/e2e/vendors.spec.ts ../tests/frontend/e2e/issues-workflow.spec.ts --grep "groups linked risks by vendor|groups linked controls by vendor|groups linked KRIs by vendor|groups vendors by flag|links an existing KRI|groups vendor-context issues by vendor"
```

## Troubleshooting

- If docs endpoint tests fail after locale edits, verify per-file fallback logic and file parity.
- If docs UI tests fail, inspect expected tags/audience labels in mocked payloads.
- If type-check fails, ensure docs API interfaces still include `audience` and `tags`.
