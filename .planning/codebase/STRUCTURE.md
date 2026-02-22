# Repository Structure

**Analysis Date:** 2026-02-22

## Top-Level Layout

- `backend/` - FastAPI API, domain services, Alembic migrations, pytest suites
- `frontend/` - React + TypeScript SPA, Vitest tests, Playwright E2E suites
- `docs/` - product/business/admin/user documentation
- `tests/` - centralized backend/frontend test suites and test result artifacts
- `.planning/` - roadmap, state, phase plans/summaries, codebase map docs
- `scripts/` - operational/dev utilities (including canonical `scripts/dev.sh`)

## Backend Tree (`backend/`)

### Entry points and runtime
- `backend/app/main.py` - FastAPI app creation, middleware, startup checks
- `backend/app/api/v1/router.py` - registers all API endpoint routers
- `backend/app/db/session.py` - engine/sessionmaker lifecycle + `get_db` dependency (sessionmaker stored on `app.state`)

### Primary subdirectories
- `backend/app/api/v1/endpoints/` - 168 Python modules/packages (measured `*.py` snapshot; extensively split into subrouters for maintainability)
- `backend/app/models/` - 35 model modules (measured `*.py` snapshot)
- `backend/app/schemas/` - 29 schema modules (measured `*.py` snapshot)
- `backend/app/services/` - 62 Python modules (measured `*.py` snapshot; business services + internal refactor packages; facade modules re-export public symbols)
- `backend/app/core/` - configuration, auth, permissions, logging, scheduler
- `backend/app/middleware/` - security/logging/language middleware
- `backend/app/integrations/` - AD emulator and vendor-signal connectors
- `backend/alembic/` - migration environment and versioned migrations
- `backend/scripts/runtime/` - component-scoped backend runtime entrypoints (`dev`, `test`, `prod`)
- `backend/scripts/runtime/db/` - backend-owned DB runtime entrypoints (`dev`, `test`, `prod`)
- `tests/backend/pytest/` - 319 test files (107 Python) (measured filesystem snapshot)

## Frontend Tree (`frontend/`)

### Entry points
- `frontend/src/main.tsx` - React bootstrap
- `frontend/src/App.tsx` - provider composition and route tree

### Primary subdirectories
- `frontend/src/pages/` - 36 files (measured filesystem snapshot; route-level pages + tests)
- `frontend/src/components/` - 142 files (measured filesystem snapshot; components + tests)
- `frontend/src/services/` - API client and domain service wrappers
- `frontend/src/contexts/` - auth/theme/filter context providers
- `frontend/src/authz/` - authz policy derivation hooks
- `frontend/src/hooks/` - shared hooks
- `frontend/src/i18n/` - locale resources and typed translation hooks
- `frontend/scripts/runtime/` - component-scoped frontend runtime entrypoints (`dev`, `test`, `prod`)
- `tests/frontend/unit/src/test/` - MSW handlers and test utilities
- `tests/frontend/e2e/` - 42 E2E specs (measured `*.spec.ts` snapshot; domain-focused test suites)

## Planning and Documentation Structure

- `.planning/ROADMAP.md` - milestone/phase intent
- `.planning/STATE.md` - current execution truth and status
- `.planning/phases/` - detailed phase plans/summaries
- `.planning/codebase/` - generated codebase reference docs
- `docs/BUSINESS_LOGIC.md` - domain source of truth
- `docs/TESTING.md` - testing guidance and workflows
- `docs/deployment/` - deployment runbooks (Compose/Kubernetes/migrations)

## Build/Test/Automation Artifacts

- `.github/workflows/e2e.yml` - CI E2E flow
- `.github/workflows/security.yml` - security scanning flow
- `docker-compose.yml` and `docker-compose.prod.yml` - service topology
- `scripts/Makefile` - local command entrypoints
- `docs/deployment/component-runtime-entrypoints.md` - component runtime command contract

## Generated or Heavy Directories (avoid manual edits)

- `frontend/node_modules/`
- `frontend/dist/`
- `backend/venv/`
- `tests/results/backend/coverage_html/`
- `tests/results/`, `tests/results/frontend/playwright/playwright-report/`, `tests/results/legacy/coverage_html/`

---

*Structure audit refreshed on 2026-02-22*
