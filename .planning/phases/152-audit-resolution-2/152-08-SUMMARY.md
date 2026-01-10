# Summary: 152-08 Fix Control Execution Department Scoping

## Completed

### Problem
Control owners couldn't see executions for cross-department controls they own—execution endpoints were department-scoped only.

### Fixes Applied

| Endpoint | Change |
|----------|--------|
| `GET /executions` | Query includes `OR control_id.in_(owned_control_ids)` |
| `POST /executions` | Checks `is_control_owner` before department access |
| `GET /executions/{id}` | Checks `is_control_owner` before department access |

### Pattern Used
```python
# For list queries
owned_control_ids = await get_control_ids_where_owner(db, current_user.id)
if owned_control_ids:
    query = query.where(or_(
        ControlModel.department_id.in_(dept_ids),
        ControlModel.id.in_(owned_control_ids)
    ))

# For single-item access
is_owner = await is_control_owner(db, current_user.id, control.id)
if not is_owner:
    check_department_access(control.department_id, current_user)
```

## Tests
- Syntax verification: ✅ Passed

## Files Modified
- `backend/app/api/v1/endpoints/executions.py`
