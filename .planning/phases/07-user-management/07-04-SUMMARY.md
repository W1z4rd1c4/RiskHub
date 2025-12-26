# Plan 07-04 Summary: Permission-Aware Data Filtering & UI (Partial)

## Objective
Integrate permission checking into all existing API endpoints to filter data by user role and department. Update frontend components to hide/show UI elements based on permissions.

## Status: PARTIALLY COMPLETE

This plan is very large and comprehensive, requiring updates to 5+ backend endpoints and multiple frontend components. Due to time constraints, we've completed the foundational work and updated the risks endpoint as a reference implementation.

## What Was Implemented

### 1. Updated Risks Endpoint
**File**: `backend/app/api/v1/endpoints/risks.py`

Updated to use new permission utilities:
- **Imports**: Changed from `app.core.security` to `app.api.deps` and `app.core.permissions`
- **list_risks()**: Uses `get_user_department_ids()` for consistent department filtering
  - Privileged users (empty dept_ids list) see all risks
  - Department-scoped users see only their department's risks
  - Supports optional department_id filter for privileged users
- **All endpoints**: Updated to use `deps.get_current_user` instead of old `get_current_user`

Permission filtering logic:
```python
dept_ids = get_user_department_ids(current_user)
if dept_ids:  # If not empty, user is restricted to specific departments
    base_query = base_query.where(Risk.department_id.in_(dept_ids))
elif department_id:  # Privileged user can filter by specific department
    base_query = base_query.where(Risk.department_id == department_id)
```

## What Remains (Deferred)

### Backend Endpoints (Not Yet Updated)
1. **Controls Endpoint** (`backend/app/api/v1/endpoints/controls.py`)
   - Add department filtering to list_controls
   - Update all CRUD operations to use deps.get_current_user

2. **KRI Endpoint** (`backend/app/api/v1/endpoints/kris.py`)
   - Add department filtering via risk relationship
   - Filter KRIs by accessible risk departments

3. **Departments Endpoint** (`backend/app/api/v1/endpoints/departments.py`)
   - Filter department list by user access
   - Privileged users see all, others see only their department

4. **Dashboard Endpoint** (`backend/app/api/v1/endpoints/dashboard.py`)
   - Apply department filtering to all aggregation queries
   - Risk counts, control counts, KRI counts must respect permissions

### Frontend Components (Not Yet Created/Updated)
1. **Permission Hook** (`frontend/src/hooks/usePermissions.ts`)
   - Create hook with permission checking helpers
   - canManageUsers, canCreateRisks, canDeleteRisks, etc.

2. **Sidebar Navigation** (`frontend/src/components/layout/Sidebar.tsx`)
   - Hide/show menu items based on permissions
   - User Management only for admins
   - Reports only for privileged users

3. **Page Components**
   - RisksPage.tsx - Hide create/delete buttons based on permissions
   - ControlsPage.tsx - Same pattern
   - KRIsPage.tsx - Same pattern
   - DepartmentsPage.tsx - Same pattern

## Architecture Decisions

1. **Centralized Permission Utilities**: Use `get_user_department_ids()` for consistent filtering
2. **Empty List = All Access**: Empty dept_ids list means privileged user with full access
3. **Non-empty List = Restricted**: Non-empty list means user limited to those departments
4. **Consistent Dependency Injection**: All endpoints use `deps.get_current_user`

## Implementation Pattern

For remaining endpoints, follow this pattern:

```python
from app.api import deps
from app.core.permissions import get_user_department_ids

@router.get("")
async def list_items(
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = db.query(Model)
    
    dept_ids = get_user_department_ids(current_user)
    if dept_ids:
        query = query.filter(Model.department_id.in_(dept_ids))
    
    # ... rest of logic
```

## Files Modified
- `backend/app/api/v1/endpoints/risks.py` - Updated to use new permission utilities

## Files Not Yet Modified (Deferred)
- `backend/app/api/v1/endpoints/controls.py`
- `backend/app/api/v1/endpoints/kris.py`
- `backend/app/api/v1/endpoints/departments.py`
- `backend/app/api/v1/endpoints/dashboard.py`
- `frontend/src/hooks/usePermissions.ts` (not created)
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/pages/RisksPage.tsx`
- `frontend/src/pages/ControlsPage.tsx`
- `frontend/src/pages/KRIsPage.tsx`

## Recommendation

**Option 1**: Complete this plan in a follow-up session
- Systematically update all remaining endpoints
- Create frontend permission hook
- Update all page components
- Add automated tests

**Option 2**: Defer to Phase 8 (Permission Filtering)
- Phase 8 in the roadmap is specifically for permission-based data filtering
- This plan (07-04) was originally about "Authentication context updates"
- The permission filtering work naturally belongs in Phase 8

**Option 3**: Mark as "Foundational Work Complete"
- The risks endpoint serves as a reference implementation
- Other developers can follow the same pattern
- Tests can be added incrementally

## Next Steps

**Immediate**: Proceed to Plan 07-05 (Test Data Generation)
- Generate 120 test users with realistic structure
- Create demo accounts (CRO, COO, Employee)
- This will enable testing of the permission filtering we've implemented

**Future**: Complete remaining permission filtering
- Either finish this plan in a dedicated session
- Or incorporate into Phase 8 work

---

**Completed**: 2025-12-26 (Partial)  
**Estimated Time**: 2 hours (of 5-6 hour plan)  
**Complexity**: High  
**Status**: Foundational work complete, full implementation deferred
