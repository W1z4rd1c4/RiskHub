# Technology Stack

**Analysis Date:** 2026-02-02

## Languages

**Primary:**
- Python 3.12+ — Backend API (`backend/app/`)
- TypeScript ~5.8 — Frontend UI (`frontend/src/`)

**Secondary:**
- JavaScript — Frontend tooling/config (`frontend/*.js`)
- SQL — Alembic migrations (`backend/alembic/versions/`)
- Shell/Make — Local dev orchestration (`Makefile`, `dev.sh`)

## Runtime

**Environment:**
- Python 3.12 (Docker image `python:3.12-slim`) — Backend runtime (`backend/Dockerfile`)
- Node.js 20 (Docker image `node:20-alpine`) — Frontend build (`frontend/Dockerfile`)
- Nginx (Docker image `nginx:alpine`) — Frontend static hosting (`frontend/Dockerfile`, `frontend/nginx.conf`)
- PostgreSQL 16 — Primary DB (`docker-compose.yml`)

**Package Manager:**
- Backend: `pip` via `backend/requirements.txt`
- Frontend: `npm` (lockfile `frontend/package-lock.json`)

## Frameworks

**Core:**
- FastAPI (async) — API server (`backend/app/main.py`, `backend/app/api/v1/router.py`)
- SQLAlchemy 2 (async) + asyncpg — ORM/data access (`backend/app/db/session.py`)
- Alembic — DB migrations (`backend/alembic/`)
- React 19 + React Router 7 — SPA (`frontend/src/App.tsx`)
- Vite — dev/build (`frontend/vite.config.ts`)

**Testing:**
- pytest + pytest-asyncio + httpx — backend tests (`backend/tests/`)
- Vitest + Testing Library + MSW — frontend unit/integration tests (`frontend/src/**/__tests__`, `frontend/src/test/mocks/`)
- Playwright — E2E tests (`frontend/e2e/`, `frontend/playwright.config.ts`)

**Build/Dev:**
- Tailwind CSS + PostCSS — styling (`frontend/tailwind.config.js`, `frontend/postcss.config.js`)
- ESLint + typescript-eslint — frontend lint (`frontend/eslint.config.js`)
- Black + Ruff + Bandit + Gitleaks — repo hygiene (`.pre-commit-config.yaml`)

## Key Dependencies

**Critical (backend):**
- `fastapi`, `uvicorn` — HTTP API runtime
- `sqlalchemy[asyncio]`, `asyncpg` — DB access
- `pydantic`, `pydantic-settings` — schema + config (`backend/app/core/config.py`)
- `python-jose`, `passlib[bcrypt]` — JWT auth + password hashing (`backend/app/core/security.py`)
- `structlog`, `python-json-logger` — structured logging (`backend/app/core/logging.py`, `backend/logs/`)

**Critical (frontend):**
- `react`, `react-router-dom` — app shell + routing
- `@tanstack/react-query` — data fetching/caching (used across pages/hooks)
- `tailwindcss` — utility styling
- `@playwright/test`, `vitest` — test runners

**Infrastructure:**
- Docker Compose — local multi-service dev (`docker-compose.yml`, `docker-compose.prod.yml`)

## Configuration

**Environment:**
- Root `.env.example` for production-like config
- `backend/.env.example` and `frontend/.env.example` for local dev defaults
- Backend settings via Pydantic `Settings` (`backend/app/core/config.py`)

**Build:**
- Frontend proxy routes `/api` → `http://localhost:8000` for dev (`frontend/vite.config.ts`)
- Frontend API base URL defaults to relative `/api/v1` (`frontend/src/services/apiClient.ts`)

## Platform Requirements

**Development:**
- Docker (for Postgres via `docker-compose up -d db`)
- Python 3.12 environment for backend (`make dev`, `make test`)
- Node.js 20+ for frontend (`make dev-full`, `npm run dev`)

**Production:**
- Docker Compose / Docker runtime for `db`, `backend`, `frontend`
- Backend expects strong `SECRET_KEY`, `DATABASE_URL`, and locked-down `MOCK_AUTH_ENABLED=false` (see `.env.example`)

---

*Stack analysis: 2026-02-02*
*Update after major dependency changes*

