# Phase 157-01 Summary: Approval Cancellation Permission Fix

**Completed:** 2026-01-22  
**Commit:** `66c23ee`

---

## What Was Accomplished

### Task 1: Fix cancel endpoint authorization ✅

Modified `/approvals/{approval_id}/cancel` endpoint to check:

1. If user is the original requester → allow cancel
2. OR if user is privileged (`can_resolve_approvals(current_user)`) → allow cancel
3. Otherwise → deny with 403

**Before:**

```python
if approval.requested_by_id != current_user.id:
    raise HTTPException(status_code=403, detail="Only the requester can cancel their request")
```

**After:**

```python
if approval.requested_by_id != current_user.id and not can_resolve_approvals(current_user):
    raise HTTPException(status_code=403, detail="Only the requester or privileged users can cancel requests")
```

### Task 2: Update activity log description ✅

Added differentiated logging:

- Self-cancellation: "Approval request cancelled by requester"
- Privileged cancellation: "Approval request cancelled by {user_name} (privileged)"

### Task 3: Add unit tests ✅

Added 6 comprehensive tests for cancel scenarios:

- `test_privileged_user_can_cancel_other_users_pending_request`
- `test_privileged_user_can_cancel_pending_privileged_request`
- `test_self_cancellation_still_works`
- `test_non_privileged_cannot_cancel_other_users_request`
- `test_privileged_cannot_cancel_already_resolved`
- `test_cancellation_logged_correctly`

### Task 4: Verification ✅

```
================= 6 passed, 13 deselected, 6 warnings in 1.99s =================
```

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/app/api/v1/endpoints/approvals.py` | Authorization check, activity log differentiation |
| `backend/tests/test_approvals.py` | 6 new cancellation tests |

---

## Verification Criteria Met

- [x] Privileged users (CRO, Risk Manager, Admin) can cancel any PENDING/PENDING_PRIVILEGED request
- [x] Non-privileged users can only cancel their own requests
- [x] Activity log correctly records who cancelled and why
- [x] All 6 tests pass

---

*Phase 157-01 complete. Aligned with BUSINESS_LOGIC.md §5.5.*
