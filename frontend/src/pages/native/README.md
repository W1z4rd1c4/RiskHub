# Native account screens

The shared runtime auth configuration enables these routes. `NativeLoginView`
handles completed password login or a restricted challenge; only a final session
response reaches the existing session coordinator. `NativePublicPage` handles
invitation, reset and approved recovery links. `NativeSecurityPage` consumes the
backend's own-credential capability and requests recent proof for each change.

`NativeFrame` maps native error kinds and pending state onto the shared public frame
(`components/layout/AuthFrame`), which owns the landmark, heading focus, CS/EN switch
and theme scope: the OS colour scheme while signed out without a stored theme, the
user's app theme on authenticated routes such as `/auth/local/security`.

`NativeFactor` owns setup, verification and display-once backup codes.
`useNativeAction` cancels stale work on owner changes. `useFragmentCredential`
captures a link credential once and immediately removes it from navigation state.
Secrets remain in component memory; no query cache or browser persistence is used.
These public credential routes retain completion codes after their own sign-out;
protected application data remains inside the existing principal query boundary.

Contracts: [native credentials](../../../../docs/security/identity-local-credentials.md).
Verification: [testing guide](../../../../docs/TESTING.md),
`tests/frontend/unit/src/pages/__tests__/LoginPage.native.test.tsx`, and
`tests/frontend/e2e/native-account.spec.ts`. Production admission remains gated by #208.
