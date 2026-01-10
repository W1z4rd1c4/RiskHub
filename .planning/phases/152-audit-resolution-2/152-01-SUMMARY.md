# Summary 152-01: Fix Department head_id → manager_id Mismatch

## Status: ✅ COMPLETED

## Problem Fixed
`approval_helpers.py` referenced `department.head_id` but `Department` model defines `manager_id`. This would cause `AttributeError` crashes when creating approval requests for resources with departments.

## Changes Made

### [approval_helpers.py](../../../backend/app/core/approval_helpers.py)
- **Lines 62-65**: Changed `control.department.head_id` → `control.department.manager_id`
- **Lines 129-130**: Changed `risk.department.head_id` → `risk.department.manager_id`

### [risks.py](../../../backend/app/api/v1/endpoints/risks.py)
- **Line 655**: Changed `dept.head_id` → `dept.manager_id`

## Verification
- ✅ 21/21 tests pass (`test_approval_workflow.py` + `test_approvals.py`)
- ✅ No AttributeError in approval creation flow

## Files Modified
- `backend/app/core/approval_helpers.py`
- `backend/app/api/v1/endpoints/risks.py`
