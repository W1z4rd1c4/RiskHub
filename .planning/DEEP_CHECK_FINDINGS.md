# Deep Check Findings - Phase 7 Review

> Generated: 2025-12-26 by 10 parallel code review agents

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 3 | Security bypasses and blocking bugs |
| 🟠 High | 8 | Permission/auth issues |
| 🟡 Medium | 6 | Inconsistencies and edge cases |

---

## 🔴 Critical Issues (Must Fix)

### 1. Missing `check_permission` Import (Runtime Error)

**Files**: `risks.py:199`, `controls.py:180`

**Bug**: `check_permission` is used but never imported → `NameError` at runtime

**Fix**: Add `from app.core.security import check_permission, require_permission`

---

### 2. Auth Mock Bypass in Security.py

**File**: `backend/app/core/security.py:63-103`

**Bug**: `get_current_user` in security.py allows `X-Mock-User-Id` header to bypass JWT validation, enabling any request to impersonate any user.

**Impact**: Any request can set header to gain full access to any user account.

**Fix**: Remove mock path from production; gate behind `DEBUG` env flag.

---

### 3. Empty `dept_ids` Returns All Data (Permission Bypass)

**File**: `backend/app/core/permissions.py:16-30`

**Bug**: If non-privileged user has `department_id=None`, `get_user_department_ids()` returns `[]`. All endpoints treat `if dept_ids:` as false, granting full access.

**Impact**: Users without department assignment see ALL data.

**Fix**: 
```python
def get_user_department_ids(user: User) -> list[int] | None:
    if is_privileged_user(user):
        return None  # Signal: no filter needed
    if user.department_id:
        return [user.department_id]
    return []  # Empty, but distinct from None

# In endpoints:
dept_ids = get_user_department_ids(current_user)
if dept_ids is not None:  # None = privileged, [] = no access
    if not dept_ids:
        return []  # No departments = no data
    query = query.filter(Model.department_id.in_(dept_ids))
```

---

## 🟠 High Issues (Should Fix)

### 4. CRUD Endpoints Lack Department Scoping

**Affected Endpoints**:
- `kris.py`: get_kri, create_kri, update_kri, delete_kri
- `controls.py`: get_control, update_control
- `risks.py`: get_risk, update_risk, delete_risk
- `departments.py`: get_department, list_department_risks, list_department_controls

**Bug**: List endpoints filter by department, but individual CRUD operations don't verify user has access to that department.

**Impact**: Users can read/modify/delete items from other departments via direct ID access (IDOR).

**Fix**: Add department check to all CRUD endpoints:
```python
# Before modifying, verify department access
dept_ids = get_user_department_ids(current_user)
if dept_ids and item.department_id not in dept_ids:
    raise HTTPException(403, "Access denied to this department")
```

---

### 5. `delete_risk` Missing Permission Check

**File**: `risks.py:231`

**Bug**: No `require_permission("risks", "delete")` - any authenticated user can archive risks.

**Fix**: Add `current_user: User = Depends(require_permission("risks", "delete"))`

---

### 6. Unprotected Endpoints in `users.py`

| Endpoint | Issue |
|----------|-------|
| `get_user_subordinates` | No auth check - leaks org structure |
| `list_roles` | Public endpoint - role enumeration |
| `mock_login` | Returns impersonation header |

**Fix**: Add `current_user: User = Depends(deps.get_current_user)` to all

---

### 7. Dashboard `/summary` Inconsistent Filtering

**File**: `dashboard.py:41-162`

**Bug**: Several aggregations inside `/summary` don't apply `control_dept_filter`/`risk_dept_filter`:
- `controls_by_form` (line 91)
- Several risk aggregations use `department_id` param directly

**Fix**: Apply filter consistently to ALL queries in the endpoint

---

### 8. Control/Risk Linking Ignores Department

**File**: `controls.py:350-425`

**Bug**: `link_control_to_risk`/`unlink_control_from_risk` only require `controls:write`, don't check if control/risk belongs to user's department.

**Fix**: Validate both control and risk department before linking

---

## 🟡 Medium Issues (Consider Fixing)

### 9. `is_privileged_user` Crashes if `user.role` is None

**File**: `permissions.py:6`

**Fix**: Add null check: `if not user.role: return False`

---

### 10. COO Excluded from `privileged_roles`

**File**: `role.py:30` / `seed_roles_permissions.py`

**Issue**: COO is C-Suite but gets limited permissions, not full access.

**Fix**: Either add COO to privileged_roles, or document this is intentional.

---

### 11. UserUpdate Schema Incomplete

**File**: `schemas/user.py:36`

**Issue**: Cannot update `email` or `password` via UserUpdate.

---

### 12. TokenResponse Uses `dict` Instead of TypedDict

**File**: `schemas/auth.py:11`

**Issue**: `user: dict` weakens type safety.

**Fix**: Use `user: UserBrief`

---

### 13. Error Message Leaks Account State

**File**: `deps.py:52`

**Issue**: "User not found or inactive" reveals account state.

**Fix**: Use generic "Unauthorized"

---

### 14. Seed Script User Count Non-deterministic

**File**: `seed_users.py`

**Issue**: Random employee count (8-12 per dept) doesn't match "120 users" in docs.

---

## ✅ What's Working

- All list endpoints use `deps.get_current_user` ✓
- `get_user_department_ids` imported and used in list endpoints ✓
- JWT token validation in deps.py is secure ✓
- Password hashing with bcrypt is correct ✓
- No N+1 queries (using `joinedload`) ✓
- Token expiration enforced ✓
- Role-permission relationships correct ✓

---

## Recommended Priority Order

1. **Immediate** (Blocks functionality):
   - Fix missing `check_permission` import
   - Fix empty `dept_ids` returning all data

2. **Before Production** (Security):
   - Add department checks to all CRUD endpoints
   - Remove/gate mock auth in security.py
   - Add perms to delete_risk
   - Protect users.py endpoints

3. **Polish** (Quality):
   - Consistent Dashboard filtering
   - Schema improvements
   - COO role clarification
