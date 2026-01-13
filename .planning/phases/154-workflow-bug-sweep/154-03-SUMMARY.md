# Phase 154-03 Summary: API Contract Fixes

**Completed:** 2026-01-13  
**Duration:** ~5 minutes

---

## What Was Accomplished

### Task 1: Process/Category Filters Added to GET /risks ✅

Updated `backend/app/api/v1/endpoints/risks.py`:

**New Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `process` | `string` (optional) | Filter by exact process name match |
| `category` | `string` (optional) | Filter by exact category match |

**Implementation:**
- Added params to endpoint signature (lines 97-98)
- Added filter logic after existing net_score filter (lines 176-183)
- Uses exact match (`==`) for consistency with how the UI builds filter dropdowns from distinct values

### Task 2: RiskBriefForLink Schema Aligned ✅

Updated `backend/app/schemas/risk.py`:

Added `description: str` field to `RiskBriefForLink` (line 196).

**Before:**
```python
class RiskBriefForLink(BaseModel):
    id: int
    risk_id_code: str
    name: str
    process: str
    gross_score: int
    net_score: int
```

**After:**
```python
class RiskBriefForLink(BaseModel):
    id: int
    risk_id_code: str
    name: str
    process: str
    description: str  # NEW: Used by ControlDetailPage and ExistingLinksPanel
    gross_score: int
    net_score: int
```

---

## Verification Results

```bash
cd backend && pytest -q tests/test_risks.py
# Result: 6/6 passed

cd backend && pytest -q tests/test_cross_department_access.py
# Result: 10/10 passed
```

---

## Files Modified

| File | Changes |
|------|---------|
| [risks.py](../../../backend/app/api/v1/endpoints/risks.py) | Added `process` and `category` query params + filter logic |
| [risk.py](../../../backend/app/schemas/risk.py) | Added `description` to `RiskBriefForLink` |

---

## DISCOVERY.md Issues Addressed

| Issue # | Status |
|---------|--------|
| 5 | ✅ Fixed: Link dialog process/category filters now work |
| 6 | ✅ Fixed: Control-linked risks now include description in response |

---

*Phase 154-03 complete. Ready for 154-04 (frontend 202 response handling).*
