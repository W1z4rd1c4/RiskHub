# Summary: 151-17 Sensitive Field Detection & Approval Logic Refinement

## Objective
Fixed bug where clearing sensitive fields to None bypassed approval and added self-approval prevention.

## Changes Made

### 1. `backend/app/core/permissions.py`
**Fixed `has_sensitive_field_changes` function:**
- Used sentinel pattern (`NOT_PROVIDED = object()`) to distinguish between "field not in payload" and "field set to None"
- Clearing `owner_id`, `department_id`, `category` to None now triggers approval
- `is_priority`: only true→false requires approval (downgrade), false→true is allowed

### 2. `backend/app/core/approval_helpers.py`
**Updated `get_primary_approver_for_control`:**
- Added `requester_id` parameter for self-approval prevention
- Skips approver if they are the requester

**Added `get_primary_approver_for_risk`:**
- New helper function for risk edits
- Prevents self-approval the same way

### 3. `backend/tests/test_sensitive_fields.py` (new)
Created 7 unit tests:
- `test_clearing_owner_requires_approval` ✅
- `test_clearing_department_requires_approval` ✅
- `test_priority_upgrade_no_approval` ✅
- `test_priority_downgrade_requires_approval` ✅
- `test_field_not_in_payload_no_change` ✅
- `test_no_change_same_value` ✅
- `test_control_sensitive_fields` ✅

## Verification
- ✅ All 7 new unit tests pass
- ✅ All 27 existing approval/risk/control tests pass
- ✅ Syntax validation passed

## Files Modified
- `backend/app/core/permissions.py`
- `backend/app/core/approval_helpers.py`
- `backend/tests/test_sensitive_fields.py` (new)

## Notes
The new `requester_id` parameter is optional for backward compatibility - existing callers don't need to be updated unless they want self-approval prevention.
