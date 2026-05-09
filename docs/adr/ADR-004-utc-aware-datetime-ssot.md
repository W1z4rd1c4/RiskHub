# ADR-004 UTC-Aware Datetime Single Source Of Truth

## Status

Accepted

## Context

RiskHub policy is UTC-aware timestamps everywhere. Runtime helpers exist, but schema boundaries still contain bare `datetime` annotations in multiple files.

## Decision

Use `UtcAwareDatetime` as the schema-boundary type for every instant-like Pydantic datetime field. Runtime code continues to use `utc_now()` for new timestamps and `coerce_utc()` when normalizing already-parsed values. `datetime.utcnow()` remains banned outside explicit reviewed exceptions.

## Alternatives Rejected

- Keep bare schema `datetime`: rejected because request and response boundaries can silently accept inconsistent timezone values.
- Use ad hoc validators per schema: rejected because it duplicates timezone policy.
- Convert only request fields: rejected because response-only schemas still document and serialize the public contract.

## Migration Impact

All bare schema datetime annotations migrate to `UtcAwareDatetime`. OpenAPI output must be sanity-checked because serialized examples may change formatting.

## Rollback Strategy

Rollback the schema migration checkpoint if OpenAPI or serialization compatibility breaks. Runtime helpers remain unchanged.

## Invariant Tests

- No bare `datetime` imports or annotations in `backend/app/schemas`.
- Behavior table for naive datetime, aware non-UTC datetime, ISO `Z`, ISO offset, invalid string, and `None`.
- Existing timezone policy and `datetime.utcnow()` ban tests stay green.
