# Repository Structure

**Analysis Date:** 2026-02-16

## Top-Level Layout

- `backend/` - FastAPI API, domain services, Alembic migrations, pytest suites
- `frontend/` - React + TypeScript SPA, Vitest tests, Playwright E2E suites
- `docs/` - product/business/admin/user documentation
- `.planning/` - roadmap, state, phase plans/summaries, codebase map docs
- `scripts/` - operational/dev utilities (including canonical `scripts/dev.sh`)
- `AD Emulator/` - separate optional emulator app for directory-sync flows

## Backend Tree (`backend/`)

### Entry points and runtime
- `backend/app/main.py` - FastAPI app creation, middleware, startup checks
- `backend/app/api/v1/router.py` - registers all API endpoint routers
- `backend/app/db/session.py` - engine/sessionmaker lifecycle + `get_db` dependency (sessionmaker stored on `app.state`)

### Primary subdirectories
- `backend/app/api/v1/endpoints/` - 166 Python modules/packages (extensively split into subrouters for maintainability)
- `backend/app/models/` - 36 model modules
- `backend/app/schemas/` - 30 schema modules
- `backend/app/services/` - 75 Python modules (business services + internal refactor packages; facade modules re-export public symbols)
- `backend/app/core/` - configuration, auth, permissions, logging, scheduler
- `backend/app/middleware/` - security/logging/language middleware
- `backend/app/integrations/` - AD emulator and vendor-signal connectors
- `backend/alembic/` - migration environment and versioned migrations
- `backend/tests/` - 234 test files (82 Python)

## Frontend Tree (`frontend/`)

### Entry points
- `frontend/src/main.tsx` - React bootstrap
- `frontend/src/App.tsx` - provider composition and route tree

### Primary subdirectories
- `frontend/src/pages/` - 53 files (route-level pages + tests)
- `frontend/src/components/` - 116 files (components + tests)
- `frontend/src/services/` - API client and domain service wrappers
- `frontend/src/contexts/` - auth/theme/filter context providers
- `frontend/src/authz/` - authz policy derivation hooks
- `frontend/src/hooks/` - shared hooks
- `frontend/src/i18n/` - locale resources and typed translation hooks
- `frontend/src/test/` - MSW handlers and test utilities
- `frontend/e2e/` - 38 E2E specs (domain-focused test suites)

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
- `Makefile` - local command entrypoints

## Generated or Heavy Directories (avoid manual edits)

- `frontend/node_modules/`
- `frontend/dist/`
- `backend/venv/`
- `coverage_html/`, `backend/coverage_html/`
- `test-results/`, `frontend/playwright-report/`

---

*Structure audit refreshed on 2026-02-16*
