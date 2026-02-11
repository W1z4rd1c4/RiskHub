# Codebase Concerns

**Analysis Date:** 2026-02-11

## High-Risk Hotspots (Require Extra Care)

- Approval side-effect orchestration: `backend/app/services/approval_execution_service.py`
- Timezone handling across mixed naive/aware paths: multiple backend services and endpoints
- RBAC scope enforcement consistency between backend and frontend gating: `backend/app/core/permissions.py`, `frontend/src/components/PermissionGate.tsx`
- Role/permission seed consistency across seed scripts: `backend/app/db/seed.py`, `backend/scripts/seed_*.py`
- Mock auth and demo-login boundaries: `backend/app/main.py`, `backend/app/api/v1/endpoints/auth.py`

## Timezone Consistency Debt

- Codebase still contains both timezone-aware model columns and explicit naive conversions (e.g. `.replace(tzinfo=None)`) in several write paths
- This creates ongoing regression risk in Postgres-sensitive flows unless tested explicitly
- Evidence: `backend/app/services/approval_execution_service.py`, `backend/app/services/kri_history_service.py`, `backend/app/api/v1/endpoints/approvals.py`

## Large, Dense Modules

- Several endpoint modules are very large, increasing maintenance and regression risk:
  - `backend/app/api/v1/endpoints/riskhub.py` (1373 lines)
  - `backend/app/api/v1/endpoints/reports.py` (1245 lines)
  - `backend/app/api/v1/endpoints/dashboard.py` (1079 lines)
  - `backend/app/api/v1/endpoints/controls.py` (1023 lines)
- Large modules make focused refactoring and review harder without strict test coverage

## Authentication and Session Risks

- JWT access token stored in browser localStorage (`frontend/src/contexts/AuthContext.tsx`) remains an XSS-sensitive design choice
- Dev/demo auth paths are intentionally present and must remain production-disabled (`backend/app/main.py`, `backend/app/api/v1/endpoints/auth.py`)

## Scheduler Operational Risk

- Background scheduler can duplicate jobs if enabled in more than one backend process
- Guard exists (`ENABLE_SCHEDULER=true` expected on exactly one process), but this is deployment-discipline dependent (`backend/app/core/scheduler.py`)

## Log Growth and Operational Hygiene

- Repository root contains very large dev log artifacts (e.g. `.dev-backend.log`), which can impact local disk usage and tooling performance
- Ongoing cleanup policy and log rotation discipline should be enforced for local/dev workflows

## Test-Parity Risk

- Most backend tests run on SQLite fixtures (`backend/tests/conftest.py`)
- Critical paths with Postgres behavior (timestamps, SQL semantics, asyncpg strictness) need recurring `-m postgres` validation

## Recommended Ongoing Mitigations

- Keep explicit regression tests on approval execution and timezone-sensitive writes
- Validate RBAC changes with both API and UI-gating tests
- Prefer incremental decomposition of oversized endpoint modules during feature work
- Periodically reconcile seed scripts with `docs/BUSINESS_LOGIC.md`

---

*Concerns audit refreshed on 2026-02-11*
