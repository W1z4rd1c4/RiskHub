# backend/app/api/v1/endpoints/admin

## Purpose

API endpoint package for `admin` domain.

## Contents

- `__init__.py`
- `__pycache__/`
- `_deps.py`
- `console.py` (empty compatibility module; routes live in the cluster modules below)
- `directory_sync.py`
- `docs.py`
- `log_config.py`
- `operational_logs.py`
- `orphans.py`
- `sessions.py`
- `snapshots.py`
- `structured_logs.py`
- `system_status.py`

## Notes

The admin console routes are split into system status (`/health`, `/jobs/status`,
`/outbox/status`, `/stats`), operational logs (`/logs`), and session management
(`/sessions`, `/sessions/{user_id}/revoke`) clusters. Keep this README updated
when responsibilities or structure in this folder change.
