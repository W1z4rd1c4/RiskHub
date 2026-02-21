# RiskHub — AGENTS Playbook

## Repository Knowledge Map

Canonical Source: `docs/agent/README.md`, `docs/agent/AGENTS_DOC_COVERAGE.md`

This file is the navigation layer for agent behavior. Canonical details live in `docs/` and `.planning/codebase/`.
Use [`docs/agent/README.md`](docs/agent/README.md) as the agent-doc index and [`docs/agent/AGENTS_DOC_COVERAGE.md`](docs/agent/AGENTS_DOC_COVERAGE.md) for section coverage tracking.
Use [`docs/DOCUMENTATION_TREE.md`](docs/DOCUMENTATION_TREE.md) for full cross-domain documentation navigation and [`.planning/README.md`](.planning/README.md) for planning-tree navigation.

| AGENTS Section | Canonical Source(s) | Coverage | Owner | Last Verified |
|---|---|---|---|---|
| Repository Knowledge Map | `docs/agent/README.md`<br>`docs/agent/AGENTS_DOC_COVERAGE.md` | full | RiskHub Maintainer | 2026-02-16 |
| Mission | `docs/agent/CODEX_WORKING_RULES.md` | full | RiskHub Maintainer | 2026-02-16 |
| Project Map | `.planning/codebase/STRUCTURE.md`<br>`.planning/codebase/ARCHITECTURE.md` | full | RiskHub Maintainer | 2026-02-16 |
| Source-of-Truth Order | `docs/agent/CODEX_WORKING_RULES.md`<br>`.planning/codebase/CONVENTIONS.md` | full | RiskHub Maintainer | 2026-02-16 |
| Active Work Focus (Default Bias) | `docs/agent/CODEX_WORKING_RULES.md`<br>`.planning/STATE.md`<br>`.planning/ROADMAP.md` | full | RiskHub Maintainer | 2026-02-16 |
| Execution Protocol | `docs/agent/EXECUTION_PROTOCOL.md` | full | RiskHub Maintainer | 2026-02-16 |
| Risk Hotspots (Mandatory Extra Care) | `.planning/codebase/CONCERNS.md`<br>`docs/agent/TIMEZONE_POLICY.md`<br>`docs/agent/ENDPOINT_INVARIANTS.md` | full | RiskHub Maintainer | 2026-02-16 |
| Key Knowledge (Keep In Sync) | `docs/agent/TIMEZONE_POLICY.md`<br>`docs/agent/PYTEST_RUNTIME_NOTES.md`<br>`docs/agent/ENDPOINT_INVARIANTS.md` | full | RiskHub Maintainer | 2026-02-16 |
| Key Knowledge > Timezone policy (UTC-aware) | `docs/agent/TIMEZONE_POLICY.md` | full | RiskHub Maintainer | 2026-02-16 |
| Key Knowledge > Postgres test mode | `docs/agent/PYTEST_RUNTIME_NOTES.md`<br>`.planning/codebase/TESTING.md` | full | RiskHub Maintainer | 2026-02-16 |
| Key Knowledge > Pytest exit hang (SQLite / aiosqlite) | `docs/agent/PYTEST_RUNTIME_NOTES.md` | full | RiskHub Maintainer | 2026-02-16 |
| Key Knowledge > Endpoint package splits (maintainability) | `docs/agent/ENDPOINT_INVARIANTS.md` | full | RiskHub Maintainer | 2026-02-16 |
| Key Knowledge > SQLAlchemy FK cycles (SQLite tests) | `docs/agent/ENDPOINT_INVARIANTS.md` | full | RiskHub Maintainer | 2026-02-16 |
| Testing Matrix | `.planning/codebase/TESTING.md`<br>`docs/TESTING.md` | full | RiskHub Maintainer | 2026-02-16 |
| RBAC and Business Logic Guardrails | `docs/BUSINESS_LOGIC.md`<br>`.planning/codebase/CONCERNS.md` | full | RiskHub Maintainer | 2026-02-16 |
| Frontend Display Guardrails | `docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md` | full | RiskHub Maintainer | 2026-02-16 |
| Security and Production Guardrails | `docs/deployment/security-checklist.md`<br>`docs/deployment/README.md` | full | RiskHub Maintainer | 2026-02-16 |
| Quick Commands | `scripts/dev.sh`<br>`scripts/Makefile`<br>`docs/deployment/component-runtime-entrypoints.md` | full | RiskHub Maintainer | 2026-02-20 |
| Component Runtime Commands | `docs/deployment/component-runtime-entrypoints.md` | full | RiskHub Maintainer | 2026-02-20 |
| Demo/Dev Auth (local) | `scripts/dev.sh`<br>`.planning/codebase/INTEGRATIONS.md` | full | RiskHub Maintainer | 2026-02-16 |
| Repo Hygiene | `.planning/codebase/STRUCTURE.md`<br>`docs/agent/CODEX_WORKING_RULES.md` | full | RiskHub Maintainer | 2026-02-16 |
| Prompting and Tooling Best Practices (OpenAI-Aligned) | `docs/agent/CODEX_WORKING_RULES.md` | full | RiskHub Maintainer | 2026-02-16 |
| Skills | `docs/agent/SKILLS_RESOLUTION.md` | full | RiskHub Maintainer | 2026-02-16 |

## Mission

Canonical Source: `docs/agent/CODEX_WORKING_RULES.md`

- Deliver correct, test-verified changes to RiskHub with minimal unrelated churn.
- Prefer evidence from repo artifacts over assumptions.

## Project Map

Canonical Source: `.planning/codebase/STRUCTURE.md`, `.planning/codebase/ARCHITECTURE.md`

- `backend/`: FastAPI + SQLAlchemy + Alembic + pytest
- `frontend/`: React + TypeScript + Vite + Vitest + Playwright
- `docs/`: business logic, testing, user/admin documentation
- `tests/`: centralized backend/frontend test suites and result artifacts
- `scripts/`: operational/dev entrypoints and automation helpers
- `.planning/`: roadmap, state, and phase plans/summaries

Root non-dot contract:
- folders: `backend/`, `frontend/`, `docs/`, `scripts/`, `tests/`
- files: `AGENTS.md`, `docker-compose.yml`, `docker-compose.prod.yml`

## Source-of-Truth Order

Canonical Source: `docs/agent/CODEX_WORKING_RULES.md`, `.planning/codebase/CONVENTIONS.md`

Use this precedence when instructions conflict:

1. Explicit user request for the current task.
2. Active phase plan file (`.planning/phases/<phase>/<plan>-PLAN.md`) when executing a phase.
3. `.planning/STATE.md` (current truth of progress).
4. `.planning/ROADMAP.md` (phase-level intent and status).
5. `.planning/codebase/*.md` (architecture, conventions, testing, concerns).
6. `docs/BUSINESS_LOGIC.md` and `docs/TESTING.md`.
7. `AGENTS.md`.

Rules:

- If planning docs conflict with current code behavior, trust code + `.planning/codebase/*`, then note the discrepancy.
- Ignore `.planning/codebase.bak-*` unless explicitly asked.

## Active Work Focus (Default Bias)

Canonical Source: `docs/agent/CODEX_WORKING_RULES.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`

Unless user redirects, prioritize unresolved work identified as in progress in:

- `.planning/STATE.md`
- `.planning/ROADMAP.md`

## Execution Protocol

Canonical Source: `docs/agent/EXECUTION_PROTOCOL.md`

Before coding:

1. Restate acceptance criteria and required output.
2. Read the smallest relevant set of files first (`rg` then targeted opens).
3. If phase-driven work: read plan + context + related summaries first.

During coding:

1. Keep diffs small and scoped to task intent.
2. Preserve existing patterns in touched areas unless plan requires refactor.
3. Update tests near changed behavior.

After coding:

1. Run the minimum meaningful verification for touched surface area.
2. If phase plan requires it, add/update matching `*-SUMMARY.md`.
3. If phase completion changes state, reconcile `.planning/STATE.md` and `.planning/ROADMAP.md`.

## Risk Hotspots (Mandatory Extra Care)

Canonical Source: `.planning/codebase/CONCERNS.md`, `docs/agent/TIMEZONE_POLICY.md`, `docs/agent/ENDPOINT_INVARIANTS.md`

- Approval execution side effects (`backend/app/services/approval_execution_service.py`)
- Timezone handling (naive vs aware datetime writes)
- RBAC scoping/filtering logic across backend + frontend gates
- Role/permission seed drift (`backend/app/db/seed.py`, `backend/scripts/seed_*.py`)
- Mock auth boundaries and demo login paths

For these areas, require stronger verification before closing.

## Key Knowledge (Keep In Sync)

Canonical Source: `docs/agent/TIMEZONE_POLICY.md`, `docs/agent/PYTEST_RUNTIME_NOTES.md`, `docs/agent/ENDPOINT_INVARIANTS.md`

### Timezone policy (UTC-aware)

Canonical Source: `docs/agent/TIMEZONE_POLICY.md`

- Persist all “instant” timestamps as **timezone-aware UTC** (`datetime` with `tzinfo=UTC`) and Postgres **`timestamptz`**.
- Use `backend/app/core/datetime_utils.py`:
  - `utc_now()` for new timestamps.
  - `coerce_utc()` when accepting values that might be naive (naive is treated as UTC).
- Regression guard: `tests/backend/pytest/test_no_datetime_utcnow.py` fails if `datetime.utcnow()` or `replace(tzinfo=None)` is reintroduced in `backend/app` or `backend/scripts`.
- Regression guard: `tests/backend/pytest/test_timezone_policy.py` fails if any `DateTime(timezone=False)` column exists.
- Legacy conversion migration: `backend/alembic/versions/e9c3a1b7d2f4_convert_naive_timestamps_to_timestamptz.py` converts old `timestamp without time zone` columns using `AT TIME ZONE 'UTC'` (assumes existing values represent UTC instants).

### Postgres test mode

Canonical Source: `docs/agent/PYTEST_RUNTIME_NOTES.md`, `.planning/codebase/TESTING.md`

- Default tests run on in-memory SQLite; set `TEST_DATABASE_URL` to run the suite on Postgres.
- `tests/backend/pytest/conftest.py` applies `alembic upgrade head` once per session and truncates all tables between tests when using Postgres.
- Example: `cd backend && TEST_DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/riskhub_test pytest -v`

### Pytest exit hang (SQLite / aiosqlite)

Canonical Source: `docs/agent/PYTEST_RUNTIME_NOTES.md`

- Symptom: `pytest` completes but does not exit; a non-daemon `aiosqlite` `_connection_worker_thread` remains alive.
- Canonical fix: in `tests/backend/pytest/conftest.py`, ensure the session `event_loop` is the current loop and dispose the app’s `app.state.db_engine` at session end via an autouse fixture.
- Debugging: set `PYTEST_THREAD_DEBUG=1` to dump remaining non-daemon threads at `pytest_sessionfinish`.

### Endpoint package splits (maintainability)

Canonical Source: `docs/agent/ENDPOINT_INVARIANTS.md`

- These endpoints are **packages** (not single files): `controls/`, `risks/`, `kris/`, `dashboard/`, `issues/`, `reports/`, `riskhub/`, `approvals/`, `departments/`, `users/`, `vendors/`, `vendor_incidents/`, `vendor_dependencies/`, `vendor_slas/`, `admin/`, `risk_questionnaires/`.
- Invariant: `app.api.v1.endpoints.<name>.router` must remain the exported router object (see `backend/app/api/v1/endpoints/<name>/__init__.py`).
- FastAPI gotcha: if any subrouter defines routes at path `""` (e.g. `@router.get("")`), that router must be the exported base router (don’t include it under an extra wrapper `APIRouter()`).
- Required re-exports (keep stable import paths):
  - `app.api.v1.endpoints.risks.generate_risk_id_code` (tests depend on it)
  - `app.api.v1.endpoints.riskhub.get_cro_user` (used by `backend/app/api/v1/endpoints/riskhub_questionnaires.py`)
  - `app.api.v1.endpoints.users.get_password_hash` (tests depend on it)

### SQLAlchemy FK cycles (SQLite tests)

Canonical Source: `docs/agent/ENDPOINT_INVARIANTS.md`

- SQLite `Base.metadata.drop_all()` can warn if a FK cycle exists; `Department.manager_id -> users.id` is marked with `use_alter=True` to break the `departments`/`users` cycle.

## Testing Matrix

Canonical Source: `.planning/codebase/TESTING.md`, `docs/TESTING.md`

Run based on change type:

- Backend API/domain logic: `make -f scripts/Makefile test`
- Approval/timezone/Postgres-specific behavior: `cd backend && pytest -m postgres -v`
- Frontend unit/integration: `cd frontend && npm run test:run`
- Frontend type safety: `cd frontend && npx tsc --noEmit`
- End-to-end flows: `make -f scripts/Makefile test-e2e`

Testing expectations:

- Do not rely on SQLite-only passes for Postgres-sensitive behavior.
- For RBAC/workflow changes, verify both API behavior and UI gating.

## RBAC and Business Logic Guardrails

Canonical Source: `docs/BUSINESS_LOGIC.md`, `.planning/codebase/CONCERNS.md`

- Keep backend enforcement as the authority; frontend gating must mirror, not replace, backend checks.
- For permission changes, reconcile:
  - endpoint guards/dependencies
  - service-level authorization checks
  - frontend `PermissionGate` / permission hooks
  - `docs/BUSINESS_LOGIC.md`

## Frontend Display Guardrails

Canonical Source: `docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md`

- Do not render raw database numeric IDs in user-facing UI surfaces.
- Prefer business identifiers: names, titles, codes, or human-readable labels.
- If a related entity cannot be resolved, show `Unknown <entity>` text (for example, `Unknown user`) and never expose numeric IDs as fallback.
- Technical IDs are acceptable in logs, telemetry, and developer tooling only, not in end-user screens.

## Security and Production Guardrails

Canonical Source: `docs/deployment/security-checklist.md`, `docs/deployment/README.md`

- Never commit real secrets or environment values.
- Production defaults must keep:
  - `DEBUG=false`
  - `MOCK_AUTH_ENABLED=false`
  - strong `SECRET_KEY`
  - webhook signature verification enabled when webhook endpoints are used
- Do not expose or depend on demo auth paths in production behavior.

## Quick Commands

Canonical Source: `scripts/dev.sh`, `scripts/Makefile`, `docs/deployment/component-runtime-entrypoints.md`

- Canonical startup (new sessions): `./scripts/dev.sh --daemon`
- Canonical startup (foreground): `./scripts/dev.sh`
- Stop canonical daemon sessions: `screen -S riskhub-backend -X quit && screen -S riskhub-frontend -X quit`
- Dev backend only: `make -f scripts/Makefile dev`
- Dev backend + frontend: `make -f scripts/Makefile dev-full`
- Docker stack: `make -f scripts/Makefile docker`
- Migrations: `make -f scripts/Makefile migrate`
- Backend tests: `make -f scripts/Makefile test`
- E2E tests: `make -f scripts/Makefile test-e2e`

For launch/runbook behavior, treat `scripts/dev.sh` as source of truth.

## Component Runtime Commands

Canonical Source: `docs/deployment/component-runtime-entrypoints.md`

- Frontend dev runtime: `frontend/scripts/runtime/dev.sh`
- Frontend test runtime profile: `frontend/scripts/runtime/test.sh`
- Frontend prod component deploy/upgrade: `frontend/scripts/runtime/prod.sh`
- Backend dev runtime: `backend/scripts/runtime/dev.sh`
- Backend test runtime profile: `backend/scripts/runtime/test.sh`
- Backend prod component deploy/upgrade: `backend/scripts/runtime/prod.sh`
- DB dev runtime (backend-owned): `backend/scripts/runtime/db/dev.sh`
- DB test runtime reset/start (backend-owned): `backend/scripts/runtime/db/test.sh`
- DB prod lifecycle update (backend-owned): `backend/scripts/runtime/db/prod.sh`

## Demo/Dev Auth (local)

Canonical Source: `scripts/dev.sh`, `.planning/codebase/INTEGRATIONS.md`

Local dev is expected to run in **demo-friendly auth mode** (keeps Playwright E2E stable).

- `./scripts/dev.sh` (local backend) defaults to:
  - `AUTH_MODE=hybrid_dev`
  - `DEBUG=true`
  - `MOCK_AUTH_ENABLED=true`
- This enables the demo login picker at `http://localhost:5173/login` via `POST /api/v1/auth/demo-login/{user_id}`.
- Override example (no demo auth): `AUTH_MODE=password MOCK_AUTH_ENABLED=false ./scripts/dev.sh`

## Repo Hygiene

Canonical Source: `.planning/codebase/STRUCTURE.md`, `docs/agent/CODEX_WORKING_RULES.md`

- Avoid editing generated/vendor folders:
  - `frontend/node_modules/`
  - `frontend/dist/`
  - `backend/venv/`
  - `tests/results/backend/coverage_html/`
  - `tests/results/`
- Prefer small, reviewable diffs over broad rewrites.
- Do not modify unrelated files just to satisfy formatting preferences.

## Prompting and Tooling Best Practices (OpenAI-Aligned)

Canonical Source: `docs/agent/CODEX_WORKING_RULES.md`

- State objective, constraints, and expected output format before execution.
- Use strict structured outputs for machine-consumed results when possible.
- Keep tool/function contracts explicit, minimal, and schema-driven.
- Batch and parallelize independent operations to reduce latency/cost.
- Run an eval-like verification loop on behavior-changing work (tests + checks), then iterate once before finalizing.
- Keep reusable instruction prefixes stable; append task-specific context after them for cache efficiency.

## Skills

Canonical Source: `docs/agent/SKILLS_RESOLUTION.md`

Codex resolves skills from:

1. Repo: `./.codex/skills/`
2. User: `$CODEX_HOME/skills/` (usually `~/.codex/skills/`)

Use skills when the task clearly matches a skill workflow.
