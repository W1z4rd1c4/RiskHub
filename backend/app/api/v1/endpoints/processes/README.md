# backend/app/api/v1/endpoints/processes

## Purpose

API endpoint package for the ICT Register `processes` domain (issue #42).

## Contents

- `__init__.py`
- `crud.py` - process list/create/read/update routes
- `lifecycle.py` - process archive (DELETE) and restore routes

## Conventions

- Thin adapters: `require_permission("processes", ...)` dependencies only;
  no commits (ADR-002) — transactions live in
  `app/services/_ict_register_lifecycle/lifecycle.py`.
- Registered in `app/api/v1/router.py` under `/processes` and enumerated in
  `_router_registry.toml`.
