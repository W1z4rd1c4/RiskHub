# RiskHub E2E Testing Guide

> **Version**: 1.3
> **Last Updated**: 2026-03-29
> **Audience**: QA, Engineering
> **Source of Truth**: `tests/frontend/e2e/playwright.config.ts`, `tests/frontend/e2e/`, `frontend/package.json`

This guide covers Playwright execution, suite organization, and deterministic test prerequisites.

## Quick Start

```bash
cd frontend
npm run e2e
```

Useful variants:

```bash
npm run e2e:ui
npm run e2e:headed
npm run e2e:report
npm run e2e:business-logic
npx playwright install chromium
```

## Prerequisites

1. Backend API running at `http://localhost:8000`.
2. Frontend app running at `http://localhost:5173`, or Docker nginx at `http://localhost/` with `FRONTEND_URL=http://localhost`.
3. Deterministic fixture data seeded for E2E when required by suite expectations.

Canonical startup guidance:

- [`docs/development/README.md`](./development/README.md)
- Playwright still defaults to the local Vite frontend on `http://localhost:5173`
- Docker full-stack at `http://localhost/` is for onboarding/manual verification unless `FRONTEND_URL` is overridden

## Suite Topology

Primary suite groups in `tests/frontend/e2e/`:

- Core app: `auth`, `dashboard`, `risks`, `controls`, `kris`, `vendors`, `admin`
- Business logic packs:
  - `approval-workflows/`
  - `permissions/`
  - `sensitive-fields/`
  - `cross-department/`
  - `entity-ownership/`
  - `activity-logging/`
- Focus suites: `issues-workflow`, `issues-contextual-create`, `settings-isolation`, `navigation-stability`, `questionnaires`

## Deterministic Seed Workflow

One-command deterministic reset + full seed (recommended):

```bash
./scripts/compose.sh reset --dataset test
```

This wipes Docker dev volumes, reruns migrations + base demo seed, then adds deterministic E2E fixtures:

- `python -m app.db.seed` (base demo data)
- `python -m scripts.seed_e2e_all` (deterministic E2E fixtures)

For a fresh database, seed baseline + E2E entities:

```bash
cd backend
venv/bin/python -m app.db.seed
venv/bin/python -m scripts.seed_e2e_all
```

Rules:

- E2E seed scripts must not create duplicate role/department identity records.
- Deterministic entities are consumed by fixtures and page-object selectors.

## Docker Full-Stack Verification

Preferred deterministic reset:

```bash
./scripts/compose.sh reset --dataset test
```

Observed 2026-03-29:

- The Docker bootstrap container currently fails that reset path during `alembic upgrade head` with `ModuleNotFoundError: No module named 'psycopg2'`.
- Verified fallback when you still need a Docker-backed browser run:

```bash
cd backend
DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub ./venv/bin/alembic upgrade head
DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub ./venv/bin/python -m app.db.seed
DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub ./venv/bin/python -m scripts.seed_e2e_all

cd ..
docker compose -f docker-compose.yml --profile full up -d --build backend frontend
docker compose -f docker-compose.yml --profile full up -d --no-deps frontend
```

- The explicit `frontend` start is a current workaround for the backend container healthcheck: the image healthcheck uses `curl`, but the current backend image does not include it.

Preflight:

```bash
curl -fsS http://localhost:8000/api/v1/health
curl -fsS http://localhost:8000/api/v1/auth/config
curl -I -fsS http://localhost/login
```

Docker-targeted Playwright commands:

```bash
cd frontend
FRONTEND_URL=http://localhost npm run e2e:business-logic
FRONTEND_URL=http://localhost POLISH_AUDIT_DEEP=1 npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/polish-audit.spec.ts --project=chromium
```

Current Docker-origin blocker:

- The shared login helper in [`tests/frontend/e2e/helpers/login.ts`](../tests/frontend/e2e/helpers/login.ts) still waits for `http://localhost:5173/...`.
- Docker full-stack runs with `FRONTEND_URL=http://localhost` therefore time out after successful demo-login redirects until that helper is made origin-aware.
- Verified failing artifacts from 2026-03-29 are written under `tests/results/frontend/playwright/test-results/`.

Current automation scope:

- `polish-audit.spec.ts` automates `riskhub` and `light`.
- `dark` theme remains a manual verification lane for now.

## Running Targeted Packs

Examples:

```bash
cd frontend
npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/cross-department --project=chromium
npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/permissions --project=chromium
npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/entity-ownership/risk-ownership.spec.ts --project=chromium
```

## Debugging

```bash
cd frontend
npx playwright test -c ../tests/frontend/e2e/playwright.config.ts --debug
PWDEBUG=1 npx playwright test -c ../tests/frontend/e2e/playwright.config.ts
npx playwright test -c ../tests/frontend/e2e/playwright.config.ts --trace on
npx playwright show-trace ../tests/results/frontend/playwright/test-results/<run>/placeholder-zip-017.zip
```

## CI Notes

- Use deterministic data and avoid hidden test coupling between suites.
- Prefer targeted reruns for fast triage before full suite reruns.
- Persist Playwright artifacts (`junit`, traces, HTML report) for failed runs.
- Docker-targeted local runs also write artifacts under `tests/results/frontend/playwright/`.

## Exit Criteria for E2E Changes

- Modified E2E specs pass locally for touched suites.
- No regression in role-scoped access and docs audience behavior.
- Report artifacts are inspectable when failures occur.
