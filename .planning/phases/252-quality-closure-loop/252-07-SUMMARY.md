# Plan 252-07 Summary: Service Facade Cleanup

## Completed

- Split `frontend/src/services/apiClient.ts` into an import-stable facade over `frontend/src/services/api/`.
- Added typed internal API client modules:
  - `ApiClientCore.ts`
  - `apiConfig.ts`
  - `apiErrors.ts`
  - `apiRequestBuilder.ts`
  - `apiTypes.ts`
- Split `frontend/src/services/adminApi.ts` into an import-stable facade over `frontend/src/services/admin/`.
- Added bounded admin internals:
  - `adminRequests.ts`
  - `adminTypes.ts`
- Preserved current service behavior:
  - `401` retry handling
  - blob-download support
  - UI message-key mapping
  - existing admin API surface consumed by the admin console and user-management paths
- Added focused service-unit regression coverage for request building and error-path handling.

## Verification

- `cd frontend && npm run test:run -- src/services/__tests__/apiClient.401-recovery.test.ts src/services/__tests__/apiClient.errors.test.ts src/services/__tests__/apiClient.requestBuilder.test.ts src/pages/admin-console/__tests__/AdminConsoleOpsPanels.outbox.test.tsx src/pages/__tests__/UsersPage.sso-cta.test.tsx` -> `5 files passed`, `12 tests passed`
- `cd frontend && npm run lint && npx tsc --noEmit` -> passed

## Notes

- This wave intentionally did not redesign the broader auth/session authority stack; it only decomposed the service implementation behind stable imports.
