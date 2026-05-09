# frontend/src/authz

## Purpose

Folder for `frontend/src/authz` implementation assets.

## Contents

- `BusinessRouteGuards.tsx`
- `policy.ts`
- `useAuthz.ts`

## Notes

Keep this README updated when responsibilities or structure in this folder change. Authz invariant coverage also locks the required `access_user` capability surface; the Zod schema for `AccessUserRead.capabilities` is required in `frontend/src/services/api/schemas/entities/identity.ts` to avoid frontend-only fallback drift.

`BusinessRouteGuards.tsx` exports `createBusinessRouteGuard`, a typed factory whose key parameter is restricted to boolean fields on `Authz` via the local `BoolKeys` type. The named route guards should stay as `export const` bindings to that factory so route semantics remain centralized.
