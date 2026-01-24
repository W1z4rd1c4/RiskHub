# RiskHub (RiskHub) — Codex Agent Notes

## Project Map

- `backend/`: FastAPI + Alembic migrations + pytest
- `frontend/`: React + TypeScript + Vite + Playwright
- `docs/`: Business logic, testing, localization, performance notes
- `.planning/`: Roadmap/requirements/state artifacts (GSD-style planning)

## Quick Commands

- Dev (DB + backend): `make dev`
- Dev (DB + backend + frontend): `make dev-full`
- Docker (all services): `make docker` (or `docker-compose up -d`)
- Backend tests: `make test` (or `cd backend && pytest -v`)
- E2E tests: `make test-e2e` (or `cd frontend && npx playwright test`)
- Migrations: `make migrate` (or `cd backend && alembic upgrade head`)

## Repo Hygiene

- Avoid editing generated/vendor dirs: `frontend/node_modules/`, `frontend/dist/`, `backend/venv/`, `backend/coverage_html/`, `test-results/`.
- Treat secrets as sensitive: never commit real `.env` values; prefer `.env.example`.
- Prefer small, reviewable diffs; don’t rewrite unrelated files.

## Agent Skills

Codex loads Agent Skills from (highest priority first):

1. Repo skills: `./.codex/skills/`
2. User skills: `$CODEX_HOME/skills/` (defaults to `~/.codex/skills/`)

Commonly useful skills in this environment:

- `code-simplifier`: targeted refactors/simplification (keep behavior identical)
- `react-best-practices`: React/Next performance patterns (use for frontend work)
- `web-design-guidelines`: UI/UX + accessibility review
- `vercel-deploy`: deploy to Vercel when requested
- `skill-creator` / `skill-installer`: create/update or install skills
- `gsd:*`: roadmap/phase workflows that write to `.planning/`

## Notes for This Repo

- Prefer `rg` for searching, then open the narrowest relevant files.
- If a change affects product behavior, add/adjust tests in the closest existing test suite (`backend/tests/`, `frontend/tests/`, `frontend/e2e/`).
