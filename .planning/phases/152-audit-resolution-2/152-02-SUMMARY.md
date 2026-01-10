# Summary 152-02: Fix control_id_code Reference

## Status: ✅ COMPLETED

## Problem Fixed
`approvals.py:123` referenced `resource.control_id_code` but `Control` model has no such field. This would cause `AttributeError` when creating approval requests for Controls.

## Changes Made

### [approvals.py](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/approvals.py)
- **Line 123**: Changed `{resource.control_id_code}:` → `Control #{resource.id}:`

## Verification
- ✅ 15/15 tests pass (`test_approvals.py`)

## Files Modified
- `backend/app/api/v1/endpoints/approvals.py`
