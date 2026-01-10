# Code Conventions

## Backend (Python)

### File Organization
- Routers: `backend/app/api/v1/endpoints/*.py`
- Dependencies: `backend/app/api/deps.py`, `backend/app/core/security.py`
- Models: `backend/app/models/*.py` (SQLAlchemy)
- Schemas: `backend/app/schemas/*.py` (Pydantic)
- Services: `backend/app/services/*.py` (business logic)

### Naming
- **Functions/Variables**: `snake_case`
- **Classes**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **API Endpoints**: kebab-case URLs, snake_case JSON fields

### Patterns
- Async DB access via `get_db` dependency + `async_sessionmaker`
- Permission checks via `check_permission(current_user, "permission:action")`
- Activity logging in same transaction as business changes
- Structured logging via `structlog` with context injection
- Atomic operations with `db.begin_nested()` for retries

## Frontend (TypeScript/React)

### File Organization
- Pages: `frontend/src/pages/*.tsx` (28 route-level)
- Components: `frontend/src/components/<category>/*.tsx`
- Services: `frontend/src/services/*Api.ts` (API clients)
- Types: `frontend/src/types/*.ts`
- Tests: `frontend/src/**/__tests__/*.test.tsx`

### Naming
- **Files/Components**: `PascalCase.tsx`
- **Hooks**: `useCamelCase.ts`
- **Services**: `camelCaseApi.ts`
- **Types**: `PascalCase` for interfaces, `snake_case` for API response fields

### Patterns
- Functional components with TypeScript props
- `apiClient` wrapper handles auth tokens + error parsing
- Global state via React Contexts (`AuthContext`, `DashboardFilterContext`)
- Tailwind utility classes directly in JSX
- Permission gating via `<PermissionGate>` component

## Shared Conventions
- API routes versioned under `/api/v1`
- Import alias `@` → `frontend/src` (Vite config)
- ISO 8601 dates in API, `date-fns` for formatting
- Consistent error response format: `{ detail: string }`

*Updated: 2026-01-10*
