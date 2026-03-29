# frontend/src/services

## Purpose

Folder for `frontend/src/services` implementation assets.

## Contents

- `__tests__/`
- `accessApi.ts`
- `activityLogApi.ts`
- `adminApi.ts`
- `apiClient.ts`
- `approvalsApi.ts`
- `authApi.ts`
- `authConfig.ts`
- `controlApi.ts`
- `dashboardApi.ts`
- `departmentApi.ts`
- `directoryApi.ts`
- `entraAuth.ts`
- `executionApi.ts`
- `issuesApi.ts`
- `userDirectoryApi.ts`
- `...`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

- `userApi.ts` handles user lifecycle/detail helpers that remain Admin-only.
- `accessApi.ts` owns the active access-management role list contract (`/access/roles`) used by `/users` and user-onboarding flows.
- `userDirectoryApi.ts` owns the dedicated `/users/directory` collection contract for `/users` directory mode; it is distinct from `directoryApi.ts`, which covers external directory/Entra-style integration flows.
