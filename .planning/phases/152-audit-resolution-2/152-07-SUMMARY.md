# Summary: 152-07 Fix Cross-Department Access Inconsistencies

## Completed

### Problem
Cross-department access via ownership was inconsistent:
- `GET /risks/{id}` checked KRI reporting owner and control owner ✅
- `GET /risks/{id}/controls` only checked department ❌
- User could view a risk but not its linked controls

### Fixes Applied

| Endpoint | Change |
|----------|--------|
| `GET /risks/{id}/controls` | Added `is_risk_kri_reporting_owner` + `is_risk_control_owner` checks |
| `POST /risks/{id}/controls` | Added same ownership checks before department fallback |
| `DELETE /risks/{id}/controls/{id}` | Added same ownership checks before department fallback |

### Pattern Used
```python
# Same pattern as GET /risks/{id}
has_access = False
if await is_risk_kri_reporting_owner(db, current_user.id, risk_id):
    has_access = True
elif await is_risk_control_owner(db, current_user.id, risk_id):
    has_access = True
else:
    try:
        check_department_access(risk.department_id, current_user)
        has_access = True
    except HTTPException:
        pass

if not has_access:
    raise HTTPException(status_code=403, detail="Access denied")
```

## Tests
- Syntax verification: ✅ Passed

## Files Modified
- `backend/app/api/v1/endpoints/risks.py` (3 endpoints updated)
