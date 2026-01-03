# Developer Code Conventions

## Backend (Python)
- Routers live in `backend/app/api/v1/endpoints/*.py`.
- Dependencies in `backend/app/api/deps.py` and `backend/app/core/security.py`.
- Async DB access via `get_db` dependency and `async_sessionmaker`.
- Models in `backend/app/models`, schemas in `backend/app/schemas`.
- Services in `backend/app/services` handle domain logic (directory sync, reports).
- Naming follows Python conventions: `snake_case` functions/variables, `PascalCase` classes.

## Frontend (TypeScript/React)
- Functional components with `PascalCase` file names.
- Route pages in `frontend/src/pages`; domain components in `frontend/src/components/*`.
- API calls isolated in `frontend/src/services/*` using `apiClient`.
- Global state via React Contexts (`AuthContext`, `DashboardFilterContext`).
- Tailwind utility classes used directly in JSX.

## Shared
- API routes are versioned under `/api/v1`.
- Import alias `@` points to `frontend/src` (Vite/Vitest config).
