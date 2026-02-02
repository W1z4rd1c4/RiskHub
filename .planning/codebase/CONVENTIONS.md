# Coding Conventions

**Analysis Date:** 2026-02-02

## Naming Patterns

**Backend (Python):**
- Modules grouped by concern: `api/v1/endpoints/*`, `services/*`, `models/*`, `schemas/*`
- Endpoint functions use verb-noun: `list_*`, `create_*`, `update_*`, `delete_*`
- Enum values are typically lowercased strings stored in DB, exposed as strings in APIs

**Frontend (TypeScript):**
- React components are PascalCase (`RiskDetailPage`, `PermissionGate`)
- Hooks are `use*` (`usePermissions`, `useRiskHubConfig`)
- Services are `*Api.ts` and export objects (`riskApi`, `approvalsApi`)

## Backend Patterns

**Async-first:**
- Endpoints and most services are `async def` using `AsyncSession`

**Dependency Injection:**
- DB via `Depends(get_db)` (`backend/app/db/session.py`)
- Current user via `Depends(deps.get_current_user)` or `require_permission(...)` (`backend/app/api/deps.py`, `backend/app/core/security.py`)

**Validation & Schemas:**
- Pydantic schemas live in `backend/app/schemas/`
- Models in `backend/app/models/` are mapped with `mapped_column(...)`

**Logging:**
- Prefer `log_activity(...)` for audit trail events (`backend/app/core/activity_logger.py`)
- App logging is structured JSON (see `backend/logs/`)

**Formatting/Linting:**
- Black + Ruff via pre-commit (`.pre-commit-config.yaml`)
- Security scanning with Bandit and secret scanning with Gitleaks

## Frontend Patterns

**Routing:**
- Routes configured in `frontend/src/App.tsx`, pages in `frontend/src/pages/`

**Data Fetching:**
- API wrappers call `apiClient` (`frontend/src/services/apiClient.ts`)
- Query caching commonly via `@tanstack/react-query`

**RBAC UI gating:**
- Prefer `PermissionGate` (`frontend/src/components/PermissionGate.tsx`)
- Permission checks centralize via `usePermissions()` → `AuthContext.hasPermission` (`frontend/src/hooks/usePermissions.ts`, `frontend/src/contexts/AuthContext.tsx`)

**Styling:**
- Tailwind utility-first classes
- Component variants often via `class-variance-authority` + `clsx`

**Formatting/Linting:**
- ESLint flat config (`frontend/eslint.config.js`)

## Error Handling

**Backend:**
- Use `HTTPException(status_code=..., detail=...)` for controlled errors

**Frontend:**
- `apiClient` normalizes FastAPI `detail` payloads and falls back to `Request failed with status X`
- Prefer surfacing the server message when possible; keep user-friendly copy in UI

---

*Conventions audit: 2026-02-02*
*Update as team conventions evolve*

