# backend/app/services/outbox

## Purpose

Transactional outbox package split out of the legacy `outbox_service.py` facade.

## Contents

- `store.py`
  - Claiming, enqueue, retry, dead-letter, and completion state transitions.
- `dispatcher.py`
  - Batch dispatcher and isolated handler execution loop.
- `handlers/`
  - Per-domain outbox handlers.
- `payloads.py`
  - Typed payload models and validation registry.

## Notes

- Keep `backend/app/services/outbox_service.py` as the import-compatibility facade.
- Persistence/claim logic and handler execution must stay separated.
