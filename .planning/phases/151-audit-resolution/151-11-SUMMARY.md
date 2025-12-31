# Phase 151 Plan 11: Frontend Access + Scoped Users Summary

**Updated frontend for access_scope gating and scoped user visibility.**

## Accomplishments

- Extended `authApi` TokenResponse with `access_scope`, `scope_label`, `effective_permissions`
- Updated `AuthContext` User interface and `hasPermission` to use `effective_permissions`
- Updated `usePermissions` with `canManageAccess` derived from `access_scope === 'global'`
- Sidebar now shows "Access Management" based on `canManageAccess`
- Added `userApi.listVisibleUsers()` for scoped user lookup
- Updated `UsersPage` to use scoped lookup for non-admins (read-only view)
- Updated `KRIModal` and `KRIForm` reporting owner dropdowns to use scoped lookup
- Fixed backend `/users/lookup` endpoint import issue

## Files Created/Modified

- `frontend/src/services/authApi.ts` - Access scope fields
- `frontend/src/contexts/AuthContext.tsx` - User shape + effective_permissions
- `frontend/src/hooks/usePermissions.ts` - Access-scope gating
- `frontend/src/components/layout/Sidebar.tsx` - Access Management nav gating
- `frontend/src/services/userApi.ts` - Scoped user lookup method
- `frontend/src/pages/UsersPage.tsx` - Read-only scoped list for non-admins
- `frontend/src/components/kri/KRIModal.tsx` - Scoped reporting owner list
- `frontend/src/components/KRIForm.tsx` - Scoped reporting owner list
- `backend/app/api/v1/endpoints/users.py` - Import fix for UserLookup

## Decisions Made

- Non-admin users see read-only scoped user list on /users page
- Reporting owner dropdowns use scoped lookup, not admin-only user list

## Issues Encountered

- Backend `/users/lookup` endpoint initially failed due to forward reference in `response_model` — fixed by moving import to top of file

## Next Step

Phase 151 audit resolution complete
