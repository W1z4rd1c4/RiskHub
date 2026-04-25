# backend/app/services/_auth_session_workflow

## Purpose

Shared service-layer workflow for admin auth/session operations.

## Contents

- `__init__.py`
- `admin_sessions.py`

## Notes

Admin session endpoints should use this package for active-session projection, self-revoke protection, target-user locking, refresh-token revocation, token-version bumps, and activity logging.
