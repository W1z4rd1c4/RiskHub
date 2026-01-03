# Phase 70-07.1 Fixes: Ghost Role & Active Sessions

## Objective
1. Fix "Ghost Role" in User Creation.
2. Fix empty "Active Sessions" and "Application Logs" in Admin Console.
3. Enhance Active Sessions with Status (Online/Offline/Revoked) and Duration.
4. Fix **False Offline Status** when user is just reading/viewing dashboards.
5. **Categorize Activity Logs** into Tabs.

## Fixes Implemented

### 1. Ghost Role
- **Fix**: Added `.where(Role.is_active == True)` to `list_roles` endpoint.

### 2. Active Sessions & Logs
- **Fix**: Login actions logged + committed. Status/Duration logic added to UI.

### 3. User Presence (New)
- **Fix**: Added `last_active_at` timestamp to User model and auto-update mechanism. Active Sessions now reflect real-time presence.

### 4. Activity Log Tabs (New)
- **Requirement**: Separate logs into KRI, Risk, Controls, Users.
- **Backend**: Updated `/activity-log` endpoint to accept multiple `entity_type` filters.
- **Frontend**: Refactored `ActivityLogPage.tsx` to use Tabs instead of "Entity Type" dropdown.
    - **Tabs**: KRI, Risk, Controls, Users (Pill style). "All Activity" removed.
    - **Bug Fix**: Fixed `apiClient.ts` to correctly serialize array parameters (e.g., `entity_type=user&entity_type=role` instead of comma-separated string). This resolved missing logs in multi-type tabs.

## Verification
- **Activity Log**: Click on the side menu "Activity Log". You should see tabs at the top. Click each to verify filtering.
    - **Users Tab**: Should now correctly show "Logged In" events and User/Role changes.
