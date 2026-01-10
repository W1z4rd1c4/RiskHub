---
description: How to start the RiskHub development environment - use this when running the app locally
---

# Starting the Development Environment

The project has a unified development script that handles all startup scenarios.

## Quick Start (Recommended)

```bash
# Start everything: DB (Docker) + Backend + Frontend locally
./scripts/dev.sh
```

This will:
1. Start PostgreSQL in Docker container
2. Run database migrations
3. Start backend on http://localhost:8000
4. Start frontend on http://localhost:5173

Press `Ctrl+C` to stop all services.

## Alternative Modes

```bash
# Backend only (no frontend)
./scripts/dev.sh --backend

# Everything via Docker
./scripts/dev.sh --docker

# LAN access (from other devices)
./scripts/dev.sh --lan 192.168.1.100
```

## Using Makefile

```bash
make help           # Show all commands
make dev            # Same as ./scripts/dev.sh
make docker         # Docker mode
make test           # Run backend tests
make migrate        # Run Alembic migrations
```

## URLs

| Service  | Local URL                    |
|----------|------------------------------|
| Frontend | http://localhost:5173        |
| Backend  | http://localhost:8000        |
| API Docs | http://localhost:8000/docs   |
| Database | localhost:5432               |

## Troubleshooting

If you encounter database connection issues:
1. Ensure Docker is running: `docker ps`
2. Check if DB container is up: `docker-compose ps db`
3. Restart DB: `docker-compose restart db`
4. Check `.env` has correct DATABASE_URL for your mode

If you see "ModuleNotFoundError" (e.g., `psutil`):
1. The `dev.sh` script auto-installs dependencies, but if running manually:
2. Activate venv first: `source backend/venv/bin/activate`
3. Install deps: `pip install -r backend/requirements.txt`
