# Repository Structure

**Analysis Date:** 2026-02-02

## Top-Level Layout

- `backend/` — FastAPI app + Alembic + pytest
- `frontend/` — React + TypeScript + Vite + Playwright
- `docs/` — business logic and user/admin documentation
- `.planning/` — roadmap + phase planning artifacts (GSD)
- `AD Emulator/` — separate demo “directory service” (backend + frontend)
- `docker-compose.yml` / `docker-compose.prod.yml` — local/prod deployment
- `Makefile` — common commands (`make dev`, `make test`, `make test-e2e`)

## Backend (`backend/`)

**Key entry points:**
- `backend/app/main.py` — app setup, middleware, router mount
- `backend/app/api/v1/router.py` — registers all v1 endpoint modules

**Core directories:**
- `backend/app/api/v1/endpoints/` — HTTP endpoints (one file per domain area)
- `backend/app/models/` — SQLAlchemy models
- `backend/app/schemas/` — Pydantic schemas
- `backend/app/services/` — business logic services/workflows
- `backend/app/core/` — config, security, permissions, logging, scheduler
- `backend/app/middleware/` — request context + security middleware
- `backend/app/integrations/` — outbound API clients/connectors
- `backend/app/db/` — DB session + seed scripts
- `backend/alembic/` — migrations (`backend/alembic/versions/`)
- `backend/tests/` — pytest suite (async + httpx)

**Notable files:**
- `backend/requirements.txt` — Python dependencies
- `backend/alembic/env.py` — migration wiring (sync URL)
- `backend/scripts/` — seed/demo/e2e data scripts and maintenance scripts

## Frontend (`frontend/`)

**Key entry points:**
- `frontend/src/main.tsx` — React bootstrap
- `frontend/src/App.tsx` — route tree + layout

**Core directories:**
- `frontend/src/pages/` — route-level pages (e.g. risks, approvals, vendors)
- `frontend/src/components/` — reusable UI components (domain-grouped)
- `frontend/src/services/` — API wrappers (typically thin calls to `apiClient`)
- `frontend/src/contexts/` — global state (Auth, filters, etc.)
- `frontend/src/hooks/` — shared hooks (permissions, config, data helpers)
- `frontend/src/types/` — shared domain types
- `frontend/src/i18n/` — localization setup + locales
- `frontend/src/test/` — MSW handlers + testing utilities
- `frontend/e2e/` — Playwright E2E specs + helpers

**Notable files:**
- `frontend/vite.config.ts` — dev server + proxy + alias config
- `frontend/playwright.config.ts` — E2E configuration
- `frontend/vitest.config.ts` — unit/integration test configuration
- `frontend/tailwind.config.js` — styling system
- `frontend/src/services/apiClient.ts` — fetch-based API client + auth header + error normalization

## Documentation (`docs/`)

- `docs/BUSINESS_LOGIC.md` — core behavior and RBAC rules (source of truth)
- `docs/TESTING.md` — testing guidance and patterns
- `docs/user/` — user-facing docs
- `docs/admin/` — admin-facing docs

---

*Structure audit: 2026-02-02*
*Update if directory layout changes materially*

