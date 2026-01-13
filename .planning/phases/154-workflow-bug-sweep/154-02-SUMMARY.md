# Phase 154-02 Summary: Backend RBAC Fixes

**Completed:** 2026-01-13  
**Duration:** ~10 minutes

---

## What Was Accomplished

### Task 1: Control-Side Linking Endpoints Fixed ✅

Updated three endpoints in `backend/app/api/v1/endpoints/controls.py` to support control owner cross-department access:

| Endpoint | Change |
|----------|--------|
| `GET /controls/{id}/risks` | Added `is_control_owner()` bypass before department check |
| `POST /controls/{id}/risks` | Added `is_control_owner()` + symmetric risk access check |
| `DELETE /controls/{id}/risks/{rid}` | Added `is_control_owner()` + symmetric risk access check |

**Access Logic:**
- Control side: Allow if user is control owner OR has department access
- Risk side: Allow if user is risk owner, KRI reporting owner, control owner of linked control, OR has department access
- Both sides must pass for linking/unlinking (prevents authorization escalation)

### Task 2: KRI History Endpoint Fixed ✅

Updated `GET /kris/{id}/history` in `backend/app/api/v1/endpoints/kris.py`:

**Access Logic:**
1. KRI reporting owner → allowed (cross-department)
2. Risk owner (of linked risk) → allowed (cross-department)
3. Department access → fallback

---

## Tests Added

### test_cross_department_access.py (+3 tests)
- `test_control_owner_can_list_risks_via_control_endpoint`
- `test_control_owner_can_link_risk_via_control_endpoint`
- `test_control_owner_can_unlink_risk_via_control_endpoint`

### test_kris_rbac.py (+2 tests)
- `test_reporting_owner_can_view_kri_history_cross_department`
- `test_risk_owner_can_view_kri_history_cross_department`

---

## Verification Results

```bash
cd backend && pytest -q tests/test_cross_department_access.py
# Result: 10/10 passed (was 7, +3 new)

cd backend && pytest -q tests/test_kris_rbac.py
# Result: 13/13 passed (was 11, +2 new)
```

---

## Files Modified

| File | Changes |
|------|---------|
| [controls.py](../../../backend/app/api/v1/endpoints/controls.py) | Added `is_control_owner` checks to 3 endpoints |
| [kris.py](../../../backend/app/api/v1/endpoints/kris.py) | Added ownership checks to history endpoint |
| [test_cross_department_access.py](../../../backend/tests/test_cross_department_access.py) | Added 3 control-side linking tests |
| [test_kris_rbac.py](../../../backend/tests/test_kris_rbac.py) | Added 2 KRI history cross-dept tests |

---

## DISCOVERY.md Issues Addressed

| Issue # | Status |
|---------|--------|
| 1 | ✅ Fixed: Control owner can now load Control Detail cross-department |
| 2 | ✅ Fixed: Control owner can now link/unlink risks cross-department |
| 3 | ✅ Fixed: KRI reporting owner can now view history cross-department |

---

*Phase 154-02 complete. Ready for 154-03 or 154-04.*
