---
phase: 159-audit-fixes
plan: 07
completed: 2026-01-23
---

# Summary: Webhook Error Codes

## Problem

Webhook returned 200 with `status="failed"` on processing errors, preventing AD Emulator from retrying.

## Solution

Return proper HTTP error codes:

- **200**: Success
- **400**: Validation errors (don't retry)
- **500**: Processing errors (retry)

## Idempotency

`sync_single_user` is safe to retry - uses upsert pattern.

## Commit

`fix(159-07)` - return 5xx on webhook failure to enable upstream retry
