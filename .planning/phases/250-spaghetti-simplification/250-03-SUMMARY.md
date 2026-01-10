# Summary: Plan 250-03 (Approvals Extraction)

## Objective
Extract approval execution logic from `approvals.py` into a dedicated service module.

## Changes Made

### Created: `backend/app/services/approval_execution_service.py` (673 lines)
- `load_approval()` - loads approval with required relationships
- `get_approval_department_id()` - helper for department resolution
- `assert_can_approve()` - authorization checks (privileged vs primary approver)
- `apply_status_transition()` - handles PENDING → PENDING_PRIVILEGED → APPROVED
- `apply_side_effects()` - main entry point for DELETE/EDIT execution
  - `_apply_delete_side_effects()` - archives Risk/Control/KRI
  - `_apply_edit_risk_control()` - applies pending_changes to Risk/Control
  - `_apply_edit_kri()` - handles 3 KRI branches:
    1. History correction (`history_entry_id` present)
    2. Value submission (`period_end` + `current_value` present)
    3. Generic edit (+ optional value recording)
- `log_approval_approve()` - logs final APPROVE action

### Modified: `backend/app/api/v1/endpoints/approvals.py` (961→586 lines)
- `approve_request()` refactored from ~460 lines inline to ~75 lines orchestration
- Now calls service functions for: load, authorize, transition, apply, log

## Verification
- ✅ `test_approvals.py` (12 tests) - passed
- ✅ `test_approval_workflow.py` (14 tests) - passed  
- ✅ `test_activity_log.py` (10 tests) - passed
- **Total: 36 passed**

## Metrics
| File | Before | After |
|------|--------|-------|
| `approvals.py` | 961 lines | 586 lines |
| `approval_execution_service.py` | - | 673 lines |
| `approve_request()` endpoint | ~460 lines | ~75 lines |
