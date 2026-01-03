# Phase 72 Plan 03: Access Control & Notifications Summary

Implements cross-department implicit access for KRI/Control owners and robust notification pipelines for control edits.

## Accomplishments

- **Cross-Department Access**:
  - KRI Reporting Owners can now view their assigned KRIs and linked Risks regardless of department.
  - Control Owners can now view/update their assigned Controls and log executions regardless of department.
- **Notification Fan-Out**:
  - Control edits/deletions by non-privileged owners now trigger notifications to:
    1. The **Primary Approver** (Risk Owner).
    2. All **CROs**, **Risk Managers**, and **Admins**.
- **Access Scope Hardening**:
  - `list_risks` and `list_controls` endpoints properly merge department-scoped results with owner-assigned results.

## Files Created/Modified

- `backend/app/core/permissions.py` - Added 8 access helper functions
- `backend/app/api/v1/endpoints/controls.py` - Updated CRUD + Notification logic
- `backend/app/api/v1/endpoints/risks.py` - Updated list/get for owner visibility
- `backend/app/api/v1/endpoints/kris.py` - Updated list/get for owner visibility

## Decisions Made

- **Implicit Access**: Owners always get read/write access to their assigned items, bypassing department isolation.
- **Notification redundancy**: We explicitly notify both the Primary Approver AND the privileged roles group to ensure no request slips through cracks.

## Issues Encountered

- Initial notification logic missed the privileged group if no primary approver existed. Fixed by decoupling the notification calls.

## Next Step

Ready for `72-04-PLAN.md` (Risk Hub CRUD hardening).
