# ADR-002 Service-Owned Transactions

## Status

Accepted

## Context

RiskHub currently mixes endpoint commits and service commits. Audit, outbox, approval, and KRI history paths need atomicity across domain mutation and side effects.

## Decision

Service entrypoints own transaction completion. Endpoints act as adapters that call services and serialize responses. Scheduler or worker entrypoints are also service entrypoints and may commit through their service API. During migration, endpoint commit sites are tracked by an allowlist that ratchets to zero.

Outbox transaction ownership is consolidated in `backend/app/services/outbox/dispatcher.py`: the dispatcher owns the worker transaction scopes and `backend/app/services/outbox/store.py` flushes only. Temporary auth endpoint commits are tracked in `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` with rationale and expiration metadata.

## Alternatives Rejected

- Endpoints commit, services flush: rejected because business workflows span multiple service Modules and callers can forget side-effect ordering.
- Status quo: rejected because double-commit and partial-side-effect bugs have already appeared.
- Implicit unit-of-work middleware: rejected because background jobs and worker flows do not naturally share the HTTP middleware lifecycle.

## Migration Impact

Each bounded context migrates independently. Tests must prove rollback behavior before service commit ownership changes. Endpoint commit calls remain only in a temporary allowlist during migration.

## Rollback Strategy

Rollback by bounded-context checkpoint. Service entrypoints should retain narrow transaction scopes so reverting one context does not require reverting unrelated contexts.

## Invariant Tests

- Static ratchet for `await db.commit()` in endpoint adapters, including the auth allowlist expiration check.
- Static lock that `backend/app/services/outbox/store.py` contains no direct commit calls.
- Per-context transaction atomicity tests for mutation plus audit/outbox side effects.
- Failure injection tests assert no orphan rows after rollback.

## Hard Expiration on Auth-Flow Exemption

Auth-flow exemptions in `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` carry `expires_at = 2026-09-01`; the architecture lock at `architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` will fail after that date until each entry is re-justified or the underlying commit is migrated to a service-owned transaction.

## Outbox Dispatcher Consolidation

The v5.3 plan named a separate `outbox/dispatcher_runtime.py` for transaction ownership; this was consolidated into `backend/app/services/outbox/dispatcher.py:24-25,37-38` which uses `async with sessionmaker()` + `async with session.begin():` per claimed event. The `outbox/store.py` mutation primitives (`claim_batch`, `mark_succeeded`, `mark_dead_letter`, `mark_retry`) are flush-only; the dispatcher owns the transaction boundary. The architecture lock at `architecture/test_w4b_outbox_no_commit_in_store_red.py` enforces the no-commit-in-store invariant.

## Handler Idempotency

Every outbox event must be enqueued with a stable `idempotency_key`; `OutboxService.enqueue` accepts this as a non-optional string and call sites are guarded by an architecture lock. Stable means stable for the created business event, not collapsed across separate repeated transitions: issue assignment A to B to A creates two distinct `issue.assigned` business events for owner A, so the key includes an assignment operation component captured once at the service boundary. Handlers must also be idempotent because dispatcher retries, worker restarts, and duplicate delivery attempts can replay the same business event after the enqueue transaction has committed.

Handler idempotency should be anchored on the event payload identity, not on process-local state. Before creating follow-on rows, sending notifications, or writing external effects, handlers must check whether the effect for the event identity has already been applied or use a downstream idempotency key that makes duplicate execution harmless. A handler that cannot satisfy this requirement must document the compensating control before it is registered in `backend/app/services/outbox/registry.py`.
