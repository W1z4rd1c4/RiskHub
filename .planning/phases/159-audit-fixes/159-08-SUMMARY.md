---
phase: 159-audit-fixes
plan: 08
completed: 2026-01-23
---

# Summary: CSP Connect-Src Fix

## Problem

CSP included `http://backend:*` in connect-src - Docker internal hostname unresolvable by browsers.

## Solution

Removed `http://backend:*`, keeping only `'self'`.

All API calls go through `/api/` which is proxied to backend in nginx, so same-origin `'self'` is sufficient.

## Commit

`fix(159-08)` - simplify CSP connect-src to 'self' only
