# Plan 250-01 Summary: Simplify `riskhub.py`

## Completed

Successfully extracted inline Pydantic schemas from `riskhub.py` and converted repeated CRO gating into a FastAPI dependency.

## Changes Made

### New File: [riskhub.py](../../../backend/app/schemas/riskhub.py)
Created `backend/app/schemas/riskhub.py` containing 12 schema classes:
- **Risk Types**: `RiskTypeRead`, `RiskTypeCreate`, `RiskTypeUpdate`, `PublicRiskTypeRead`
- **Global Config**: `GlobalConfigRead`, `GlobalConfigUpdate`
- **Approval Scenarios**: `ApprovalScenarioRead`, `ApprovalScenarioUpdate`
- **Roles & Permissions**: `RoleHubRead`, `RoleHubCreate`, `RoleHubUpdate`, `PermissionHubRead`
- **Departments**: `DepartmentHubRead`, `DepartmentHubCreate`, `DepartmentHubUpdate`

All schemas use Pydantic v2 `model_config = ConfigDict(from_attributes=True)` instead of the deprecated v1 `class Config` pattern.

### Modified: [riskhub.py](../../../backend/app/api/v1/endpoints/riskhub.py)
- Removed all inline schema definitions
- Added `get_cro_user` FastAPI dependency that combines authentication with CRO role check
- Updated 23 CRO-only endpoints to use the new dependency pattern
- Reduced file size from **1510 → 1327 lines** (-183 lines, 12% reduction)

### Dependency Pattern Change
```python
# Before (per-endpoint check):
async def list_risk_types(current_user: User = Depends(get_current_user)):
    require_cro(current_user)  # Manual check
    ...

# After (single dependency):
async def list_risk_types(cro_user: User = Depends(get_cro_user)):
    # CRO check happens automatically in dependency
    ...
```

## Verification

| Test Suite | Result |
|------------|--------|
| `test_riskhub_risk_types.py` | ✅ Passed |
| `test_riskhub_departments.py` | ✅ Passed |
| `test_riskhub_roles.py` | ✅ Passed |
| `test_riskhub_public_risk_types.py` | ✅ Passed |
| `test_riskhub_public_config.py` | ✅ Passed |

**Total: 30 tests passed**

## Commit
```
8bbbde8 feat(250-01): Extract riskhub schemas and CRO dependency
```

## Invariants Preserved
- ✅ All route paths, HTTP methods, status codes unchanged
- ✅ CRO access semantics unchanged (`RoleType.cro_only_roles()` still source of truth)
- ✅ No changes to DB queries or ordering behavior
- ✅ No new "generic base router/service" abstractions introduced
