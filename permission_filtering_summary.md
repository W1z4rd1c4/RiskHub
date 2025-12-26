# Permission Filtering Implementation Summary

## Changes Made

### 1. KRIs Endpoint (`backend/app/api/v1/endpoints/kris.py`)
- Added department-based filtering to KRI listing using `get_user_department_ids`
- Implemented join with Risk table to filter KRIs by their associated risk's department
- Pattern: `query.join(Risk).filter(Risk.department_id.in_(dept_ids))`

### 2. Departments Endpoint (`backend/app/api/v1/endpoints/departments.py`)
- Updated departments listing to scope results to accessible department IDs
- Direct filtering: `query.filter(Department.id.in_(dept_ids))`
- Privileged users see all departments, department-scoped users see only their department

### 3. Dashboard Endpoint (`backend/app/api/v1/endpoints/dashboard.py`)
- Applied department scoping across ALL aggregation queries:
  - Dashboard summary (risk counts, control counts, KRI counts)
  - Department metrics
  - Risk distribution (5x5 matrix)
  - Control trends (execution history)
  - Risks by cell (drill-down)
- Consistent pattern: Check `dept_ids` first, then fall back to `department_id` parameter

## Implementation Pattern

All endpoints now follow this consistent pattern:

```python
from app.api import deps
from app.core.permissions import get_user_department_ids

@router.get("")
async def list_items(
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    dept_ids = get_user_department_ids(current_user)
    
    query = select(Model)
    if dept_ids:  # Non-empty = department-scoped user
        query = query.filter(Model.department_id.in_(dept_ids))
    # Empty list = privileged user, no filter applied
    
    result = await db.execute(query)
    return result.scalars().all()
```

## Testing Status

Tests not run due to read-only sandbox environment. Manual testing required:

### Test Commands

```bash
# Test as CRO (should see all)
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cro@riskhub.test","password":"test123"}' | jq -r '.access_token')

curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/kris
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/departments
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/dashboard

# Test as COO (should see only Operations)
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"coo@riskhub.test","password":"test123"}' | jq -r '.access_token')

curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/kris
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/departments
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/dashboard
```

## Files Modified

1. `backend/app/api/v1/endpoints/kris.py`
2. `backend/app/api/v1/endpoints/departments.py`
3. `backend/app/api/v1/endpoints/dashboard.py`

## Success Criteria

- [x] KRIs endpoint filters by risk department
- [x] Departments endpoint filters by accessible departments
- [x] Dashboard endpoint applies filtering to all aggregations
- [x] Consistent pattern across all endpoints
- [ ] No import errors (needs verification)
- [ ] Backend server starts successfully (needs verification)
- [ ] Privileged users see all data (needs testing)
- [ ] Department-scoped users see only their department (needs testing)

## Next Steps

1. Apply the patch to the actual files
2. Restart backend server
3. Run manual tests with CRO and COO accounts
4. Verify no import errors or runtime issues
5. Commit changes if successful
