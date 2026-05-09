# ADR-007 Bounded Context Taxonomy

## Status

Accepted

## Context

RiskHub architecture work touches many workflow packages. Broad sweeps across all services create merge risk and make rollback difficult.

## Decision

Architecture sweeps use seven bounded contexts: `_riskhub_config`, `_identity_access_lifecycle`, `_vendor_governance`, `_register_listings`, `_approval_execution`, `_entity_mutation_lifecycle`, and `_kri_history`. Each context owns its exception, transaction, listing, and audit cleanup for its files before the next context begins.

## Alternatives Rejected

- Sweep by technical layer: rejected because service workflows cross layers and would split one behavior across many checkpoints.
- One full-repo sweep: rejected because rollback and review risk are too high.
- Per-file cleanup: rejected because it misses workflow-level ordering and atomicity.

## Migration Impact

Each context adds its own characterization tests, exception ban, transaction atomicity test, and invariant lock. Context order should follow the execution plan unless a dependency forces a change.

## Rollback Strategy

Rollback by bounded-context checkpoint. Contexts should avoid cross-context edits except documented adapters.

## Invariant Tests

- Per-context `HTTPException` ban once migrated.
- Per-context transaction atomicity tests.
- File-disjointness check before starting the next context.
