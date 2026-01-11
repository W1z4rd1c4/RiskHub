# Plan 153-08 Summary

## Cross-Department Risk Owner Access Fix

**Status**: ✅ Completed  
**Date**: 2026-01-11

### Objective
Fixed cross-department risk owner access on `update_risk` and `delete_risk` endpoints to allow risk owners from different departments to edit/request deletion of their assigned risks.

### Decision Made
- **Decision Checkpoint**: Reviewed `get_risk` endpoint and BUSINESS_LOGIC.md §7.1
- **Choice**: **IMPLEMENT** - The current behavior was inconsistent with documented business rules which state that Risk Owners can access "the risk they own, regardless of department"

### Changes Made

#### 1. `backend/app/api/v1/endpoints/risks.py` - `update_risk` (lines 402-414)
```diff
-    # Verify department access
-    check_department_access(risk.department_id, current_user)
-    
     # Check permission: either risks:write or is risk owner
     has_write = check_permission(current_user, "risks", "write")
     is_owner = risk.owner_id == current_user.id
+    
+    # Risk owners can edit their risk regardless of department (cross-department access)
+    # per BUSINESS_LOGIC.md §7.1
+    if not is_owner:
+        # Verify department access only for non-owners
+        check_department_access(risk.department_id, current_user)
```

#### 2. `backend/app/api/v1/endpoints/risks.py` - `delete_risk` (lines 599-607)
```diff
-    # Verify department access
-    check_department_access(risk.department_id, current_user)
+    # Allow risk owners to request deletion regardless of department (cross-department access)
+    # per BUSINESS_LOGIC.md §7.1
+    is_owner = risk.owner_id == current_user.id
+    if not is_owner:
+        # Verify department access only for non-owners
+        check_department_access(risk.department_id, current_user)
```

### Verification
- ✅ `python -c "from app.api.v1.endpoints import risks"` - Import succeeds
- ✅ Owner check now happens before department access check in both endpoints
- ✅ Pattern is consistent with `get_risk` access flow

### Expected Behavior After Fix
| User Scenario | Before | After |
|--------------|--------|-------|
| Cross-dept Risk Owner → edit risk | ❌ 403 Forbidden | ✅ Triggers approval request |
| Cross-dept Risk Owner → delete risk | ❌ 403 Forbidden | ✅ Creates deletion request |
| Non-owner in different dept → edit | ❌ 403 Forbidden | ❌ 403 Forbidden (unchanged) |
| Privileged user → edit | ✅ Immediate | ✅ Immediate (unchanged) |
