# frontend/src/authz

## Purpose

Folder for `frontend/src/authz` implementation assets.

## Contents

- `policy.ts`
- `useAuthz.ts`

## Notes

Keep this README updated when responsibilities or structure in this folder change. Authz invariant coverage also locks the required `access_user` capability surface; the Zod schema for `AccessUserRead.capabilities` is required in `frontend/src/services/api/schemas/entities/identity.ts` to avoid frontend-only fallback drift.
