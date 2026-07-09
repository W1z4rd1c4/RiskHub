# backend/app/api/v1/endpoints/assets

## Purpose

API endpoint package for the ICT Register `assets` domain (issue #43).

## Contents

- `__init__.py`
- `crud.py` - asset list/create/read/update routes
- `lifecycle.py` - asset archive (DELETE) and restore routes
- `links.py` - Process<->Asset and Asset<->Asset Link relation routes managed
  from the Asset detail (add/edit/remove, incl. the primary-Process
  designation swap); the Process-end read lives in
  `endpoints/processes/links.py`

## Conventions

- Thin adapters: `require_permission("assets", ...)` dependencies only;
  no commits (ADR-002) — transactions live in
  `app/services/_ict_register_lifecycle/asset_lifecycle.py` and
  `app/services/_ict_register_lifecycle/asset_links.py`.
- Registered in `app/api/v1/router.py` under `/assets` and enumerated in
  `_router_registry.toml`.
