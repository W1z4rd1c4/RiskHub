# Phase 71-02 Findings - Risk Hub Access and CRUD Audit

## Scope
- **Access control & routing:** `backend/app/api/v1/endpoints/riskhub.py`, `backend/app/api/v1/router.py`, `backend/app/api/deps.py`, `backend/app/models/role.py`
- **CRUD logic:** `backend/app/api/v1/endpoints/riskhub.py`, `backend/app/models/department.py`, `backend/app/models/role.py`, `backend/app/models/activity_log.py`, `backend/app/core/activity_logger.py`
- **Tests:** `backend/tests/test_riskhub_roles.py`, `backend/tests/test_riskhub_departments.py`
- **Out of scope:** AD Emulator

## Summary
- **Critical:** 0
- **High:** 1
- **Medium:** 3
- **Low:** 1

---

## Access Control Findings

### 1) Medium — Public config endpoint exposes all config keys to any authenticated user
- **Evidence:** `backend/app/api/v1/endpoints/riskhub.py:649-671`
- **Impact:** Any authenticated user can read any key in `global_config` (including approval and notification toggles). If some settings are intended to be CRO-only, this leaks business configuration to non-CRO roles.
- **Fix:** Restrict `public-config` to a safe allowlist of keys, or gate it by CRO for non-public categories.

---

## Roles and Departments Findings

### 2) High — Department update returns `dept.is_hidden` which does not exist
- **Evidence:** `backend/app/api/v1/endpoints/riskhub.py:1238-1245`, `backend/app/models/department.py:15-23`
- **Impact:** `/riskhub/departments/{id}` update responses will raise `AttributeError` at runtime, resulting in 500s for CRO users.
- **Fix:** Return `dept.is_active` consistently (same as other department endpoints) and remove `is_hidden` usage.

### 3) Medium — System departments can be deleted despite `is_system` flag
- **Evidence:** `backend/app/models/department.py:15-22`, `backend/app/api/v1/endpoints/riskhub.py:1251-1304` (no `is_system` guard)
- **Impact:** CRO can delete system departments even though the model comment indicates they should be protected, risking core data integrity.
- **Fix:** Add a guard that blocks deletion when `dept.is_system` is true (parallel to role deletion logic).

### 4) Medium — Role permission IDs are not validated; invalid IDs are silently ignored
- **Evidence:** `backend/app/api/v1/endpoints/riskhub.py:811-818`, `backend/app/api/v1/endpoints/riskhub.py:891-898`
- **Impact:** CRO can submit invalid permission IDs and receive a 201/200 response while some permissions are silently dropped, leading to misconfigured roles without warning.
- **Fix:** Validate that all provided `permission_ids` exist; return 400 with a clear error if any are missing.

### 5) Low — Department `code` uniqueness is not validated on create/update
- **Evidence:** `backend/app/api/v1/endpoints/riskhub.py:1133-1142`, `backend/app/api/v1/endpoints/riskhub.py:1200-1205`, `backend/app/models/department.py:12-13`
- **Impact:** Duplicate codes will raise DB integrity errors on commit, resulting in 500s and poor UX for CROs.
- **Fix:** Check for existing `code` on create/update and return 400 with a helpful message.

---

## Test Coverage Notes
- Existing tests only cover role list/create/delete and department create/delete; there is no coverage for update flows, `public-config`, or system department deletion guards (`backend/tests/test_riskhub_roles.py`, `backend/tests/test_riskhub_departments.py`).
