# Phase 85-06: Owner-Based Control Edit Permissions

## Summary

Implemented owner-based control edit permissions allowing Control Owners to edit their assigned controls with approval workflow.

## Changes Made

### Backend

#### [NEW] approval_helpers.py
- `get_primary_approver_for_control`: Returns Risk Owner of highest-priority linked risk
- `check_control_requires_privileged_approval`: Returns true if any linked risk is priority

#### [MODIFY] controls.py
- Owner edits now trigger approval with:
  - `primary_approver_id` set to linked Risk Owner
  - `requires_privileged_approval` flag for priority-linked controls
- Added Check 3: Owner edits always require approval
- Status check updated to include `PENDING_PRIVILEGED`

### Frontend

#### [MODIFY] ControlDetailPage.tsx
- Edit button now visible for control owners (not just `controls:write`)
- Added tooltip indicating approval required for owner edits
- Uses `useAuth()` to check ownership

## Verification

| Check | Result |
|-------|--------|
| Backend tests (6/6) | ✅ Passed |
| Frontend build | ✅ Succeeded |
