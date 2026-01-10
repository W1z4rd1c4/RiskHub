# Summary: 152-05 Entity-Level Activity Logs on Approval Execution

## Completed

### Entity-Level Logging in `approvals.py`
- **DELETE approvals** now log `ARCHIVE` action for Risk/Control/KRI entities with status changes
- **EDIT approvals** now log `UPDATE` action with applied field changes
- **KRI value operations** log both:
  - `KRI_VALUE` with `CREATE` (new submission) or `UPDATE` (correction)
  - `KRI` updates when `current_value`/`last_period_end`/`last_reported_at` change
- All entity logs include `description="...via approval #{id}"` for audit traceability

### JSON Normalization in `activity_logger.py`
- Added `_normalize_change_value()` to convert:
  - `datetime`/`date` → `.isoformat()`
  - Enums → `.value`
- Prevents 500 errors from non-JSON-serializable types in `changes` dict

### Transaction Safety in `deps.py`
- **Fixed**: Removed `db.commit()` inside `get_current_user` dependency
- This was breaking transaction boundaries by accidentally committing unrelated work
- `last_active_at` updates now rely on endpoint commits (acceptable for best-effort tracking)

## Tests
- `test_activity_log.py`: 15 passed
- `test_approvals.py`: 13 passed

## Files Modified
- `backend/app/api/v1/endpoints/approvals.py` - Entity-level logging
- `backend/app/core/activity_logger.py` - JSON normalization
- `backend/app/api/deps.py` - Transaction boundary fix
- `backend/tests/test_activity_log.py` - Updated tests
