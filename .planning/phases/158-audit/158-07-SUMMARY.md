---
phase: 158-audit
plan: "07"
status: complete
date: 2026-01-18
---

# 158-07 Summary: Fix Report Downloads + API URL Conventions

## Objective

Fix report downloads when `VITE_API_URL` is unset and align frontend API base URL conventions.

## What Was Built

### Root Cause

`reportApi.ts` used direct `fetch()` with:

```ts
fetch(`${import.meta.env.VITE_API_URL}${url}`, ...)
```

When `VITE_API_URL` is unset, this creates `undefined/reports/...` URLs that fail.

### Solution

**`frontend/src/services/apiClient.ts`** - Added `getBlob()` method:

```ts
async getBlob(endpoint: string, options?: RequestOptions): Promise<{ blob: Blob; headers: Headers }>
```

This method:

- Uses the same base URL logic as `request()` (handles relative paths with `window.location.origin`)
- Includes the same auth header behavior
- Returns blob + headers for filename extraction

**`frontend/src/services/reportApi.ts`** - Refactored to use `apiClient.getBlob()`:

```ts
const { blob, headers } = await apiClient.getBlob(url);
```

### Before vs After

| Before | After |
|--------|-------|
| Direct fetch with `VITE_API_URL` | Uses `apiClient.getBlob()` |
| `undefined/reports/...` when unset | Falls back to `/api/v1/reports/...` |
| Separate auth header setup | Reuses apiClient auth logic |

### Verification

- Vite build successful
- Works with and without `VITE_API_URL` set

## Commits

- `fix(158-07): use apiClient.getBlob for report downloads to prevent undefined URL bug`

## Files Changed

- `frontend/src/services/apiClient.ts` (MODIFIED - added getBlob)
- `frontend/src/services/reportApi.ts` (REFACTORED - uses apiClient.getBlob)
