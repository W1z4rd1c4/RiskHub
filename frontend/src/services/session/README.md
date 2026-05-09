## Session Services

This package is the single frontend boundary for auth-session state and
session-specific side effects.

Use it for:
- storing and reading the current auth session
- bootstrap-time session hydration
- refresh and logout suppression hints
- refresh-only silent session recovery behavior

## File Map

- `types.ts` defines the session snapshot shape.
- `store.ts` owns the external-store snapshot and React subscription hook.
- `sessionStorage.ts` owns refresh-hint cookies and explicit-logout suppression.
- `coordinator.ts` owns authenticated/anonymous session transitions,
  bootstrap hydration, silent refresh, refresh cooldown, and test reset seams.
- `index.ts` is the public barrel.

`coordinator.ts` must keep `refreshInFlight`, `lastRefreshFailureAt`,
`REFRESH_FAILURE_COOLDOWN_MS`, and `bootstrapPromise` at module scope. The
single-flight and cooldown contract is pinned by
`tests/frontend/unit/src/services/session/__tests__/coordinator.singleFlight.test.ts`.

Keep transport concerns in `frontend/src/services/api/` and `authApi.ts`.
Keep React-specific orchestration in `frontend/src/contexts/auth/`.
