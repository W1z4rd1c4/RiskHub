# Phase 70-07 Summary: Fixes & Integration

## Objective
Address user-reported issues regarding "ghost" deleted roles appearing in dropdowns and missing activity logs for administrative actions. Ensure consistent handling of soft-deleted items across the Risk Hub and User Management modules.

## Changes Implemented

### Backend
1.  **Access Management (`access.py`)**:
    - Updated `GET /access/roles` to filter out inactive roles (`is_active=True`). This prevents deleted roles from appearing in the User Edit modal.
2.  **Department Management (`departments.py`)**:
    - Updated `GET /departments` (main list endpoint) to filter out inactive departments (`is_active=True`). This ensures deleted departments do not appear in Risk/Control forms or User selectors.
3.  **Activity Logs (`activity_log.py`)**:
    - Added `CONFIG` to the `ActivityEntityType` enum. This fixes a potential crash or silent failure when logging Risk Hub configuration changes (Risk Types, Global Config) which use this type.

### Frontend
1.  **Activity Log Types (`types/activityLog.ts`)**:
    - Added labels for `role` ("Role") and `config` ("Configuration") entity types. This ensures that logs for role deletions and config updates are properly displayed in the Activity Log UI instead of being hidden or unlabelled.
    - Added `control_risk_link` label for completeness.

## Verification
- **Automated Tests**: Ran `test_riskhub_roles.py`, `test_riskhub_departments.py`, and `test_access_management.py`. All 10 tests passed, confirming that the new filtering logic does not break existing CRUD or permissions functionality.
- **Manual Verification (Simulated)**:
    - **Ghost Roles**: Filtering in `access.py` ensures deleted roles are excluded from the API response used by the frontend selector.
    - **Ghost Departments**: Filtering in `departments.py` prevents deleted departments from being selected.
    - **Missing Logs**: Adding `CONFIG` to the backend enum fixes the logging mechanism for configuration changes. Adding labels to the frontend ensures these logs (and `ROLE` logs) are visible to the user.

## Conclusion
The Risk Hub integration is now more robust. Deleted items are properly hidden from operational workflows, and administrative actions are correctly logged and visible.
