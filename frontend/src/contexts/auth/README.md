# frontend/src/contexts/auth

## Purpose

Focused auth-provider helpers used by `AuthContext.tsx`.

## Contents

- `permissions.ts`
  - Permission derivation helpers for the auth context.
- `useAuthActions.ts`
  - Login/logout orchestration and session-state transitions.
- `useAuthBootstrap.ts`
  - Bootstrap effect for restoring the current session.
- `usePreferenceHydration.ts`
  - Preference/theme/language hydration readiness handling.

## Notes

- Keep `AuthContext.tsx` as compatibility composition glue over
  `SessionContext.tsx`, `PreferencesContext.tsx`, and `AuthActionsContext.tsx`.
- The canonical client auth state lives in `frontend/src/services/session/store.ts`.
- `frontend/src/services/session/coordinator.ts` owns allowed session-state transitions, bootstrap restore behavior, silent refresh, and cooldown/single-flight state; do not reintroduce a second auth cache.
