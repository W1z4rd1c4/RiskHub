# backend/app/services/outbox

## Purpose

Transactional outbox package split by responsibility.

## Contents

- `store.py`
  - Claiming, enqueue, retry, dead-letter, and completion state transitions.
- `dispatcher.py`
  - Batch dispatcher with typed fatal vs retryable handler failure policy and `SchedulerJobRun` visibility for each dispatch run.
- `registry.py`
  - Central event-type to handler mapping.
- `handlers/`
  - Per-domain outbox handlers (`approvals.py`, `issues.py`, `questionnaires.py`) plus shared helper utilities.
- `payloads.py`
  - Typed payload models and validation registry.

## Notes

- Persistence/claim logic and handler execution must stay separated.
- Non-Postgres runtimes are treated as single-worker only for outbox dispatch; multi-worker scheduler/outbox execution must use PostgreSQL.
