# Summary: Backend API & Logic Updates (Risk Name)

**Phase**: 200 Entity Naming Enforcement  
**Plan**: 200-02  
**Date**: 2026-01-04

## Objective
Update the Backend API to support and enforce the new `name` field for Risks and `description` field for KRIs.

## Changes Made

### Pydantic Schemas
- **[risk.py](../../../backend/app/schemas/risk.py)**:
  - Added `name: str = Field(..., max_length=255)` to `RiskBase`
  - Added `name: Optional[str]` to `RiskUpdate`
  - Added `name: str` to `RiskSummary`
  - Added `name: str` to `RiskBriefForLink`

- **[kri.py](../../../backend/app/schemas/kri.py)**:
  - Added `description: str = Field(...)` to `KRIBase`
  - Added `description: Optional[str]` to `KRIUpdate`
  - `KRIResponse` inherits description from `KRIBase`

### Test Updates
- **[conftest.py](../../../backend/tests/conftest.py)**: Added `name` to `test_risk` fixture
- **[test_risks.py](../../../backend/tests/test_risks.py)**: Added `name` to all risk creation payloads
- **[test_kris_rbac.py](../../../backend/tests/test_kris_rbac.py)**: Added `name` to Risk fixtures, `description` to KRI fixtures and API payloads

## Verification
- ✅ KRI RBAC tests pass (8/8): `pytest tests/test_kris_rbac.py`
- ⚠️ Risk tests have pre-existing issues (unrelated to name field):
  - API validates `risk_type` against dynamic Risk Hub configuration
  - Tests don't seed `risk_types` table

## Pre-Existing Issue Logged
> **ISSUES.md**: Risk API tests fail due to dynamic risk_type validation. Tests need to seed risk_types table or use valid risk type codes.

## Impact
- All Risk API endpoints now require `name` field for creation
- All KRI API endpoints now require `description` field for creation
- Existing data already has these fields backfilled from 200-01 migration

## Next Steps
- Phase 200-03: Frontend Risk List & Table Updates to display the new `name` field
