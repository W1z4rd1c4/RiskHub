# backend/app/api/v1/endpoints/processes

## Purpose

API endpoint package for the ICT Register `processes` domain (issue #42).

## Contents

- `__init__.py`
- `crud.py` - process list/create/read/update routes
- `lifecycle.py` - process archive (DELETE) and restore routes
- `links.py` - the Process-end read of the Process<->Asset Link relation
  (issue #43) and the manual Process<->Vendor Link relation routes managed
  from the Process detail (issue #46); the Vendor-end reads live in
  `endpoints/vendors/links.py`

## Conventions

- Thin adapters: `require_permission("processes", ...)` dependencies only;
  no commits (ADR-002) — transactions live in
  `app/services/_ict_register_lifecycle/lifecycle.py` and
  `app/services/_ict_register_lifecycle/vendor_links.py`.
- Registered in `app/api/v1/router.py` under `/processes` and enumerated in
  `_router_registry.toml`.
