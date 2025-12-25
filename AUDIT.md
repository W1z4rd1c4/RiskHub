# RiskHub Code Audit Report

**Date:** 2025-12-26  
**Audited By:** 10 Parallel Subagents + Main Agent  
**Scope:** Data consistency, API response formats, frontend/backend alignment

---

## Executive Summary

A comprehensive audit was conducted using 10 parallel read-only subagents with 50% overlap across the codebase. The primary issue triggering this audit was verification test failures when checking data consistency across views.

### Root Cause Identified

**API Response Format Inconsistency**: The `/api/v1/risks` and `/api/v1/controls` endpoints return **raw lists**, while `/api/v1/kris` returns a **paginated object** (`{items:[], total:N, page:N, size:N}`). This breaks any client expecting uniform response shapes.

---

## Priority 1: Critical Issues

### 1.1 API Response Format Mismatch
| Endpoint | Returns | Expected by Tests |
|----------|---------|-------------------|
| `GET /risks` | `list[RiskSummary]` | `{items:[], total:N}` |
| `GET /controls` | `list[ControlSummary]` | `{items:[], total:N}` |
| `GET /kris` | `{items:[], total:N}` ✅ | `{items:[], total:N}` |

**Files:** 
- `backend/app/api/v1/endpoints/risks.py:22`
- `backend/app/api/v1/endpoints/controls.py:23`
- `backend/app/api/v1/endpoints/kris.py:19`

**Impact:** Verification tests fail with `'list' object has no attribute 'get'`

---

### 1.2 Migration Script Data Loss Risk
The `migrate_risks.py` script deletes all risks/KRIs/links **before** checking if users exist. If no users exist, the database is left empty.

**File:** `backend/scripts/migrate_risks.py`

**Impact:** Potential data loss during migration

---

### 1.3 Test Fixture Naming Mismatch
Tests reference `async_client` fixture but conftest.py defines `client`.

**Files:**
- `backend/tests/test_data_consistency.py` - uses `async_client`
- `backend/tests/conftest.py:106` - defines `client`

**Impact:** All consistency tests fail with `fixture 'async_client' not found`

---

## Priority 2: High Severity Issues

### 2.1 KRI Count Includes Archived Risks
Department `kri_count` includes KRIs attached to archived risks, while `risk_count` excludes archived risks.

**Files:**
- `backend/app/api/v1/endpoints/departments.py:63-68` (kri_count - no archive filter)
- `backend/app/api/v1/endpoints/departments.py:52` (risk_count - excludes archived)

**Impact:** `kri_count` can be higher than visible risks, causing user confusion

---

### 2.2 Department KRI List Includes Archived Risks
`/departments/{id}/kris` returns KRIs for all risks including archived, while `/departments/{id}/risks` excludes archived.

**File:** `backend/app/api/v1/endpoints/departments.py:359-367`

**Impact:** Count vs list mismatch for archived risk scenarios

---

### 2.3 No Total Count for Risks/Controls
Risks and controls endpoints don't compute or return total count, making pagination navigation impossible.

**Files:**
- `backend/app/api/v1/endpoints/risks.py:22` - no count query
- `backend/app/api/v1/endpoints/controls.py:23` - no count query

**Impact:** Frontend guesses total from page length, leading to incorrect navigation

---

### 2.4 KRI Breach Filter Applied Post-Pagination
`breach_only` filter is applied **after** pagination and **after** total is computed, so `total` doesn't reflect filtered count.

**File:** `backend/app/api/v1/endpoints/kris.py:59`

**Impact:** Pagination metadata incorrect when filtering breaches

---

## Priority 3: Medium Severity Issues

### 3.1 Frontend 100-Item Limit
Grouped views (By Category, Department, Process) fetch maximum 100 items with no pagination, causing incomplete data display.

**Files:**
- `frontend/src/pages/RisksPage.tsx:44`
- `frontend/src/pages/ControlsPage.tsx:42`
- `frontend/src/pages/KRIsPage.tsx:22-33`

**Impact:** Data truncation when >100 items exist

---

### 3.2 Department Process Code Collision
Migration script reuses existing department with same 3-letter code instead of creating distinct one.

**File:** `backend/scripts/migrate_risks.py`

**Impact:** Risks linked to wrong departments

---

### 3.3 KRI Round-Robin Fallback
When category/process matching fails, KRIs are assigned via round-robin, attaching them to potentially unrelated risks.

**File:** `backend/scripts/seed_kris.py`

**Impact:** Poor data integrity in KRI-Risk relationships

---

### 3.4 AsyncIO/Greenlet Issues in Tests
`conftest.py` accesses lazy-loaded relationships on ORM objects which can trigger `MissingGreenlet` errors.

**File:** `backend/tests/conftest.py:101`

**Impact:** Intermittent test failures

---

### 3.5 Filter State Not Reset on View Change
Changing view mode doesn't reset `currentPage`, causing users to land on empty results.

**Files:**
- `frontend/src/pages/RisksPage.tsx:31,35`
- `frontend/src/pages/ControlsPage.tsx:32,34`

---

### 3.6 Department Risks Missing KRI Metadata
`/departments/{id}/risks` returns `RiskSummary` but doesn't populate `kri_count` and `has_breach`.

**File:** `backend/app/api/v1/endpoints/departments.py:305-312`

---

## Priority 4: Low Severity Issues

### 4.1 Consistency Checks Capped at 1000
Verification scripts don't paginate beyond 1000 items.

**File:** `backend/scripts/verify_data_consistency.py`

---

### 4.2 Undefined Grouping Buckets
`CategoryDrillDown` doesn't guard against undefined/null group fields.

**File:** `frontend/src/pages/KRIsPage.tsx:116-245`

---

### 4.3 Column Sort Key Mismatch
KRIs column in RisksPage reuses `key: 'id'`, causing sort by risk ID instead of KRI count.

**File:** `frontend/src/pages/RisksPage.tsx:207`

---

### 4.4 Archived Status Not Filterable
Status filters omit "archived" option despite archived items being renderable.

**Files:**
- `frontend/src/pages/RisksPage.tsx:118`
- `frontend/src/pages/ControlsPage.tsx:97`

---

## Recommended Fix Order

1. **Standardize API response format** - Add paginated wrapper to risks/controls
2. **Fix test fixture names** - Rename `async_client` to `client`
3. **Add archived risk filter** to KRI count/list queries
4. **Move migration user check** before destructive operations
5. **Apply breach filter before pagination** in KRIs endpoint
6. **Add total count queries** to risks/controls endpoints
7. **Remove 100-item limit** or add server-side aggregation for grouped views
8. **Reset page state** when view mode changes

---

## Subagent Coverage Matrix

| Agent | Focus Area | Status | Key Findings |
|-------|------------|--------|--------------|
| 1 | Risks API | ✅ Done | Raw list, no total count, archive filter inconsistency |
| 2 | Controls API | ✅ Done | Raw list, no pagination wrapper |
| 3 | KRIs API | ✅ Done | Paginated ✓, breach filter post-pagination |
| 4 | Departments API | ✅ Done | KRI counts include archived, response format varies |
| 5 | Frontend Services | ✅ Done | Mixed pagination expectations |
| 6 | Risk/Control Pages | ✅ Done | Guessed totals, 100-item limit |
| 7 | KRI/Dept Pages | ✅ Done | Count mismatch >100 items |
| 8 | Schemas | ✅ Done | No list wrapper schemas |
| 9 | Scripts | ✅ Done | Destructive order, code collision |
| 10 | Tests | ✅ Done | Fixture mismatch, MissingGreenlet |

---

*Generated by parallel read-only audit - no files modified*
