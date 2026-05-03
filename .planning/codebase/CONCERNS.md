# Codebase Concerns

**Analysis Date:** 2026-04-25

## High-Risk Hotspots (Require Extra Care)

- Approval side-effect orchestration: `backend/app/services/approval_execution_service.py` and internal modules in `backend/app/services/_approval_execution/`
- KRI history/value submission invariants: `backend/app/services/_kri_history/`, `backend/app/api/v1/endpoints/kris/history.py`, `backend/app/services/_approval_execution/kri_side_effects.py`
- Risk questionnaire lifecycle, clarification, compare-mode, and one-open-questionnaire invariant: `backend/app/services/risk_questionnaire_service.py`, `backend/app/services/_risk_questionnaires/`, `backend/app/api/v1/endpoints/risk_questionnaires/`, `backend/app/api/v1/endpoints/riskhub_questionnaires.py`, `frontend/src/components/risks/risk-questionnaire-detail/`
- Issue remediation completion and exception expiry semantics: `backend/app/services/_issue_workflow/`, `backend/app/services/issue_deadline_service.py`
- Control execution and risk-link serialization: `backend/app/services/_control_execution/`, `backend/app/api/v1/endpoints/executions.py`, `backend/app/api/v1/endpoints/controls/executions.py`, `backend/app/api/v1/endpoints/controls/linking.py`
- Report exports after as-of replay and legacy/peripheral export scoping: `backend/app/api/v1/endpoints/reports/`
- Vendor governance and vendor report scoping: `backend/app/services/_vendor_workflow/`, `backend/app/api/v1/endpoints/vendors/`, `backend/app/services/vendor_reporting_service.py`
- Committee quarterly snapshot semantics: `backend/app/services/quarterly_comparison_service.py`, `backend/app/services/_quarterly_comparison/`, `backend/app/api/v1/endpoints/dashboard/quarterly.py`
- Cross-entity link management: shared frontend dialog/workflow helpers and backend vendor-link endpoints must preserve stale-response guards, restore behavior, and visibility filtering (`frontend/src/components/linking/`, `backend/app/api/v1/endpoints/vendor_links.py`)
- Directory identity lifecycle: provider reconciliation must not overwrite RiskHub-local access fields after user creation; break-glass remains temporary and tightly capability-gated (`backend/app/services/directory_identity_service.py`, `backend/app/services/_access_workflow/`, `frontend/src/pages/users/BreakGlassEnableDialog.tsx`)
- RBAC scope enforcement consistency between backend and frontend gating: `backend/app/core/permissions.py`, `backend/app/core/_permissions/`, `frontend/src/authz/useAuthz.ts`, and backend capability metadata consumed by frontend action surfaces
- Time policy (UTC-aware timestamps) and coercion boundaries: `backend/app/core/datetime_utils.py`
- SSO token verification + exchange flow: `backend/app/services/sso_token_service.py`, `backend/app/api/v1/endpoints/auth/sso.py`, `frontend/src/services/entraAuth.ts`
- Admin auth/session workflow: `backend/app/services/_auth_session_workflow/`, `backend/app/api/v1/endpoints/admin/console.py`, `frontend/src/pages/admin-console/sections/AdminConsoleOpsPanels.tsx`
- Role/permission seed consistency across seed scripts: `backend/app/db/seed.py`, `backend/scripts/seed_*.py`
- Mock auth and demo-login boundaries: `backend/app/main.py`, `backend/app/api/v1/endpoints/auth/demo.py`

## Timezone & Datetime Regression Risk

- Current policy is “timezone-aware UTC everywhere”, enforced by tests (`tests/backend/pytest/test_timezone_policy.py`, `tests/backend/pytest/test_no_datetime_utcnow.py`).
- Remaining risk is primarily around future contributors reintroducing naive datetimes at boundaries (payloads, script seeds) instead of using `coerce_utc()` / `utc_now()` (`backend/app/core/datetime_utils.py`).
- Postgres confidence relies on periodically running `pytest -m postgres` (SQLite will not catch all tz/typing issues) (`tests/backend/pytest/conftest.py`).

## Large, Dense Modules

- Many “giant endpoints” have been split into packages with subrouters, but a few modules remain relatively dense and should be refactored carefully:
  - Unified exports logic: `backend/app/api/v1/endpoints/reports/unified_exports/exports.py`
  - KRI history endpoints: `backend/app/api/v1/endpoints/kris/history.py`
  - Dashboard committee endpoints: `backend/app/api/v1/endpoints/dashboard/committee.py`
  - Approvals resolution endpoints: `backend/app/api/v1/endpoints/approvals/resolve.py`

## Authentication and Session Risks

- Client auth/session state is centralized in the in-memory `sessionStore`; keep `frontend/src/services/bootstrapSessionCache.ts` as a compatibility layer only and prevent new duplicate auth-state adapters from reappearing
- Dev/demo auth paths are intentionally present and must remain production-disabled (`backend/app/main.py`, `backend/app/api/v1/endpoints/auth/demo.py`)
- SSO token verification is monkeypatched in tests via `app.api.v1.endpoints.auth.verify_entra_id_token` and requires facade-style attribute lookup to keep patching working through refactors (`backend/app/api/v1/endpoints/auth/__init__.py`, `backend/app/api/v1/endpoints/auth/sso.py`)

## Scheduler Operational Risk

- Background scheduler can duplicate jobs if enabled in more than one backend process
- Non-Postgres runtimes now fail fast if scheduler/outbox execution is started with multiple workers, but duplicate-job risk still depends on deployment discipline for PostgreSQL-backed scheduler ownership (`backend/app/core/scheduler.py`, `backend/app/services/outbox/store.py`)
- Deadline notification dedupe must remain scoped to the real business event, not only the resource row. KRI reporting reminders are period-aware, KRI breach reminders are state/message-aware, and questionnaire reminders are per questionnaire instance while still navigating to the parent risk.

## Production Boundary Risk

- Broad private-network `TRUSTED_PROXIES` values are production-fatal unless explicitly overridden; operators need to make that trust decision deliberately (`backend/app/main.py`, `backend/app/core/config.py`)
- Graph auth now separates dependency, credential, token-response, and transient failures, but the boundary remains security-sensitive because it drives production directory lookups and token caching (`backend/app/services/graph_directory_auth.py`, `backend/app/services/graph_directory_errors.py`)

## Log Growth and Operational Hygiene

- Repository root contains very large dev log artifacts (e.g. `.dev-backend.log`), which can impact local disk usage and tooling performance
- Ongoing cleanup policy and log rotation discipline should be enforced for local/dev workflows; `./scripts/install.sh doctor --mode dev` warns when `backend/logs` or `tests/results` grow beyond the local artifact budget.

## Test-Parity Risk

- Most backend tests run on SQLite fixtures (`tests/backend/pytest/conftest.py`)
- Critical paths with Postgres behavior (timestamps, SQL semantics, asyncpg strictness) need recurring `-m postgres` validation

## Recommended Ongoing Mitigations

- Keep explicit regression tests on approval execution and timezone-sensitive writes
- Validate RBAC/workflow changes with both API and UI-gating/capability tests
- Access-management and Risk Hub config changes need extra care: access-user responses carry backend capability flags, role permission replacement must validate all new permission IDs before deleting existing mappings, and department delete checks must include users, risks, controls, KRIs, vendors, and pending orphans.
- Orphan governance resolution is a structural mutation: stale target rows must reject before owner/department/link changes, list/detail scope must use the final target entity department, and admin batch fixes must call the same resolver as `/orphaned-items/{id}/resolve`.
- Prefer incremental decomposition of oversized endpoint modules during feature work
- Periodically reconcile seed scripts with `docs/BUSINESS_LOGIC.md`
- Keep user manuals free of implementation language; maintainer metadata belongs in frontmatter and admin/operator surfaces, not the user reader body.

---

*Concerns audit refreshed on 2026-04-25*
