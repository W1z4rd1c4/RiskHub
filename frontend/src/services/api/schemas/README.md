# frontend/src/services/api/schemas

## Purpose

Runtime response-validation schemas for the public `@/services/apiClient` and auth transport boundary.

## Notes

- Keep schemas aligned with the existing DTO type exports; response parsing should validate transport payloads without changing the app-level type surface.
- Prefer grouped domain modules plus `.passthrough()` object schemas so additive backend fields do not become breaking changes by default.
- Keep entity capability schemas literal-flat. `scripts/security/authz_contract_validator/capability_catalog.py:112-126` extracts Zod capability fields by matching the braces inside `passthroughObject({ ... })`; it does not follow `.merge()` or `.extend()` chains. `crudCapabilitySchema.ts` is a shared type/test contract, not a runtime composition base for entity schemas.
