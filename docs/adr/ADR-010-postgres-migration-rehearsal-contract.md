# ADR-010 Postgres Migration Rehearsal Contract

## Status

Accepted

## Context

The archive-state cutover and `approval_scenarios.approver_roles` JSONB conversion are data-shape migrations. They are intentionally forward-only in production because recreating legacy archive status aliases or text-encoded JSON after application rollout would be ambiguous.

## Decision

Before applying these migrations to production-like data, rehearse them on a refreshed staging clone. Capture row-count targets for archived risks, archived controls, and inactive vendors before the run. During the run, monitor locks and statement duration. Rollback is snapshot restore only.

## Alternatives Rejected

- Add reversible downgrades: rejected because the legacy status values do not preserve the pre-archive lifecycle state.
- Keep `approver_roles` as text: rejected because the model and service layer now own a typed list contract.
- Use an application boot-time repair: rejected because data-shape migrations should be auditable in Alembic.

## Migration Impact

- `risks.status='archived'` rows become `status='active'` with `is_archived=true`.
- `controls.status='archived'` rows become `status='active'` with `is_archived=true`.
- `vendors.status='inactive'` rows become `status='active'` with `is_archived=true`.
- `approval_scenarios.approver_roles` converts from JSON text to JSON/JSONB.

## Rollback Strategy

Production rollback is restoring the pre-upgrade database snapshot. Alembic `downgrade()` for these revisions raises `NotImplementedError` and points here.

## Invariant Tests

- Alembic head applies cleanly on a disposable Postgres database.
- Archive-state row counts after backfill match the preflight targets.
- The `set_approval_scenario_roles` helper assigns a list and does not JSON-string encode.
- Lock monitoring is attached to the staging rehearsal record.
