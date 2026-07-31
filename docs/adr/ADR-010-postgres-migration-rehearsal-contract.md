# ADR-010 Postgres Migration Rehearsal Contract

## Status

Accepted

## Context

The archive-state cutover and `approval_scenarios.approver_roles` JSONB conversion are data-shape migrations. They are intentionally forward-only in production because recreating legacy archive status aliases or text-encoded JSON after application rollout would be ambiguous.

## Decision

Before applying these migrations to production-like data, rehearse them on a refreshed staging clone. Capture row-count targets for archived risks, archived controls, vendors, and vendor link tables before the run. During the run, monitor locks and statement duration. Rollback is snapshot restore only.

## Alternatives Rejected

- Add reversible downgrades: rejected because the legacy status values do not preserve the pre-archive lifecycle state.
- Keep `approver_roles` as text: rejected because the model and service layer now own a typed list contract.
- Use an application boot-time repair: rejected because data-shape migrations should be auditable in Alembic.

## Migration Impact

- `risks.status='archived'` rows become `status='active'` with `is_archived=true`.
- `controls.status='archived'` rows become `status='active'` with `is_archived=true`.
- `vendors.status='inactive'` rows become `status='active'` with `is_archived=true`.
- `approval_scenarios.approver_roles` converts from JSON text to JSON/JSONB.
- Revision `k6l7m8n9o0p1` drops `vendors.status` after the single-value enum cutover and rebuilds all vendor link FKs with `ON DELETE CASCADE`; `vendor_kri_links` already had cascade semantics and is recreated for canonical constraint names. Pre-upgrade rehearsal captures row counts for `vendors`, `vendor_risk_links`, `vendor_control_links`, and `vendor_kri_links` and reconciles them after upgrade.
- Revision `n4o5p6q7r8s9` adds the `CREATE` label to PostgreSQL enum
  `approval_action_type`, makes `approval_requests.resource_id` and
  `governed_mutation_proposals.primary_resource_id` nullable, and immediately
  constrains those nulls with
  `ck_approval_requests_process_create_resource_identity` and
  `ck_governed_mutation_process_create_resource_identity`. Only a
  `PROCESS`/`CREATE` approval paired with a `process`/`process.create` proposal
  may be rowless; every existing-row and legacy identity remains non-null by
  database constraint.
- Revision `o5p6q7r8s9t0` adds governed Asset mutation support: the `ASSET`
  approval resource label, `assets.governance_version`, Asset-compatible
  proposal identity constraints, and the fixed `protected_asset_edit` scenario.

### Governed Process extension rehearsal evidence

`n4o5p6q7r8s9` is rehearsed in two independent disposable PostgreSQL databases:

1. **Zero to head:** start from an empty database and run
   `cd backend && DATABASE_URL="$ZERO_TO_HEAD_DATABASE_URL" ./venv/bin/alembic upgrade head`.
2. **Previous head to head:** restore a representative clone whose recorded
   current revision is `m3n4o5p6q7r8`, then run
   `cd backend && DATABASE_URL="$PREVIOUS_HEAD_DATABASE_URL" ./venv/bin/alembic upgrade head`.

For each lane, the release record captures the database/snapshot identity, the
full Alembic log, before/after `./venv/bin/alembic current` output, lock waits
and statement duration, and catalog evidence that:

- `approval_action_type` contains `CREATE` exactly once;
- both identity columns have the intended physical nullability;
- both named check constraints exist and validate;
- queries for rows violating either check return zero; and
- the final revision is `n4o5p6q7r8s9 (head)`.

The previous-head lane also records pre/post counts for approval requests,
governed proposals, and active impact locks. A failed or incomplete lane blocks
release; it is not replaced by a downgrade rehearsal because rollback remains
snapshot restore.

### Governed Asset extension rehearsal evidence

`o5p6q7r8s9t0` is exercised by the PostgreSQL-only automated rehearsal in
`tests/backend/pytest/migrations/test_governed_asset_migration_rehearsal.py`.
It creates disposable databases for both zero-to-head and recorded previous
head `n4o5p6q7r8s9`-to-head lanes, asserts the final repository revision is
`s8t9u0v1w2x3 (head)`, and drops each database after the run.

### Accountability and governed Threat extension rehearsal evidence

Revisions `r7s8t9u0v1w2` and `s8t9u0v1w2x3` are exercised together by the
PostgreSQL-only automated rehearsal in
`tests/backend/pytest/migrations/test_governed_threat_migration_rehearsal.py`.
It creates disposable databases for both zero-to-head and recorded previous
head `p6q7r8s9t0u1`-to-head lanes. The previous-head lane seeds a representative
Threat and an existing deployment-specific accountability scenario before
upgrading, then verifies that the row is preserved with `governance_version=1`
and the scenario is not overwritten. Both lanes verify the exact
`approval_resource_type` enum, including one `THREAT` label, the
`accountability_reassignment` scenario and its JSONB role array, and the final
single Alembic head `s8t9u0v1w2x3`.

## Rollback Strategy

Production rollback is restoring the pre-upgrade database snapshot. Alembic `downgrade()` for these revisions raises `NotImplementedError` and points here.

## Invariant Tests

- Alembic head applies cleanly on a disposable Postgres database.
- `n4o5p6q7r8s9` applies cleanly both zero-to-head and from recorded previous
  head `m3n4o5p6q7r8`, with the evidence listed above.
- `o5p6q7r8s9t0` applies cleanly both zero-to-head and from recorded previous
  head `n4o5p6q7r8s9` via the automated PostgreSQL rehearsal.
- `r7s8t9u0v1w2` and `s8t9u0v1w2x3` apply cleanly together both zero-to-head
  and from recorded previous head `p6q7r8s9t0u1` via the automated PostgreSQL
  rehearsal.
- Archive-state row counts after backfill match the preflight targets.
- The `set_approval_scenario_roles` helper assigns a list and does not JSON-string encode.
- Lock monitoring is attached to the staging rehearsal record.
