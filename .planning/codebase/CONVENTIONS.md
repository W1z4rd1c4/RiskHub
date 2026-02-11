# Coding Conventions

**Analysis Date:** 2026-02-11

## Backend Conventions

### API and dependency patterns
- Endpoints use FastAPI dependency injection for DB and auth (`backend/app/api/deps.py`)
- Permission checks use `require_permission(resource, action)` and policy helpers (`backend/app/core/security.py`, `backend/app/core/permissions.py`)
- Router composition is centralized in `backend/app/api/v1/router.py`

### Async and transaction boundaries
- Async-first style across endpoints/services (`async def` + `AsyncSession`)
- No global auto-commit in `get_db`; endpoints/services commit explicitly (`backend/app/db/session.py`)

### Model/schema separation
- SQLAlchemy ORM entities in `backend/app/models/`
- Pydantic API contracts in `backend/app/schemas/`
- Service layer handles multi-entity workflows (approvals, notifications, historization)

### Security and runtime guardrails
- Production startup checks fail fast on unsafe config (`backend/app/main.py`)
- Mock auth/demo paths are development-gated (`backend/app/main.py`, `backend/app/api/v1/endpoints/auth.py`)
- Structured logging is expected in runtime paths (`backend/app/core/logging.py`)

## Frontend Conventions

### Application composition
- Provider stack in `frontend/src/App.tsx` (query, auth, theme)
- Route-driven page structure in `frontend/src/pages/`
- Shared component library in `frontend/src/components/`

### Data access and auth
- Centralized fetch wrapper in `frontend/src/services/apiClient.ts`
- Auth state and permissions sourced from `AuthContext` (`frontend/src/contexts/AuthContext.tsx`)
- UI authorization gates via `PermissionGate` and `usePermissions` (`frontend/src/components/PermissionGate.tsx`, `frontend/src/hooks/usePermissions.ts`)

### Internationalization
- i18n initialized before app render (`frontend/src/main.tsx`, `frontend/src/i18n/index.ts`)
- Locale resources split by namespace/language (`frontend/src/i18n/locales/`)

## Testing and Quality Conventions

- Backend: pytest naming and markers in `backend/pytest.ini`
- Frontend: Vitest jsdom tests + MSW mocks (`frontend/vitest.config.ts`, `frontend/src/test/mocks/`)
- E2E: Playwright multi-browser projects (`frontend/playwright.config.ts`)
- Lint/security toolchain via ESLint + pre-commit + security workflows (`frontend/eslint.config.js`, `.pre-commit-config.yaml`, `.github/workflows/security.yml`)

## Time and Date Handling Convention (Current State)

- Codebase currently contains mixed timezone-aware and timezone-naive handling
- Several write paths intentionally strip tzinfo for DB compatibility in legacy areas (`backend/app/services/approval_execution_service.py` and related files)
- Newer models increasingly use `DateTime(timezone=True)`

## Source-of-Truth Conventions

- Business behavior and RBAC: `docs/BUSINESS_LOGIC.md`
- Testing strategy and commands: `docs/TESTING.md`
- Current execution context for planning: `.planning/STATE.md` and `.planning/ROADMAP.md`

---

*Conventions audit refreshed on 2026-02-11*
