# ADR-006 Snapshot Equivalence-Class Testing Policy

## Status

Accepted

## Context

Large architecture refactors such as listing planner deepening and audit adapter extraction need broad behavior protection without overfitting every row in every table.

## Decision

Use snapshot tests over equivalence classes before behavior-preserving refactors. Snapshots must redact unstable fields such as IDs, timestamps, trace IDs, and generated UUIDs. A snapshot rebaseline requires an explicit note naming the behavior change or ADR that justifies it.

## Alternatives Rejected

- No snapshots: rejected because refactors can silently change filtering, grouping, or audit shape.
- Full exhaustive snapshots: rejected because they become brittle and expensive.
- Rebaseline freely: rejected because snapshots lose value if changed without justification.

## Migration Impact

W0 adds snapshot tooling and redaction. Listing and audit refactors must capture snapshots before implementation.

## Rollback Strategy

If a snapshot diff is unexpected, rollback the refactor checkpoint or split the intended behavior change into a separate TDD bugfix.

## Invariant Tests

- Snapshot fixture redacts unstable fields.
- Listing equivalence snapshots cover search, filters, strict department scope, grouping, sorting, pagination, archive state, and capability envelopes.
- Audit snapshots cover entity/action/description/change-shape contracts.
