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
- Session storage and token mutation belong in `frontend/src/services/sessionManager.ts`.
