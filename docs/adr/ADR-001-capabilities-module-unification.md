# ADR-001 Capabilities Module Unification

## Status

Accepted

## Context

RiskHub has backend capability builders, service-level permission checks, endpoint dependencies, and frontend route predicates. These are currently spread across public and private import paths, with `vendor_capabilities` outside the capabilities Module and the frontend still deriving some route gates from role strings.

## Decision

Create one public Capabilities Module Interface. Backend callers use `Capabilities.can(action, resource, *, instance=None)` for service-level decisions, while endpoints may keep FastAPI dependency helpers as adapters. Per-resource builders become private implementation details. Frontend route gates consume backend-authoritative `GET /api/v1/me/capabilities`; role-string logic remains only as a temporary compatibility fallback.

## Alternatives Rejected

- Keep the status quo: rejected because capability semantics remain split across multiple shallow Modules.
- Move only `vendor_capabilities`: rejected because it fixes one outlier while leaving route-level inference drift intact.
- Remove endpoint dependencies immediately: rejected because FastAPI dependencies are still useful endpoint adapters and can stay as a separate Interface.

## Migration Impact

The stable public import path is `app.services.authorization_capabilities`. The private `_authorization_capabilities` package remains the implementation home. In-repo endpoint and service callers must use the public facade when the requested symbol is exported there; private imports are reserved for forced bypasses whose symbols are intentionally not on the facade, such as riskhub config helpers, admin-only builders, and shared internal query helpers. Frontend schema validation must be generated or checked from the authorization capability contract.

## Rollback Strategy

Keep the rename in one local checkpoint. If validation fails, revert the capability rename checkpoint and restore the previous facade imports. If external consumers are found later, add a deprecation alias before retrying.

## Invariant Tests

- Route capability snapshot: `(method, path) -> required_capability` must not silently weaken.
- No direct private capability imports outside the Module internals when the imported symbol exists on `app.services.authorization_capabilities`.
- `validate_authz_capability_contract.py` verifies backend builder, Pydantic schema, frontend schema, and docs alignment.
- Frontend route gates use `useAuthz().can(...)` rather than role-string booleans.
