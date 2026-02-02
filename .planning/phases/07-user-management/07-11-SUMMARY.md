# Summary 07-11: KRI Permission Enforcement

## Objective
Enforce KRI permissions consistently by mapping KRI operations to existing `risks:*` permissions.

## Changes Made
- Added backend permission enforcement for KRI mutating endpoints:
  - Create/Update → `risks:write`
  - Delete → `risks:delete`
- Documented and enforced KRI→risks permission inheritance in frontend permission helpers.

## Verification
- Verified users without required permissions are rejected by the API, and UI gating matches backend behavior.

---
*Completed: previously executed (summary backfilled 2026-02-02)*

