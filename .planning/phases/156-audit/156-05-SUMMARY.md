# 156-05 Summary: Frontend Permission Gating & Demo Login

## What Changed

### 1. Demo Login Redirect Fixed

**File:** `frontend/src/pages/LoginPage.tsx`

Changed demo login redirect from `/dashboard` to `/` since the app's root route IS the dashboard.

### 2. canRecordKRI Permission Tightened

**File:** `frontend/src/hooks/usePermissions.ts`

Removed permissive `risks:write` and `approvals:write` checks from `canRecordKRI`. Now only checks `kri:submit` permission.

Note: KRIDetailPage also allows reporting owners to record (checked in the component).

### 3. Tailwind Dynamic Classes (Already Fixed)

The LoginPage already uses static class mappings (lines 53-76), so no changes needed.

## Verification

```bash
cd frontend && npx vite build
# Result: ✓ built successfully
```

Note: `tsc -b` has a pre-existing internal TypeScript error unrelated to these changes.

## Commit

`fix(156-05): correct demo login redirect and restrict canRecordKRI permission`
