# Repository Structure

**Analysis Date:** 2026-04-06

## Top-Level Layout

- `backend/` - FastAPI API, domain services, Alembic migrations, pytest suites
- `frontend/` - React + TypeScript SPA, Vitest tests, Playwright E2E suites
- `docs/` - product/business/admin/user documentation
- `tests/` - centralized backend/frontend test suites and test result artifacts
- `.planning/` - roadmap, state, phase plans/summaries, codebase map docs
- `scripts/` - operational/dev utilities, including the public installer/orchestrator `scripts/install.sh` plus the underlying `scripts/dev.sh`, `scripts/compose.sh`, and `scripts/deploy.sh` entrypoints

## Backend Tree (`backend/`)

### Entry points and runtime
- `backend/app/main.py` - FastAPI app creation, middleware, startup checks
- `backend/app/api/v1/router.py` - registers all API endpoint routers
- `backend/app/db/session.py` - engine/sessionmaker lifecycle + `get_db` dependency (sessionmaker stored on `app.state`)

### Primary subdirectories
- `backend/app/api/v1/endpoints/` - 159 Python modules/packages (measured `*.py` snapshot; extensively split into subrouters for maintainability)
- `backend/app/models/` - 26 model modules (measured `*.py` snapshot)
- `backend/app/schemas/` - 23 schema modules (measured `*.py` snapshot)
- `backend/app/services/` - 81 Python modules (measured workspace `*.py` snapshot; business services + internal refactor packages; facade modules re-export public symbols)
- `backend/app/core/` - configuration facade + segmented settings package, auth, permissions, logging, scheduler
- `backend/app/middleware/` - 7 Python modules (measured workspace `*.py` snapshot; security/logging/language middleware with facade-preserving splits)
- `backend/app/integrations/` - AD emulator and vendor-signal connectors
- `backend/alembic/` - migration environment and versioned migrations
- `backend/scripts/runtime/` - component-scoped backend runtime entrypoints (`dev`, `test`, `prod`)
- `backend/scripts/runtime/db/` - backend-owned DB runtime entrypoints (`dev`, `test`, `prod`)
- `tests/backend/pytest/` - 151 test files (148 Python) (measured workspace snapshot)

## Frontend Tree (`frontend/`)

### Entry points
- `frontend/src/main.tsx` - React bootstrap
- `frontend/src/App.tsx` - provider composition and route tree

### Primary subdirectories
- `frontend/src/pages/` - 87 tracked files (measured git-tracked snapshot; route-level pages + tests)
- `frontend/src/components/` - 176 tracked files (measured git-tracked snapshot; components + tests)
- `frontend/src/services/` - API client and domain service wrappers
- `frontend/src/contexts/` - auth/theme/filter context providers
- `frontend/src/authz/` - authz policy derivation hooks
- `frontend/src/routing/` - centralized route metadata and sidebar navigation manifests
- `frontend/src/hooks/` - shared hooks
- `frontend/src/i18n/` - locale resources and typed translation hooks
- `frontend/scripts/runtime/` - component-scoped frontend runtime entrypoints (`dev`, `test`, `prod`)
- `tests/frontend/unit/src/test/` - MSW handlers and test utilities
- `tests/frontend/e2e/` - 42 E2E specs (measured git-tracked `*.spec.ts` snapshot; domain-focused test suites)

## Planning and Documentation Structure

- `.planning/ROADMAP.md` - milestone/phase intent
- `.planning/STATE.md` - current execution truth and status
- `.planning/phases/` - detailed phase plans/summaries
- `.planning/codebase/` - generated codebase reference docs
- `docs/BUSINESS_LOGIC.md` - domain source of truth
- `docs/development/README.md` - canonical development startup/runbook
- `docs/TESTING.md` - testing guidance and workflows
- `docs/deployment/` - deployment runbooks for supported docker/linux operations and migration guidance

## Build/Test/Automation Artifacts

- `.github/workflows/e2e.yml` - CI E2E flow
- `.github/workflows/security.yml` - security scanning flow
- `docker-compose.yml` - development service topology consumed by `scripts/compose.sh`
- `scripts/Makefile` - convenience command aliases around `scripts/install.sh`, `scripts/dev.sh`, and `scripts/compose.sh`
- `scripts/install_lib/` - 11 Python modules (measured workspace `*.py` snapshot; installer control-plane helpers split by release input, secrets/scaffolding, lifecycle execution, and summary/verify responsibilities)

## Generated or Heavy Directories (avoid manual edits)

- `frontend/node_modules/`
- `frontend/dist/`
- `backend/venv/`
- `tests/results/backend/coverage_html/`
- `tests/results/`, `tests/results/frontend/playwright/playwright-report/`, `tests/results/legacy/coverage_html/`

---

*Structure audit refreshed on 2026-04-06*
