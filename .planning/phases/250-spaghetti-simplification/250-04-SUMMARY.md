# Summary 250-04: Consolidate Approval Patterns

## Objective
Reduce duplication in approval request creation between `kris.py` and `risks.py`.

## Changes Made

### 1. [approval_helpers.py](../../../backend/app/core/approval_helpers.py) (MODIFY)
- Added `create_approval_request_with_audit()` helper function (~62 lines)
- Consolidates: `db.add()` → `flush()` → `log_activity(APPROVAL/CREATE)` → `commit()`
- Handles `IntegrityError` for `ux_approval_pending` unique constraint → 409 response
- Accepts `on_duplicate_detail` parameter for custom error messages

### 2. [risks.py](../../../backend/app/api/v1/endpoints/risks.py) (MODIFY)
- **`update_risk()`**: Replaced 22-line try/except block with 7-line helper call
- **`delete_risk()`**: Replaced 23-line try/except block with 7-line helper call
- Total reduction: ~31 lines

### 3. [kris.py](../../../backend/app/api/v1/endpoints/kris.py) (MODIFY)  
- **`update_kri()`**: Replaced 13-line block with 7-line helper call
- **`delete_kri()`**: Replaced 13-line block with 8-line helper call
- **`record_kri_value()`**: Replaced 19-line try/except with 8-line helper call
- **`correct_history_entry()`**: Replaced 19-line try/except with 8-line helper call
- Total reduction: ~54 lines

## Tests Verified
| Test | Result |
|------|--------|
| `test_risks.py` | 6 passed ✅ |
| `test_kris_rbac.py` | 11 passed ✅ |
| `test_kri_period_protection.py` | 7 passed ✅ |
| `test_approval_workflow.py` | 8 passed ✅ |

## Invariants Preserved
- No RBAC changes
- Archive semantics unchanged (Risk: `status != archived`, KRI: `is_archived == False`)
- Approval payload shapes unchanged
- Status transitions and pending checks unchanged
- Response codes and messages unchanged

## Line Count Impact
| File | Before | After | Δ |
|------|--------|-------|---|
| `approval_helpers.py` | 133 | 195 | +62 |
| `risks.py` | 885 | 854 | -31 |
| `kris.py` | 954 | 900 | -54 |
| **Net** | **1972** | **1949** | **-23** |

Net reduction of ~23 lines, but more importantly consolidated 6 copy-paste blocks into 1 reusable helper.
