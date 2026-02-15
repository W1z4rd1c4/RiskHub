# RiskHub — AGENTS Playbook

## Mission

- Deliver correct, test-verified changes to RiskHub with minimal unrelated churn.
- Prefer evidence from repo artifacts over assumptions.

## Project Map

- `backend/`: FastAPI + SQLAlchemy + Alembic + pytest
- `frontend/`: React + TypeScript + Vite + Vitest + Playwright
- `docs/`: business logic, testing, user/admin documentation
- `.planning/`: roadmap, state, and phase plans/summaries
- `AD Emulator/`: separate directory simulation app (out of scope unless requested)

## Source-of-Truth Order

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

Unless user redirects, prioritize unresolved work identified as in progress in:

- `.planning/STATE.md`
- `.planning/ROADMAP.md`

## Execution Protocol

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

- Approval execution side effects (`backend/app/services/approval_execution_service.py`)
- Timezone handling (naive vs aware datetime writes)
- RBAC scoping/filtering logic across backend + frontend gates
- Role/permission seed drift (`backend/app/db/seed.py`, `backend/scripts/seed_*.py`)
- Mock auth boundaries and demo login paths

For these areas, require stronger verification before closing.

## Key Knowledge (Keep In Sync)

### Timezone policy (UTC-aware)

- Persist all “instant” timestamps as **timezone-aware UTC** (`datetime` with `tzinfo=UTC`) and Postgres **`timestamptz`**.
- Use `backend/app/core/datetime_utils.py`:
  - `utc_now()` for new timestamps.
  - `coerce_utc()` when accepting values that might be naive (naive is treated as UTC).
- Regression guard: `backend/tests/test_no_datetime_utcnow.py` fails if `datetime.utcnow()` or `replace(tzinfo=None)` is reintroduced in `backend/app` or `backend/scripts`.
- Regression guard: `backend/tests/test_timezone_policy.py` fails if any `DateTime(timezone=False)` column exists.
- Legacy conversion migration: `backend/alembic/versions/e9c3a1b7d2f4_convert_naive_timestamps_to_timestamptz.py` converts old `timestamp without time zone` columns using `AT TIME ZONE 'UTC'` (assumes existing values represent UTC instants).

### Postgres test mode

- Default tests run on in-memory SQLite; set `TEST_DATABASE_URL` to run the suite on Postgres.
- `backend/tests/conftest.py` applies `alembic upgrade head` once per session and truncates all tables between tests when using Postgres.
- Example: `cd backend && TEST_DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/riskhub_test pytest -v`

### Pytest exit hang (SQLite / aiosqlite)

- Symptom: `pytest` completes but does not exit; a non-daemon `aiosqlite` `_connection_worker_thread` remains alive.
- Canonical fix: in `backend/tests/conftest.py`, ensure the session `event_loop` is the current loop and dispose the app-global `app.db.session.engine` at session end via an autouse fixture.
- Debugging: set `PYTEST_THREAD_DEBUG=1` to dump remaining non-daemon threads at `pytest_sessionfinish`.

### Endpoint package splits (maintainability)

- These endpoints are **packages** (not single files): `controls/`, `risks/`, `kris/`, `dashboard/`, `issues/`, `reports/`, `riskhub/`, `approvals/`, `departments/`, `users/`, `vendors/`, `vendor_incidents/`, `vendor_dependencies/`, `vendor_slas/`, `admin/`, `risk_questionnaires/`.
- Invariant: `app.api.v1.endpoints.<name>.router` must remain the exported router object (see `backend/app/api/v1/endpoints/<name>/__init__.py`).
- FastAPI gotcha: if any subrouter defines routes at path `""` (e.g. `@router.get("")`), that router must be the exported base router (don’t include it under an extra wrapper `APIRouter()`).
- Required re-exports (keep stable import paths):
  - `app.api.v1.endpoints.risks.generate_risk_id_code` (tests depend on it)
  - `app.api.v1.endpoints.riskhub.get_cro_user` (used by `backend/app/api/v1/endpoints/riskhub_questionnaires.py`)
  - `app.api.v1.endpoints.users.get_password_hash` (tests depend on it)

### SQLAlchemy FK cycles (SQLite tests)

- SQLite `Base.metadata.drop_all()` can warn if a FK cycle exists; `Department.manager_id -> users.id` is marked with `use_alter=True` to break the `departments`/`users` cycle.

## Testing Matrix

Run based on change type:

- Backend API/domain logic: `make test`
- Approval/timezone/Postgres-specific behavior: `cd backend && pytest -m postgres -v`
- Frontend unit/integration: `cd frontend && npm run test:run`
- Frontend type safety: `cd frontend && npx tsc --noEmit`
- End-to-end flows: `make test-e2e`

Testing expectations:

- Do not rely on SQLite-only passes for Postgres-sensitive behavior.
- For RBAC/workflow changes, verify both API behavior and UI gating.

## RBAC and Business Logic Guardrails

- Keep backend enforcement as the authority; frontend gating must mirror, not replace, backend checks.
- For permission changes, reconcile:
  - endpoint guards/dependencies
  - service-level authorization checks
  - frontend `PermissionGate` / permission hooks
  - `docs/BUSINESS_LOGIC.md`

## Frontend Display Guardrails

- Do not render raw database numeric IDs in user-facing UI surfaces.
- Prefer business identifiers: names, titles, codes, or human-readable labels.
- If a related entity cannot be resolved, show `Unknown <entity>` text (for example, `Unknown user`) and never expose numeric IDs as fallback.
- Technical IDs are acceptable in logs, telemetry, and developer tooling only, not in end-user screens.

## Security and Production Guardrails

- Never commit real secrets or environment values.
- Production defaults must keep:
  - `DEBUG=false`
  - `MOCK_AUTH_ENABLED=false`
  - strong `SECRET_KEY`
  - webhook signature verification enabled when webhook endpoints are used
- Do not expose or depend on demo auth paths in production behavior.

## Quick Commands

- Canonical startup (new sessions): `./scripts/dev.sh --daemon`
- Canonical startup (foreground): `./scripts/dev.sh`
- Stop canonical daemon sessions: `screen -S riskhub-backend -X quit && screen -S riskhub-frontend -X quit`
- Dev backend only: `make dev`
- Dev backend + frontend: `make dev-full`
- Docker stack: `make docker`
- Migrations: `make migrate`
- Backend tests: `make test`
- E2E tests: `make test-e2e`

For launch/runbook behavior, treat `scripts/dev.sh` as source of truth.

## Demo/Dev Auth (local)

Local dev is expected to run in **demo-friendly auth mode** (keeps Playwright E2E stable).

- `./scripts/dev.sh` (local backend) defaults to:
  - `AUTH_MODE=hybrid_dev`
  - `DEBUG=true`
  - `MOCK_AUTH_ENABLED=true`
- This enables the demo login picker at `http://localhost:5173/login` via `POST /api/v1/auth/demo-login/{user_id}`.
- Override example (no demo auth): `AUTH_MODE=password MOCK_AUTH_ENABLED=false ./scripts/dev.sh`

## Repo Hygiene

- Avoid editing generated/vendor folders:
  - `frontend/node_modules/`
  - `frontend/dist/`
  - `backend/venv/`
  - `backend/coverage_html/`
  - `test-results/`
- Prefer small, reviewable diffs over broad rewrites.
- Do not modify unrelated files just to satisfy formatting preferences.

## Prompting and Tooling Best Practices (OpenAI-Aligned)

- State objective, constraints, and expected output format before execution.
- Use strict structured outputs for machine-consumed results when possible.
- Keep tool/function contracts explicit, minimal, and schema-driven.
- Batch and parallelize independent operations to reduce latency/cost.
- Run an eval-like verification loop on behavior-changing work (tests + checks), then iterate once before finalizing.
- Keep reusable instruction prefixes stable; append task-specific context after them for cache efficiency.

## Skills

Codex resolves skills from:

1. Repo: `./.codex/skills/`
2. User: `$CODEX_HOME/skills/` (usually `~/.codex/skills/`)

Use skills when the task clearly matches a skill workflow.
