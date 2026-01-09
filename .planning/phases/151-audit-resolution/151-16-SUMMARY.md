# Summary: 151-16 Approval Request DB Constraints

## Objective
Added DB-level partial unique index to prevent duplicate pending approval requests and added race condition handling.

## Changes Made

### 1. Alembic Migration
**File**: `backend/alembic/versions/h2i3j4k5l6m7_add_partial_unique_index_approval_pending.py`
- Creates `ux_approval_pending` partial unique index on `approval_requests` table
- Index covers `(resource_type, resource_id, action_type)` WHERE `status IN ('PENDING', 'PENDING_PRIVILEGED')`

### 2. ApprovalRequest Model
**File**: `backend/app/models/approval_request.py`
- Updated docstring documenting the constraint
- Added comment noting the migration-created index

### 3. risks.py
**File**: `backend/app/api/v1/endpoints/risks.py`
- Added `IntegrityError` import
- Fixed `delete_risk`: pending check now includes both PENDING + PENDING_PRIVILEGED
- Fixed `update_risk`: pending DELETE check and pending EDIT check now include both statuses
- Wrapped all approval creation in try/except IntegrityError blocks with 409 response

### 4. controls.py
**File**: `backend/app/api/v1/endpoints/controls.py`
- Added `IntegrityError` import
- Fixed `delete_control`: pending check now includes both statuses
- Fixed `update_control`: pending DELETE check now includes both statuses
- Wrapped all approval creation in try/except IntegrityError blocks with 409 response

### 5. kris.py
**File**: `backend/app/api/v1/endpoints/kris.py`
- Added `IntegrityError` import
- Fixed `correct_history_entry`: pending check now includes both statuses
- Wrapped `record_kri_value` approval creation in try/except IntegrityError block
- Wrapped `correct_history_entry` approval creation in try/except IntegrityError block

## Verification
- ✅ All 27 approval, risk, and control tests pass
- ✅ Syntax validation passed for all modified files

## Files Modified
- `backend/alembic/versions/h2i3j4k5l6m7_add_partial_unique_index_approval_pending.py` (new)
- `backend/app/models/approval_request.py`
- `backend/app/api/v1/endpoints/risks.py`
- `backend/app/api/v1/endpoints/controls.py`
- `backend/app/api/v1/endpoints/kris.py`

## Migration Note
Run `alembic upgrade head` to apply the partial unique index migration.
