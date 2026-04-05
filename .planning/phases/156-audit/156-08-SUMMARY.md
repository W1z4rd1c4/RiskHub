# 156-08 Summary: JWT Storage & Timezone Decisions

## Status

**Closed later (2026-04-05)** — this checkpoint was originally deferred, then superseded by later auth/session and timezone hardening work.

## Resolved Decisions

### 1. Browser Auth Storage Strategy

- Access tokens are now kept in memory only on the frontend.
- Session continuity uses backend-issued refresh/csrf cookies plus bootstrap refresh exchange.
- Session mutations are centralized under the session-manager layer instead of ad hoc token/localStorage writes.
- This closed the immediate “browser token storage” risk without changing the public auth endpoints.

### 2. Timezone Consistency Strategy

- The repository standard is now timezone-aware UTC persistence for instant timestamps.
- Canonical helpers, migrations, and regression tests enforce the UTC-aware policy.
- The deferred “timezone decision” is therefore no longer pending in active code.

## Next Steps

- Future Entra/BFF evolution can still happen as a separate architecture step, but the original deferred audit item is no longer blocking.
- Keep the current session/bootstrap and UTC-aware contracts aligned with docs/tests during future auth or infra changes.

## Commit

No historical commit for this summary file itself; the later closure landed as part of the 2026-04-05 remediation wave.
