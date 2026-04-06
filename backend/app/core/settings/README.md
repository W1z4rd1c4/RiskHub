# backend/app/core/settings

## Purpose

Typed application settings composition for RiskHub.

## Contents

- `__init__.py`
- `app.py`
- `auth.py`
- `common.py`
- `database.py`
- `network.py`
- `outbound.py`
- `protocol_guard.py`
- `redis.py`
- `root.py`
- `scheduler.py`
- `session.py`

## Notes

- `root.py` assembles the public `Settings` object and `get_settings()`.
- Domain mixins own flat environment-backed fields; `backend/app/core/config.py` remains the import-stable facade.
- Keep file-backed secret handling and alias normalization behavior in sync with tests before restructuring this package.
