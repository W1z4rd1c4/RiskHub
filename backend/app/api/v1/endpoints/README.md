# backend/app/api/v1/endpoints

## Purpose

Folder for `backend/app/api/v1/endpoints` implementation assets.

## Contents

- `__init__.py`
- `__pycache__/`
- `access.py`
- `activity_log.py`
- `admin/`
- `approvals/`
- `auth/`
- `controls/`
- `dashboard/`
- `departments/`
- `directory.py`
- `executions.py`
- `health.py`
- `issues/`
- `kris/`
- `...`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

## Endpoint Registry

`backend/app/api/v1/_router_registry.toml` records the guarded path-prefix and tag metadata for every
`include_router` call in `backend/app/api/v1/router.py`. The architecture lock
`tests/backend/pytest/architecture/test_router_prefix_registry_red.py` keeps the additive registry in
parity with mounted routes until the router include loop is moved to the registry.
