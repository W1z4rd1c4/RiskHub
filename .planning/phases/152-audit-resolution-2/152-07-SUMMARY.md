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
| `POST /risks/{id}/controls` | Added same ownership checks for risk side + **control owner check for control side** |
| `DELETE /risks/{id}/controls/{id}` | Added same ownership checks for both risk and control sides |

### Pattern Used
```python
# Risk-side access (same pattern as GET /risks/{id})
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

# Control-side access (added in gap fix)
is_ctrl_owner = await is_control_owner(db, current_user.id, control.id)
if not is_ctrl_owner:
    check_department_access(control.department_id, current_user)
```

## Tests
- Syntax verification: ✅ Passed

## Files Modified
- `backend/app/api/v1/endpoints/risks.py` (3 endpoints updated)
