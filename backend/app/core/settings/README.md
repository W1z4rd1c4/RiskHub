# backend/app/core/settings

## Purpose

Physical settings segmentation without changing the flat environment-variable contract.

## Contents

- `root.py`
  - Canonical `Settings` composition, env-source normalization, and `_FILE` secret loading.
- `app.py`, `database.py`, `auth.py`, `network.py`, `redis.py`, `outbound.py`, `session.py`, `protocol_guard.py`, `scheduler.py`
  - Field groups and derived section/credential helpers by concern.
- `common.py`
  - Shared helpers and typed confidential-credential contract.

## Notes

- `backend/app/core/config.py` remains the import-stable facade for `Settings`, `get_settings`, and `EntraConfidentialCredential`.
- The runtime env contract stays flat; this package only segments implementation ownership.
- `root.py` assembles the public `Settings` object and `get_settings()`.
- Keep file-backed secret handling and alias normalization behavior in sync with tests before restructuring this package.
