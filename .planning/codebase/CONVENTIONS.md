# Coding Conventions

**Analysis Date:** 2026-04-24

## Backend Conventions

### API and dependency patterns
- Endpoints use FastAPI dependency injection for DB and auth (`backend/app/api/deps.py`)
- Permission checks use `require_permission(resource, action)` and policy helpers (`backend/app/core/security.py`, `backend/app/core/permissions.py`, internal modules under `backend/app/core/_permissions/`)
- Router composition is centralized in `backend/app/api/v1/router.py`
- Endpoint files are increasingly split into packages with subrouters; package `__init__.py` must keep `router` available at `app.api.v1.endpoints.<name>.router` (`backend/app/api/v1/endpoints/`)
- Static routes must be registered before dynamic `{param}` routes to avoid 422 shadowing; this is guarded by tests (`tests/backend/pytest/test_route_shadowing.py`, `tests/backend/pytest/api/v1/test_route_ordering_regressions.py`)

### Async and transaction boundaries
- Async-first style across endpoints/services (`async def` + `AsyncSession`)
- No global auto-commit in `get_db`; endpoints/services commit explicitly (`backend/app/db/session.py`)

### Model/schema separation
- SQLAlchemy ORM entities in `backend/app/models/`
- Pydantic API contracts in `backend/app/schemas/`
- Service layer handles multi-entity workflows (approvals, notifications, historization, issue remediation, KRI history, questionnaires)
- Large services may be split into internal packages under `backend/app/services/_*/` with a public facade module that re-exports stable symbols (`backend/app/services/approval_execution_service.py`, `backend/app/services/_approval_execution/`, `backend/app/services/_issue_workflow/`, `backend/app/services/_kri_history/`)
- Workflow endpoints should delegate lifecycle/status/authorization invariants to shared service helpers instead of reimplementing them per route.
- Where a frontend action depends on server-side workflow authority, expose additive backend capability metadata and have the UI mirror those booleans instead of inferring from local role state.

### Security and runtime guardrails
- Production startup checks fail fast on unsafe config (`backend/app/main.py`)
- Mock auth/demo paths are development-gated (`backend/app/main.py`, `backend/app/api/v1/endpoints/auth/demo.py`)
- Structured logging is expected in runtime paths (`backend/app/core/logging.py`)

## Frontend Conventions

### Application composition
- Provider stack in `frontend/src/App.tsx` (query, auth, theme)
- Route-driven page structure in `frontend/src/pages/`
- Shared component library in `frontend/src/components/`

### Data access and auth
- Centralized fetch wrapper in `frontend/src/services/apiClient.ts`
- Runtime response schemas are domain-split under `frontend/src/services/api/schemas/entities/`; keep public aggregate exports stable from the schema index.
- Auth state and permissions sourced from `AuthContext` (`frontend/src/contexts/AuthContext.tsx`)
- UI authorization gates via `PermissionGate` and `usePermissions` (`frontend/src/components/PermissionGate.tsx`, `frontend/src/hooks/usePermissions.ts`)
- User-facing UI must not render raw numeric database IDs as fallback labels; prefer names, codes, titles, or `Unknown <entity>` text.
- Entra ID SSO support via MSAL (`frontend/src/services/entraAuth.ts`, `frontend/src/pages/SsoCallbackPage.tsx`)

### Internationalization
- i18n initialized before app render (`frontend/src/main.tsx`, `frontend/src/i18n/index.ts`)
- Locale resources split by namespace/language (`frontend/src/i18n/locales/`)

## Testing and Quality Conventions

- Backend: pytest naming and markers in `backend/pytest.ini`
- Frontend: Vitest jsdom tests + MSW mocks (`frontend/vitest.config.ts`, `tests/frontend/unit/src/test/mocks/`)
- E2E: Playwright multi-browser projects (`frontend/playwright.config.ts`)
- Lint/security toolchain via ESLint + pre-commit + security workflows (`frontend/eslint.config.js`, `.pre-commit-config.yaml`, `.github/workflows/security.yml`)
- RBAC/workflow changes should include both backend API/service assertions and frontend capability/gating tests when the UI exposes the action.

## Time and Date Handling Convention (Policy)

- Persisted “instant” timestamps are timezone-aware UTC (`TIMESTAMP WITH TIME ZONE` / `DateTime(timezone=True)`).
- Central helpers: `utc_now()` + `coerce_utc()` (`backend/app/core/datetime_utils.py`).
- Forbidden patterns:
  - `datetime.utcnow()` (enforced by `tests/backend/pytest/test_no_datetime_utcnow.py`)
  - `.replace(tzinfo=None)` (repo convention: do not drop tzinfo)
- Guardrail: all SQLAlchemy `DateTime` columns must be timezone-aware (`tests/backend/pytest/test_timezone_policy.py`).

## Source-of-Truth Conventions

- Business behavior and RBAC: `docs/BUSINESS_LOGIC.md`
- Testing strategy and commands: `docs/TESTING.md`
- Current execution context for planning: `.planning/STATE.md` and `.planning/ROADMAP.md`

---

*Conventions audit refreshed on 2026-04-24*
