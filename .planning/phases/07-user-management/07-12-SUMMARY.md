# Summary 07-12: Permission Model Consistency & Null Department Handling

## Objective
Close RBAC consistency gaps by tightening access to unassigned (“null department”) items, implementing manager-based department inheritance, and aligning approvals permissions.

## Changes Made
- Restricted access to `department_id = NULL` entities to privileged users (prevents accidental global access).
- Implemented manager-based department inheritance for manager-scoped users without a department.
- Aligned approvals permission checks with seeded role permissions (explicit `approvals:write`).
- Consolidated frontend permission checks via `AuthContext.hasPermission()` as the single source of truth.

## Verification
- Verified non-privileged users cannot access unassigned items and manager inheritance works as expected.

---
*Completed: previously executed (summary backfilled 2026-02-02)*

