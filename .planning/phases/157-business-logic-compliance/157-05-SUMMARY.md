# Phase 157-05 Summary: Seed File Role Consistency

**Completed:** 2026-01-22  
**Commit:** `c57ae5a`

---

## What Was Accomplished

### Task 1: Audit seed.py for role discrepancies ✅

Found `control_owner` role used in `seed.py` which doesn't match BUSINESS_LOGIC.md §1.1. The spec uses `employee` for department-scoped users with basic access.

### Task 2: Replace control_owner with employee ✅

Updated ROLES array:

```python
# Before:
{"name": "control_owner", "display_name": "Control Owner", "description": "Specific control management and execution"},

# After:
{"name": "employee", "display_name": "Employee", "description": "Department member with basic access"},
```

Updated ROLE_PERMISSIONS:

```python
# Before:
"control_owner": ["controls:read", "controls:write", "risks:read"],  # No kri:submit

# After:
"employee": ["controls:read", "risks:read", "departments:read", "reports:read"],  # Read-only per §4.2
```

### Task 3: Update TEST_USERS ✅

```python
# Before:
{"email": "ops.analyst@riskhub.local", ..., "role": "control_owner", ...},
{"email": "fin.analyst@riskhub.local", ..., "role": "control_owner", ...},
{"email": "it.analyst@riskhub.local", ..., "role": "control_owner", ...},

# After:
{"email": "ops.analyst@riskhub.local", ..., "role": "employee", ...},
{"email": "fin.analyst@riskhub.local", ..., "role": "employee", ...},
{"email": "it.analyst@riskhub.local", ..., "role": "employee", ...},
```

### Task 4: Verify seed_demo.py alignment ✅

Confirmed `seed_demo.py` already uses `employee` role correctly - no changes needed.

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/app/db/seed.py` | Role name, permissions, and test users |

---

## Verification Criteria Met

- [x] `control_owner` replaced with `employee` in ROLES
- [x] Employee permissions match §4.2 (read-only department access)
- [x] TEST_USERS updated to use employee role
- [x] Aligned with seed_demo.py

---

*Phase 157-05 complete. Aligned with BUSINESS_LOGIC.md §1.1 and §4.2.*
