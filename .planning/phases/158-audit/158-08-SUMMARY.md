---
phase: 158-audit
plan: "08"
status: complete
---

# 158-08 Summary: Read-Only User Directory Mode

## Objective

Remove UsersPage "fake data" fallback and provide an explicit read-only user directory view for non-privileged users.

## What Was Built

### UI Modes

| Mode | Who Sees It | Endpoint Used | Features |
|------|-------------|---------------|----------|
| **Access Management** | Privileged users (CRO, Admin) | `/api/v1/access/users` | Full permissions matrix, toggle status, edit access |
| **Department Access** | Department Heads | `/api/v1/access/users/department` | Scoped permissions view, edit access within dept |
| **Read-Only Directory** | Non-privileged users | `/api/v1/users/lookup` | View-only user list, no admin actions |

### Changes Made

1. **New Type: `UserLookup`** (`frontend/src/types/user.ts`)
   - Clean type matching the `/users/lookup` API response
   - No fabricated fields (timestamps, access_scope)

2. **UsersPage.tsx**
   - Renamed `fallbackUsers` → `directoryUsers`
   - Stores `UserLookup[]` directly without transformation
   - Removed `as any[]` casting
   - Toggle handler only accepts `AccessUserRead` (not available in read-only mode)

3. **UsersTable.tsx**
   - Renamed `fallbackUsers` → `directoryUsers`
   - Directory mode shows:
     - Real data: name, email, role_name, department_name
     - Static "Active" badge (lookup only returns active users)
     - "View only" indicator in actions column
   - No admin-only actions exposed in directory mode

4. **useUsersPageFilters.ts**
   - Updated to accept `directoryUsers: UserLookup[]`
   - Simpler filtering for directory mode (no scope/permissions filters)

## What's Not Shown in Read-Only Mode

- Created/Updated timestamps (not returned by lookup API)
- Access scope (not applicable to non-privileged view)
- Toggle status buttons (would 403)
- Edit access modal (would 403)

## Verification

- [x] `npx vite build` succeeds
- [ ] Manual verification for 3 roles (checkpoint - requires human testing)
