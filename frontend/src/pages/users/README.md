# frontend/src/pages/users

## Purpose

Route-local modules for the `/users` page, including directory mode, access mode, lifecycle actions, stats, and break-glass enablement.

## Contents

- `BreakGlassEnableDialog.tsx`
- `UsersAccessStats.tsx`
- `UsersPageHeader.tsx`
- `useUserLifecycleActions.ts`
- `useUsersAuthMode.ts`
- `useUsersPageData.ts`
- `usersPageTypes.ts`

## Notes

Backend capability metadata is authoritative for lifecycle and break-glass actions. Keep `frontend/src/pages/UsersPage.tsx` as the route composition point.
