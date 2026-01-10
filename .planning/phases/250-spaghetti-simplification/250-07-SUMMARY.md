# Summary: 250-07 Simplify UsersPage Filters and Table

## Changes Made

### Files Created
- **`frontend/src/hooks/useUsersPageFilters.ts`** (~106 lines)
  - Extracted filter state: `searchTerm`, `roleFilter`, `scopeFilter`, `permResourceFilter`, `permActionFilter`
  - Exported `hasPermission` helper function for permission matching
  - Exported `permissionResources` and `permissionActions` constants
  - `useMemo` for filtered lists (`filteredAccessUsers`, `filteredFallbackUsers`)
  - `resetPermissionFilters()` helper

- **`frontend/src/components/access/UsersFilterBar.tsx`** (~128 lines)
  - Extracted search + filter bar UI
  - Uses `ThemedSelect` for dropdowns
  - Handles access mode vs fallback mode conditionally

- **`frontend/src/components/access/UsersTable.tsx`** (~274 lines)
  - Extracted table rendering with access mode and fallback mode support
  - **Fixed React key warnings**: uses `<React.Fragment key={user.id}>` for `(main row + expanded row)` pairs
  - Contains expanded row rendering for Admin, CRO, and regular users

### Files Modified
- **`frontend/src/pages/UsersPage.tsx`** (671 → ~237 lines)
  - Reduced by ~65% in size
  - Now orchestrates: data fetching, modal state, stats, and component rendering
  - Filter logic delegated to `useUsersPageFilters` hook
  - Filter UI delegated to `UsersFilterBar`
  - Table rendering delegated to `UsersTable`

## Verification
- ✅ `npm run build` passes

## Notes
- `scopeColors` constant duplicated in UsersTable (kept local – only used there)
- `hasPermission` exported from hook as it's testable utility
