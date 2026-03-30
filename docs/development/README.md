# RiskHub Development Startup

> **Version**: 1.1
> **Last Updated**: 2026-03-29
> **Audience**: Engineering, QA

Back to tree: [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

This document defines the supported local startup surface for RiskHub development.

## Canonical Paths

### Docker onboarding path

Recommended for most people.

Use Docker when you want the lowest-friction first run, demo stack, or deterministic reset workflow.

```bash
./scripts/compose.sh up
./scripts/compose.sh up --profile db-only
./scripts/compose.sh reset --dataset test
```

Behavior:

- `up` boots DB + Redis, runs `alembic upgrade head`, seeds base demo data, then starts backend/frontend containers
- Full Docker stack serves the app at `http://localhost/`
- `up --profile db-only` starts only DB + Redis for local contributor workflows
- `reset --dataset test` wipes Docker volumes, reruns migrations + base seed, then adds deterministic E2E fixtures

Open `http://localhost/login` after startup.

Deterministic live-verification preference:

- Prefer `./scripts/compose.sh reset --dataset test` when you need seeded browser verification against the Docker-served app at `http://localhost/`.
- The Docker bootstrap service now reuses the backend runtime image, so `reset --dataset test` runs migrations and seed commands inline from the backend image contract.
- Docker Compose now inherits the backend image's Python healthcheck instead of overriding it with `curl`.

LAN mode:

```bash
./scripts/compose.sh up --lan 192.168.x.x
```

### Local contributor path

Use local runtimes when you are actively iterating on backend or frontend code.

```bash
./scripts/dev.sh
./scripts/dev.sh --backend
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
- Manual recovery path:

```bash
cd backend
./venv/bin/alembic upgrade head
./venv/bin/python -m app.db.seed
```

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
- `npm run e2e` may start Vite automatically through `tests/frontend/e2e/playwright.config.ts`
- Docker full-stack at `http://localhost/` is the preferred deterministic live-verification surface, but Playwright must be pointed at it with `FRONTEND_URL=http://localhost`
- Recommended deterministic E2E reset:

```bash
./scripts/compose.sh reset --dataset test
```

- Docker-targeted browser commands:

```bash
cd frontend
FRONTEND_URL=http://localhost npm run e2e:business-logic
FRONTEND_URL=http://localhost POLISH_AUDIT_DEEP=1 npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/polish-audit.spec.ts --project=chromium
```

- Docker-targeted Playwright runs rely on `FRONTEND_URL=http://localhost`; the shared E2E login helper is now origin-aware and works against both `http://localhost:5173` and the Docker nginx surface.
- `polish-audit.spec.ts` currently covers `riskhub` and `light`; `dark` theme still needs manual verification.
- When the Docker app stack is live on the `riskhub` database, run Postgres marker tests against a separate `riskhub_test` database instead of the live app DB.

## Boundaries

- `./scripts/dev.sh` is the only supported local contributor entrypoint
- `./scripts/compose.sh` is the only supported Docker development/onboarding entrypoint
- Production deployment remains separate and must use `./scripts/deploy.sh`
