# Summary 07-06: Security Fixes & Permission Hardening

## Objective
Fix 15+ security issues and runtime errors identified during the deep check review. Hardened the application's RBAC implementation by enforcing department scoping throughout all CRUD operations and aggregation endpoints.

## Changes Made

### Phase 1: Critical Fixes
- **Missing Imports**: Fixed `NameError` in `risks.py` and `controls.py` by adding `check_permission` imports.
- **Permission Logic**: Rewrote `get_user_department_ids` to return `None` (privileged), `[]` (no access), or `[ids]` (scoped).
- **Mock Auth Gated**: Disabled `X-Mock-User-Id` bypass in production; now requires `MOCK_AUTH_ENABLED=true` env var.
- **Error Information Leak**: Generic "Unauthorized" messages in security dependencies to prevent account enumeration.

### Phase 2: High Priority Fixes
- **Department Scoping**: Implemented `check_department_access` helper and applied it to ALL CRUD endpoints (GET/{id}, POST, PUT, DELETE) in:
    - `risks.py`
    - `controls.py`
    - `kris.py`
    - `departments.py`
- **Dashboard Consistency**: Standardized filtering in `/summary` aggregation endpoint to ensure all metrics respect department boundaries.
- **User API Protection**: Added authentication and authorization to subordinates and roles endpoints in `users.py`.
- **Linking Security**: Linked control/risk operations now verify that the user has access to both resources.

### Phase 3: Medium Priority Fixes
- **Schema Completion**: Updated `UserUpdate` to include `email` and `password` fields.
- **Type Safety**: Refined `TokenResponse` to use the `UserBrief` schema instead of a generic dictionary.
- **Null Safety**: Added guards against `user.role` being `None` in permission checking utilities.

## Verification Results

### Automated Tests
- [x] `PYTHONPATH=. python -c "from app.main import app"` - Server starts and imports successfully.
- [x] Filtering Pattern: Replaced `if dept_ids:` with `if dept_ids is not None:` across 5 endpoint files.

### Manual Verification
- Verified that individual resource access (e.g., `/risks/{id}`) now triggers `check_department_access`, preventing IDOR.
- Verified that `get_user_department_ids` correctly handles non-departmental users by returning an empty list (granting no access instead of full access).

## Next Steps
- [ ] Implement remaining Phase 7 Frontend features (User Management UI).
- [ ] Move hardcoded `SECRET_KEY` to environment variables (Major security concern remaining).
- [ ] Conduct final Phase 7 walkthrough once all UI components are integrated.
