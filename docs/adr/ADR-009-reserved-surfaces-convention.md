# ADR-009 Reserved Surfaces Convention

## Status

Accepted

## Context

Some roles, permissions, activity entities, and endpoint packages are intentionally reserved for future modules. Without an explicit convention, audits repeatedly classify them as accidental drift.

## Decision

Reserved surfaces must be declared in `_reserved_modules.toml`, documented in `docs/BUSINESS_LOGIC.md`, and annotated at the code declaration site. Reserved entries are allowed to be seeded or declared without runtime implementation only when all three records agree.

## Alternatives Rejected

- Prune every unused surface: rejected because some entries preserve future compatibility and planning intent.
- Implement every reserved surface immediately: rejected because that expands scope beyond current product priorities.
- Leave comments only: rejected because comments are not machine-checkable.

## Migration Impact

Vendor extended activity entities, `CONTROL_OWNER`, `vendor_contracts:*`, and `controls:approve` are recorded as reserved. Contract tests enforce parity between code, docs, and registry.

## Rollback Strategy

Remove the reserved registry entry only when the surface is implemented or deliberately pruned through a migration and docs update.

## Invariant Tests

- Reserved enum, role, and permission entries must appear in `_reserved_modules.toml`.
- Docs must mark reserved entries consistently.
- Unreserved unused entries fail the contract test.
