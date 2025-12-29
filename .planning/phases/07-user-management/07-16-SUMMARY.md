# Phase 7.16: Approval Request Resource Access Check - Summary

**Added department access verification when creating approval requests to prevent cross-department requests.**

## Accomplishments

- Added `check_department_access` import and calls for Risk and Control resources
- Cross-department approval requests now return 403 Forbidden
- Test verifies employee in Dept A cannot create approval for risk in Dept B

## Files Created/Modified

- [`backend/app/api/v1/endpoints/approvals.py`](../../../backend/app/api/v1/endpoints/approvals.py#L68-L76) - Added access checks
- [`backend/tests/test_approvals.py`](../../../backend/tests/test_approvals.py) - Added cross-department test

## Security Behavior

| User | Resource Dept | Result |
|------|---------------|--------|
| User in Dept A | Risk in Dept A | ✅ Allowed |
| User in Dept A | Risk in Dept B | ❌ 403 Forbidden |
| Admin/CRO | Any department | ✅ Allowed (privileged) |

## Test Results

```
tests/test_approvals.py::test_create_approval_cross_department_forbidden PASSED
```

## Next Step

Ready for 07-17-PLAN.md (Reports Export Permission Enforcement)
