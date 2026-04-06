# backend/app/services/outbox/handlers

## Purpose

Typed outbox event handlers grouped by notification domain.

## Contents

- `__init__.py`
- `approvals.py`
- `common.py`
- `issues.py`
- `questionnaires.py`

## Notes

- Domain handler modules are registered through the outbox registry; do not move handler selection logic back into one large dispatcher file.
- Shared payload/notification helpers belong in `common.py` only when they are genuinely cross-domain.
