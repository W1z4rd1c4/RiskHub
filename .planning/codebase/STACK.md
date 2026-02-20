# Technology Stack

**Analysis Date:** 2026-02-20

## Languages

**Primary:**
- Python 3.13+ - backend API and services (`backend/app/`, `backend/Dockerfile`)
- TypeScript 5.9 - frontend application (`frontend/src/`, `frontend/package.json`)

**Secondary:**
- JavaScript - tooling/config (`frontend/*.js`)
- SQL - Alembic migrations (`backend/alembic/versions/`)
- Shell/Make - local orchestration (`scripts/dev.sh`, `scripts/Makefile`)

## Runtime and Infrastructure

- Backend runtime: `python:3.13-alpine` (`backend/Dockerfile`)
- Frontend build runtime: `node:20-alpine` (`frontend/Dockerfile`)
- Frontend serving runtime: `nginx:alpine` (`frontend/Dockerfile`, `frontend/nginx.conf`)
- Database: PostgreSQL 16 (`docker-compose.yml`)
- Cache/rate-limit backend: Redis 7 (`docker-compose.yml`, `backend/app/main.py`)

## Core Frameworks and Libraries

**Backend:**
- FastAPI + Uvicorn (`backend/app/main.py`, `backend/requirements.txt`)
- SQLAlchemy async + `asyncpg` (`backend/app/db/session.py`, `backend/requirements.txt`)
- Alembic migrations (`backend/alembic/`)
- Pydantic v2 + pydantic-settings (`backend/app/core/config.py`)
- APScheduler for background jobs (`backend/app/core/scheduler.py`)

**Frontend:**
- React 19 + React Router 7 (`frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/package.json`)
- TanStack Query for server-state caching (`frontend/src/App.tsx`, `frontend/package.json`)
- Tailwind CSS + PostCSS (`frontend/tailwind.config.js`, `frontend/postcss.config.js`)
- i18next + react-i18next for localization (`frontend/src/i18n/`, `frontend/package.json`)
- Entra ID (SSO) client via MSAL (`frontend/src/services/entraAuth.ts`, `frontend/package.json`)

## Key Dependency Highlights

**Backend highlights (`backend/requirements.txt`):**
- `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]`, `asyncpg`, `alembic`
- `python-jose`, `passlib[bcrypt]`, `bcrypt==4.1.3`
- `redis`, `APScheduler`, `structlog`, `python-json-logger`

**Frontend highlights (`frontend/package.json`):**
- `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`
- `axios`, `framer-motion`, `recharts`, `i18next`
- `@azure/msal-browser` (Entra ID SSO)
- `vitest`, `@playwright/test`, Testing Library, MSW

## Tooling and Quality Gates

- Backend testing: `pytest`, `pytest-asyncio`, `pytest-cov` (`backend/pytest.ini`)
- Backend linting: Ruff (`backend/ruff.toml`, `backend/requirements-dev.txt`)
- Frontend testing: Vitest + Playwright (`tests/frontend/unit/vitest.config.ts`, `tests/frontend/e2e/playwright.config.ts`)
- Frontend linting: ESLint (`frontend/eslint.config.js`)
- Repo-level security checks: Bandit, pip-audit, Trivy, Syft+Grype correlation, gitleaks (`.pre-commit-config.yaml`, `.github/workflows/security.yml`)

## Configuration Model

- Backend settings centralized in `Settings` (`backend/app/core/config.py`)
- Local API routing defaults to relative `/api/v1` (`frontend/src/services/apiClient.ts`)
- Vite dev proxy forwards `/api` to backend (`frontend/vite.config.ts`)
- Production hardening checks enforced at startup (`backend/app/main.py`)

## Current Scale Snapshot

- Backend models: 36 Python files (`backend/app/models/`)
- Backend services: 75 Python files (includes internal refactor packages) (`backend/app/services/`)
- Backend tests: 82 Python files (234 total files) (`tests/backend/pytest/`)
- Frontend source files: 306 files (`frontend/src/`)
- Frontend E2E specs: 38 (`tests/frontend/e2e/**/*.spec.ts`)

---

*Stack analysis refreshed on 2026-02-20*
