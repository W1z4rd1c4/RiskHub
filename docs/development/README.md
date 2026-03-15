# RiskHub Development Startup

> **Version**: 1.0
> **Last Updated**: 2026-03-15
> **Audience**: Engineering, QA

Back to tree: [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

This document defines the supported local startup surface for RiskHub development.

## Canonical Paths

### Local contributor path

Use local runtimes when you are actively iterating on backend or frontend code.

```bash
./scripts/dev.sh
./scripts/dev.sh --backend
```

Behavior:

- Starts Docker-backed DB + Redis via `./scripts/compose.sh up --profile db-only`
- Runs backend dependency setup and schema-head preflight locally
- Starts backend on `http://localhost:8000`
- Starts Vite frontend on `http://localhost:5173` in full mode
- Defaults to demo-friendly auth (`AUTH_MODE=hybrid_dev`, `MOCK_AUTH_ENABLED=true`, `DEBUG=true`)

Important:

- On a fresh local database, `./scripts/dev.sh` can stop on schema-head preflight.
- Recovery path:

```bash
cd backend
./venv/bin/alembic upgrade head
./venv/bin/python -m app.db.seed
```

### Docker onboarding/appliance path

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

LAN mode:

```bash
./scripts/compose.sh up --lan 192.168.x.x
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
- Docker full-stack at `http://localhost/` is useful for manual verification, but it is not the default Playwright frontend unless `FRONTEND_URL` is overridden
- Recommended deterministic E2E reset:

```bash
./scripts/compose.sh reset --dataset test
```

## Compatibility Notes

- `./scripts/setup.sh` is deprecated and now only forwards to `./scripts/compose.sh`
- `./scripts/dev.sh --docker` and `./scripts/dev.sh --lan` are deprecated compatibility paths that forward to `./scripts/compose.sh`
- Production deployment remains separate and must use `./scripts/deploy.sh`
