# Repository Structure

**Analysis Date:** 2026-05-25

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
- `backend/app/api/v1/endpoints/` - 145 Python modules/packages (measured git-tracked `*.py` snapshot; extensively split into subrouters for maintainability)
- `backend/app/models/` - 28 model modules (measured git-tracked `*.py` snapshot)
- `backend/app/schemas/` - 26 schema modules (measured git-tracked `*.py` snapshot)
- `backend/app/services/` - 274 Python modules (measured git-tracked `*.py` snapshot; business services + internal helper packages such as `_approval_queue`, `_issue_register`, `_vendor_links`, `_admin_telemetry`, `_issue_workflow`, `_kri_history`, `_vendor_workflow`, `_control_execution`, `_access_workflow`, `_riskhub_config`, `_orphaned_items`, `_quarterly_comparison`, `_risk_questionnaires`, `_auth_session_workflow`, `_graph_directory`, `_authorization_capabilities`, and `_identity_access_lifecycle`)
- `backend/app/core/` - configuration facade + segmented settings package, auth, permissions, logging, scheduler
- `backend/app/middleware/` - 11 Python modules (measured git-tracked `*.py` snapshot; security/logging/language/rate-limit middleware with facade-preserving splits)
- `backend/app/integrations/` - reserved integration package and vendor-signal package docs; current directory/Graph behavior lives in service-layer adapters
- `backend/alembic/` - migration environment and versioned migrations
- `backend/scripts/runtime/` - component-scoped backend runtime entrypoints (`dev`, `test`, `prod`)
- `backend/scripts/runtime/db/` - backend-owned DB runtime entrypoints (`dev`, `test`, `prod`)
- `tests/backend/pytest/` - 410 tracked test files (374 Python)

## Frontend Tree (`frontend/`)

### Entry points
- `frontend/src/main.tsx` - React bootstrap
- `frontend/src/App.tsx` - provider composition and route tree

### Primary subdirectories
- `frontend/src/pages/` - 173 tracked files (measured git-tracked snapshot; route-level pages + colocated helpers/tests and shared detail/admin/user workflow modules)
- `frontend/src/components/` - 291 tracked files (measured git-tracked snapshot; components + tests, including split linking, remediation, questionnaire workflow state, governance, dashboard, and KRI modal modules)
- `frontend/src/services/` - API client, auth transport, session state packages, domain service wrappers, and split runtime schema modules
- `frontend/src/contexts/` - auth/theme/filter context providers
- `frontend/src/authz/` - authz policy derivation hooks
- `frontend/src/routing/` - centralized route metadata and sidebar navigation manifests
- `frontend/src/hooks/` - shared hooks
- `frontend/src/i18n/` - locale resources and typed translation hooks
- `frontend/scripts/runtime/` - component-scoped frontend runtime entrypoints (`dev`, `test`, `prod`)
- `tests/frontend/unit/src/test/` - MSW handlers and test utilities
- `tests/frontend/e2e/` - 42 E2E specs among 76 tracked files (measured git-tracked `*.spec.ts` snapshot; domain-focused test suites plus setup/helpers/fixtures)

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
- `scripts/install_lib/` - 14 Python modules (measured git-tracked `*.py` snapshot; installer control-plane helpers split by release input, secrets/scaffolding, lifecycle execution, and summary/verify responsibilities)

## Generated or Heavy Directories (avoid manual edits)

- `frontend/node_modules/`
- `frontend/dist/`
- `backend/venv/`
- `tests/results/backend/coverage_html/`
- `tests/results/`, `tests/results/frontend/playwright/playwright-report/`, `tests/results/legacy/coverage_html/`

---

*Structure audit refreshed on 2026-05-25*
