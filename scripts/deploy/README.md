# scripts/deploy

## Purpose

Deploy CLI implementation assets behind the supported `./scripts/deploy.sh` admin interface.

## Contents

- `lib/`: deploy argument parsing, runtime file rendering, and target executors
- `templates/`: linux nginx/systemd templates consumed by the renderer

## Notes

- Docker deploys now have a four-image contract in explicit-image mode: runtime backend, backend DB, frontend, and redis.
- Linux release installs now consume a split artifact layout: `backend/` for long-running runtime content and `backend_db/` for DB/bootstrap tasks.
- `lib/render.py` writes `backend.env` and `frontend.env` as plain env files, and `metadata.env` as a shell-safe file intended to be `source`d by internal deploy helpers.
- Keep this README updated when responsibilities or structure in this folder change.

## Identity DB tasks

Release DB artifacts include the operator-only `scripts.identity_installation` module.
Fresh bootstrap initializes/verifies an empty installation before Entra users are
created. Populated unbound installations require explicit maintenance adoption;
managed upgrades stop API/scheduler writers before migrations. Follow
[identity foundations](../../docs/security/identity-foundations.md) for adoption, failure recovery and replica draining.
Native identity selection remains staged work; preserve production admission checks.
