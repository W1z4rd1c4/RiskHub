# Conventions

## Code Style

### Backend (Python)
- **Type hints**: Used throughout with docstrings
- **Naming**: snake_case for modules/functions, PascalCase for classes/enums
- **Imports**: stdlib → third-party → local with blank lines
- **Examples**: `backend/app/core/security.py`, `backend/app/api/v1/endpoints/risks.py`

### Frontend (TypeScript/React)
- **Indentation**: 4-space with semicolons
- **Naming**: PascalCase components, camelCase hooks, `*Api` services
- **Imports**: React/third-party → `@/` aliases → relative
- **Examples**: `frontend/src/pages/DashboardPage.tsx`, `frontend/src/services/apiClient.ts`

## Error Handling

### Backend
- `HTTPException` with explicit status codes and messages
- Permissions via dependency injection (`require_permission`)
- Location: `backend/app/api/deps.py`, endpoint files

### Frontend
- `try/catch` in data loaders with error state
- `apiClient` normalizes errors, handles 401 → redirect to `/login`
- Location: `frontend/src/services/apiClient.ts`

## Formatting Tools
- **Frontend**: ESLint flat config (`frontend/eslint.config.js`)
- **Backend**: No explicit formatter (commented `black`/`ruff` in alembic.ini)

## Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Python modules | snake_case | `approval_request.py` |
| Python functions | snake_case | `list_risks()` |
| Python classes | PascalCase | `RiskStatusEnum` |
| React components | PascalCase | `RiskScoreMatrix.tsx` |
| React hooks | camelCase | `usePermissions.ts` |
| API services | `*Api` suffix | `riskApi.ts` |
| Types | Mirror backend | `types/risk.ts` |

---
*Last updated: 2025-12-28*
