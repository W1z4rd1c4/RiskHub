# Phase 151 Plan 12: KRI Open-Period Approval Summary

**Non-privileged KRI value submissions now route through approval with current-period recording on approval.**

## Accomplishments

- Added `allow_open_period` flag to `KRIHistoryService.record_value()` allowing open period recording when approved
- Non-privileged KRI value submissions now return 202 and create an ApprovalRequest with `period_end` and `recorded_at`
- Approval apply path now reads `period_end`/`recorded_at` from pending_changes and records history with `allow_open_period=True`
- Added 4 tests for open-period validation in `test_kri_history.py`
- Added 3 tests for approval flow in `test_kris_history_api.py` and `test_approvals.py`

## Files Created/Modified

- `backend/app/services/kri_history_service.py` - Added `allow_open_period` flag for open-period guardrails
- `backend/app/api/v1/endpoints/kris.py` - Non-privileged submissions create approval request (202 response)
- `backend/app/api/v1/endpoints/approvals.py` - Apply approved value with `period_end` and `allow_open_period=True`
- `backend/tests/test_kri_history.py` - Added 4 tests for open-period functionality
- `backend/tests/test_kris_history_api.py` - Added 2 tests for non-privileged submission flow
- `backend/tests/test_approvals.py` - Added 1 test for approval with period_end

## Decisions Made

None.

## Issues Encountered

- Fixed import shadowing bug where local `datetime` import shadowed module-level import in `approvals.py`

## Next Step

Ready for 151-13-PLAN.md
