# RiskHub Development Startup

> **Version**: 1.1
> **Last Updated**: 2026-04-05
> **Audience**: Engineering, QA

Back to tree: [`docs/DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

This document defines the supported local startup surface for RiskHub development.

## Canonical Paths

### Docker onboarding path

Recommended for most people.

Use Docker when you want the lowest-friction first run, demo stack, or deterministic reset workflow.

```bash
./scripts/install.sh demo
./scripts/install.sh demo --reset test
```

Behavior:

- `up` boots DB + Redis, runs `alembic upgrade head`, seeds base demo data, then starts backend/frontend containers
- Full Docker stack serves the app at `http://localhost/`
- `reset --dataset test` wipes Docker volumes, reruns migrations + base seed, then adds deterministic E2E fixtures

Open `http://localhost/login` after startup.

Deterministic live-verification preference:

- Prefer `./scripts/install.sh demo --reset test` when you need seeded browser verification against the Docker-served app at `http://localhost/`.
- Advanced/manual Docker entrypoints remain available under `./scripts/compose.sh`.
- The Docker bootstrap service now uses the backend `dbtasks` target, so `reset --dataset test` runs migrations and seed commands with the required Postgres client dependencies.
- Docker Compose now inherits the backend image's Python healthcheck instead of overriding it with `curl`.

LAN mode:

```bash
./scripts/compose.sh up --lan 192.168.x.x
```

### Local contributor path

Use local runtimes when you are actively iterating on backend or frontend code.

```bash
./scripts/install.sh dev
./scripts/install.sh dev --backend
```

Behavior:

- Starts Docker-backed DB + Redis via `./scripts/compose.sh up --profile db-only`
- Runs backend dependency setup and schema-head preflight locally
- On a brand-new local database, auto-runs migrations and base seed before re-checking schema head
- Starts backend on `http://localhost:8000`
- Starts Vite frontend on `http://localhost:5173` in full mode
- Defaults to demo-friendly auth (`AUTH_MODE=hybrid_dev`, `MOCK_AUTH_ENABLED=true`, `DEBUG=true`)

Important:

- On an already-initialized local database, schema drift still fails fast with an actionable migration command.
- Advanced/manual contributor entrypoints remain available under `./scripts/dev.sh`.
- Manual recovery path:

```bash
cd backend
./venv/bin/alembic upgrade head
./venv/bin/python -m app.db.seed
```

## Lifecycle / Recovery

Use the public lifecycle wrapper before dropping to the lower-level script layer.

```bash
./scripts/install.sh status --mode demo
./scripts/install.sh status --mode dev
./scripts/install.sh logs --mode demo --tail 200 --follow
./scripts/install.sh logs --mode dev --tail 200 --follow
./scripts/install.sh doctor --mode demo
./scripts/install.sh doctor --mode dev --repair
```

Behavior:

- `status --mode demo` reports Docker container state plus `http://localhost/login` and `/api/v1/auth/config` readiness.
- `status --mode dev` reports DB/Redis availability, backend/frontend listener readiness, auth-config health, and local Node major compatibility.
- `logs --mode demo` routes to `./scripts/compose.sh logs`; `logs --mode dev` tails `.dev-backend.log` and `.dev-frontend.log`.
- `doctor --mode demo --repair` only starts the Docker stack if it is missing; it does not reset volumes or reseed data.
- `doctor --mode dev --repair` only restores db-only infra, dependency state, and daemonized backend/frontend processes; it does not reset local data.

## Demo / Dev Auth

- Local `./scripts/dev.sh` uses the Vite frontend at `http://localhost:5173/login`
- Docker `./scripts/compose.sh up` uses the nginx frontend at `http://localhost/login`
- Both paths keep demo login enabled for development-only auth flows
- To disable demo auth for local backend runs:

```bash
AUTH_MODE=password MOCK_AUTH_ENABLED=false ./scripts/dev.sh
```

## E2E and Testing Notes

- Playwright E2E still defaults to the local Vite frontend at `http://localhost:5173`
- `npm run e2e` may start Vite automatically through `frontend/playwright.config.ts`
- Docker full-stack at `http://localhost/` is the preferred deterministic live-verification surface, but Playwright must be pointed at it with `FRONTEND_URL=http://localhost`
- Recommended deterministic E2E reset:

```bash
./scripts/install.sh demo --reset test
```

- Docker-targeted browser commands:

```bash
cd frontend
FRONTEND_URL=http://localhost npm run e2e:business-logic
FRONTEND_URL=http://localhost POLISH_AUDIT_DEEP=1 npx playwright test -c playwright.config.ts ../tests/frontend/e2e/polish-audit.spec.ts --project=chromium
```

- Docker-targeted Playwright runs rely on `FRONTEND_URL=http://localhost`; the shared E2E login helper is now origin-aware and works against both `http://localhost:5173` and the Docker nginx surface.
- The underlying advanced/manual reset command remains `./scripts/compose.sh reset --dataset test`.
- `polish-audit.spec.ts` covers `riskhub`, `light`, and `dark`.
- When the Docker app stack is live on the `riskhub` database, run Postgres marker tests against a separate `riskhub_test` database instead of the live app DB.

## Boundaries

- `./scripts/install.sh` is the public first-run and lifecycle entrypoint for demo and local contributor installs
- `./scripts/compose.sh` and `./scripts/dev.sh` remain supported advanced/manual entrypoints
- Production deployment remains separate and should use `./scripts/install.sh production --target docker|linux`
