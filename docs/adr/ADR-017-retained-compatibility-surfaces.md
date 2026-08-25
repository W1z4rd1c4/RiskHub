# ADR-017 Retained Compatibility Surfaces

## Status

Accepted

## Context

The 2026-05-09 architecture cleanup audit proposed deleting two apparently
shallow modules. Subsequent verification showed that both modules are current,
load-bearing compatibility surfaces. Keeping those decisions only in a dated
audit record made historical evidence the authority for present architecture.

The audit provenance and removed planning-artifact identities remain recorded
under `docs/audits/`; this ADR owns the accepted architecture decisions.

## Decision

### Decision #10 — retain the Risk Hub questionnaire endpoint module

`backend/app/api/v1/endpoints/riskhub_questionnaires.py` remains the mounted
endpoint module for the batch-send route used by the Risk Hub questionnaire
workflow. It must continue to export its router and preserve the frontend call
chain documented in `docs/agent/ENDPOINT_INVARIANTS.md`.

The invariant is enforced by
`tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py`.

### Decision #57 — retain the quarterly comparison compatibility facade

`backend/app/services/quarterly_comparison_service.py` remains the stable public
facade over `app.services._quarterly_comparison`. Existing callers may rely on
the public module while implementation remains in the internal package.

The re-export invariant is enforced by
`tests/backend/pytest/architecture/test_quarterly_comparison_facade_present_red.py`
and the facade's explicit `Audit #57` annotation.

## Alternatives Rejected

- Delete either module because it appears shallow: rejected because each has a
  verified current consumer or compatibility contract.
- Keep the decisions only in a dated audit: rejected because audits preserve
  point-in-time evidence and do not own accepted architecture.

## Migration Impact

None. This ADR records existing architecture and changes no runtime behavior,
API, schema, route, or import contract.

## Rollback Strategy

Supersede this ADR only after current consumers have migrated and the matching
invariant test and documentation have been updated in the same change.

## Invariant Tests

- The Risk Hub questionnaire endpoint module exists, exports its live router,
  and remains documented with its frontend call chain.
- The quarterly comparison facade re-exports the canonical package interface.
- Both invariant tests cite this ADR as the accepted decision source.
