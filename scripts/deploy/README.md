# scripts/deploy

## Purpose

Deploy CLI implementation assets behind the supported `./scripts/deploy.sh` admin interface.

## Contents

- `lib/`: deploy argument parsing, runtime file rendering, and target executors
- `templates/`: linux nginx/systemd templates consumed by the renderer

## Notes

- Docker deploys now use a three-image contract in explicit-image mode: backend, frontend, and redis. The backend image also runs DB preflight, migrations, and bootstrap tasks.
- Linux release installs now consume a single backend artifact layout: `backend/` holds runtime code, Alembic assets, bootstrap scripts, and both runtime + DB requirements, and install time creates one `venv`.
- `lib/render.py` writes `backend.env` and `frontend.env` as plain env files, and `metadata.env` as a shell-safe file intended to be `source`d by internal deploy helpers.
- Keep this README updated when responsibilities or structure in this folder change.
