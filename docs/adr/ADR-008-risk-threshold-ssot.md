# ADR-008 Risk Threshold Single Source Of Truth

## Status

Accepted

## Context

Risk score thresholds appear in configuration, backend listing code, dashboard presentation, department tables, and frontend helper modules. Some frontend code uses `15` for critical while current defaults use `16`.

## Decision

Risk threshold evaluation must go through the configured threshold Interface. Backend code uses `get_config_int` with `ConfigDefaults`. Frontend code uses `useRiskThresholds()` and `riskScoreVariantClass()`. Literal threshold comparisons against risk scores are banned outside canonical helpers and tests.

## Alternatives Rejected

- Fix only the wrong `15` values: rejected because matching literals drift as soon as configuration changes.
- Frontend-only fix: rejected because backend highlighted counts also use literals.
- Hardcode current defaults in one constants file: rejected because CRO-managed config is authoritative.

## Migration Impact

Dashboard, listing, and risk page filter code must use canonical helpers. Tests use non-default thresholds to prove configuration is respected.

## Rollback Strategy

Rollback the threshold checkpoint if non-default threshold tests reveal an incompatible endpoint contract. Defaults and config keys remain unchanged.

## Invariant Tests

- Lint rule bans `>= 5`, `>= 10`, `>= 15`, and `>= 16` comparisons against risk score fields outside allowlisted helpers.
- Frontend tests render non-default thresholds.
- Backend listing tests set non-default critical threshold and assert highlighted counts.
