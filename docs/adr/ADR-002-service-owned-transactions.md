# ADR-002 Service-Owned Transactions

## Status

Accepted

## Context

RiskHub currently mixes endpoint commits and service commits. Audit, outbox, approval, and KRI history paths need atomicity across domain mutation and side effects.

## Decision

Service entrypoints own transaction completion. Endpoints act as adapters that call services and serialize responses. Scheduler or worker entrypoints are also service entrypoints and may commit through their service API. Service-owned commits go through `commit_service_boundary(db, *, boundary)` in `backend/app/services/transaction_boundary.py`, which commits once, rolls back and logs `transaction_boundary` metadata on commit failure, and re-raises the original failure. Commit, deferred-flush, and secondary-rollback failures use the canonical structured logger and carry stable event, boundary, error type, and error-message fields; a secondary rollback failure never replaces the original transaction failure.

An explicitly scoped composite service may use `defer_service_boundary_commits(db)` to own one larger unit of work. Within that scope, nested `commit_service_boundary` calls flush instead of commit; a flush failure rolls back, logs the named nested boundary, and re-raises. The scope always restores normal commit behavior on exit. The composite owner must leave the scope before invoking its own named `commit_service_boundary`, and must roll back on every unsuccessful outcome, including cancellation and reported validation findings. The manifest-pinned offline ICT Register importer is the initial adopter: all import phases share one transaction and only `ict_register_cutover_import` commits it.

The ICT Register composite transaction also owns its explicitly authorized
cutover-policy window. After manifest and accountability-map preflight, the
importer resolves and locks the independent authorizer and the three fixed
protected-scenario rows, then loads and classifies the target before any
mutation. It records authorization, temporarily suspends only those scenarios,
performs the service-layer import, restores the complete scenario snapshots,
and records restoration plus an immutable full-state completion digest before
the outer commit. The same transaction resolves and applies the explicit digest-pinned
synthetic Process-and-Asset accountability map through stable User/Department
identities. It supplies the Process Owner plus Asset Business Owner, ICT Owner,
and Owning Department relationships required by the normal service layer. Its
digest is attached to the window audits and bound into the completion marker,
so an exact re-run cannot substitute a different map. None of the temporary
policy state is committed or visible to another
PostgreSQL transaction. A finding or raised failure rolls back the import,
policy changes, and their audit rows together.

Outbox transaction ownership is consolidated in `backend/app/services/outbox/dispatcher.py`: the dispatcher owns the worker transaction scopes and `backend/app/services/outbox/store.py` flushes only. Endpoint commit sites have ratcheted to zero in `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`. Remaining service-side raw commits are explicitly tracked in `tests/backend/pytest/architecture/_service_commit_boundary_allowlist.toml` and must move to `commit_service_boundary` with local behavior coverage before removal from that allowlist.

## Alternatives Rejected

- Endpoints commit, services flush: rejected because business workflows span multiple service Modules and callers can forget side-effect ordering.
- Status quo: rejected because double-commit and partial-side-effect bugs have already appeared.
- Implicit unit-of-work middleware: rejected because background jobs and worker flows do not naturally share the HTTP middleware lifecycle.

## Migration Impact

Each bounded context migrates independently. Tests must prove rollback behavior before service commit ownership changes. Endpoint commit calls are no longer allowlisted. Service raw commits are capped by the service commit boundary ratchet and each allowlisted entry carries a rationale for later migration.

## Rollback Strategy

Rollback by bounded-context checkpoint. Service entrypoints should retain narrow transaction scopes so reverting one context does not require reverting unrelated contexts.

## Invariant Tests

- Static ratchet for `await db.commit()` in endpoint adapters; the endpoint allowlist is empty.
- Static ratchet for service-side raw commits through `_service_commit_boundary_allowlist.toml`.
- Static lock that `backend/app/services/outbox/store.py` contains no direct commit calls.
- Per-context transaction atomicity tests for mutation plus audit/outbox side effects.
- Failure injection tests assert no orphan rows after rollback.
- Composite-boundary tests assert nested flush-only behavior, scope restoration, one outer commit, and whole-run rollback for exceptions, cancellation, and reported findings.

## Endpoint Commit Allowlist

The endpoint commit allowlist is empty. Auth/session commit wrappers now delegate to `commit_service_boundary` through `backend/app/services/_auth_session_workflow/transactions.py`; new endpoint commit exemptions require a superseding ADR and a failing architecture test update.

## Outbox Dispatcher Consolidation

The v5.3 plan named a separate `outbox/dispatcher_runtime.py` for transaction ownership; this was consolidated into `backend/app/services/outbox/dispatcher.py:24-25,37-38` which uses `async with sessionmaker()` + `async with session.begin():` per claimed event. The `outbox/store.py` mutation primitives (`claim_batch`, `mark_succeeded`, `mark_dead_letter`, `mark_retry`) are flush-only; the dispatcher owns the transaction boundary. The architecture lock at `architecture/test_w4b_outbox_no_commit_in_store_red.py` enforces the no-commit-in-store invariant.

## Handler Idempotency

Every outbox event must be enqueued with a stable `idempotency_key`; `OutboxService.enqueue` accepts this as a non-optional string and call sites are guarded by an architecture lock. Stable means stable for the created business event, not collapsed across separate repeated transitions: issue assignment A to B to A creates two distinct `issue.assigned` business events for owner A, so the key includes an assignment operation component captured once at the service boundary. Handlers must also be idempotent because dispatcher retries, worker restarts, and duplicate delivery attempts can replay the same business event after the enqueue transaction has committed.

Handler idempotency should be anchored on the event payload identity, not on process-local state. Before creating follow-on rows, sending notifications, or writing external effects, handlers must check whether the effect for the event identity has already been applied or use a downstream idempotency key that makes duplicate execution harmless. A handler that cannot satisfy this requirement must document the compensating control before it is registered in `backend/app/services/outbox/registry.py`.
