# frontend/src/pages/login

## Purpose

Login-route support components and hooks extracted from `LoginPage.tsx`.

## Contents

- `DemoLoginView.tsx`
  - Demo/hybrid login surface.
- `SsoOnlyView.tsx`
  - Production SSO-only login surface.
- `LoginStateViews.tsx`
  - Loading/unavailable/not-configured states.
- `useAuthConfigLoader.ts`
  - Auth-config loading and retry hook.
- `useLoginActions.ts`
  - Demo login and SSO-start action hook.
- `useProdLoginMetadata.ts`
  - Production document-title/lang updates.

## Notes

- Keep `LoginPage.tsx` focused on URL parsing and top-level branching.
- `sanitizeReturnTo` stays in `frontend/src/services/authRedirect.ts`.

- `LoginPage` owns completed demo/native session redirects. Its existing-session
  redirect never overwrites the destination in an explicit login response.
- Public auth routes sit outside the principal query boundary so signing in does
  not remount login/callback code during the transition; protected data retains
  the principal boundary and is cleared when leaving that scope.
