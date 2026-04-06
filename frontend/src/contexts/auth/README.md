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

- Keep `AuthContext.tsx` as composition glue.
- The canonical client auth state lives in `frontend/src/services/sessionStore.ts`.
- `sessionManager.ts` owns the allowed session-state transitions over that canonical snapshot.
- `accessTokenStore.ts` and `bootstrapSessionCache.ts` are temporary compatibility adapters and must not become independent auth sources again.
