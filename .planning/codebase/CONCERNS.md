# Codebase Concerns

**Analysis Date:** 2026-04-05

## High-Risk Hotspots (Require Extra Care)

- Approval side-effect orchestration: `backend/app/services/approval_execution_service.py` and internal modules in `backend/app/services/_approval_execution/`
- RBAC scope enforcement consistency between backend and frontend gating: `backend/app/core/permissions.py`, `backend/app/core/_permissions/`, `frontend/src/components/PermissionGate.tsx`
- Time policy (UTC-aware timestamps) and coercion boundaries: `backend/app/core/datetime_utils.py`
- SSO token verification + exchange flow: `backend/app/services/sso_token_service.py`, `backend/app/api/v1/endpoints/auth/sso.py`, `frontend/src/services/entraAuth.ts`
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

- Client auth/session state is now centralized in the in-memory `sessionStore`, but compatibility adapters (`frontend/src/services/accessTokenStore.ts`, `frontend/src/services/bootstrapSessionCache.ts`) still need final removal discipline in the closing cleanup loop
- Dev/demo auth paths are intentionally present and must remain production-disabled (`backend/app/main.py`, `backend/app/api/v1/endpoints/auth/demo.py`)
- SSO token verification is monkeypatched in tests via `app.api.v1.endpoints.auth.verify_entra_id_token` and requires facade-style attribute lookup to keep patching working through refactors (`backend/app/api/v1/endpoints/auth/__init__.py`, `backend/app/api/v1/endpoints/auth/sso.py`)

## Scheduler Operational Risk

- Background scheduler can duplicate jobs if enabled in more than one backend process
- Non-Postgres runtimes now fail fast if scheduler/outbox execution is started with multiple workers, but duplicate-job risk still depends on deployment discipline for PostgreSQL-backed scheduler ownership (`backend/app/core/scheduler.py`, `backend/app/services/outbox/store.py`)

## Production Boundary Risk

- Broad private-network `TRUSTED_PROXIES` values are now production-fatal unless explicitly overridden; operators need to make that trust decision deliberately (`backend/app/bootstrap_validation.py`)
- Graph auth now separates dependency, credential, token-response, and transient failures, but the boundary remains security-sensitive because it drives production directory lookups and token caching (`backend/app/services/graph_directory_auth.py`, `backend/app/services/graph_directory_errors.py`)

## Log Growth and Operational Hygiene

- Repository root contains very large dev log artifacts (e.g. `.dev-backend.log`), which can impact local disk usage and tooling performance
- Ongoing cleanup policy and log rotation discipline should be enforced for local/dev workflows

## Test-Parity Risk

- Most backend tests run on SQLite fixtures (`tests/backend/pytest/conftest.py`)
- Critical paths with Postgres behavior (timestamps, SQL semantics, asyncpg strictness) need recurring `-m postgres` validation

## Recommended Ongoing Mitigations

- Keep explicit regression tests on approval execution and timezone-sensitive writes
- Validate RBAC changes with both API and UI-gating tests
- Prefer incremental decomposition of oversized endpoint modules during feature work
- Periodically reconcile seed scripts with `docs/BUSINESS_LOGIC.md`

---

*Concerns audit refreshed on 2026-04-05*
