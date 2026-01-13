# Phase 154-01 Summary: Workflow Bug Sweep Discovery

**Completed:** 2026-01-13  
**Duration:** ~15 minutes

---

## What Was Accomplished

### Task 1: DISCOVERY.md Created ✅

Documented **6 confirmed workflow bugs** with:
- File:line evidence for each issue
- Repro steps (role + UI path + API call)
- Expected vs actual behavior
- Acceptance criteria
- Fix plan assignment (154-02 through 154-05)

**Issues Identified:**

| # | Issue | Severity |
|---|-------|----------|
| 1 | Control owner cannot load Control Detail cross-department (Promise.all fails) | High |
| 2 | Control owner cannot link/unlink risks (control-side endpoints department-only) | High |
| 3 | KRI reporting owner cannot view history cross-department | High |
| 4 | HTTP 202 approval responses not surfaced in UI | Medium |
| 5 | Link dialog process/category filters ignored by backend | Low |
| 6 | Control-linked risks missing description in schema | Low |

### Task 2: Confirmation Runs ✅

**Backend Tests:**
- `test_cross_department_access.py`: 7/7 passed
- `test_kris_rbac.py`: 11/11 passed

**E2E Tests:**
- `control-owner-access.spec.ts`: 2 passed, 5 skipped, 1 failed (unrelated)
- `link-access.spec.ts`: 1 passed, 8 skipped (missing test data)
- `status-flow.spec.ts`: 1 passed, 3 skipped, 4 failed (UI selector issues)

### Task 3: Decision Checkpoint ✅

**Decision:** Cross-Department Access Rules

**Choice:** `mirror-risk-side`

**Summary:** Control-side endpoints will add `is_control_owner()` checks to match the pattern already used on risk-side endpoints, aligning with BUSINESS_LOGIC.md §7.

---

## Artifacts Produced

| File | Description |
|------|-------------|
| [DISCOVERY.md](file:///.planning/phases/154-workflow-bug-sweep/DISCOVERY.md) | Confirmed issues matrix with evidence and acceptance criteria |
| [154-01-SUMMARY.md](file:///.planning/phases/154-workflow-bug-sweep/154-01-SUMMARY.md) | This summary |

---

## Next Steps

| Plan | Scope | Priority |
|------|-------|----------|
| **154-02** | Backend: Add `is_control_owner()` to control-side linking endpoints | High |
| **154-03** | Backend: Add `is_kri_reporting_owner()` to KRI history endpoint | High |
| **154-04** | Frontend: Handle 202 responses in CRUD handlers | Medium |
| **154-05** | Mixed: Fix link filters or remove UI; fix schema for description | Low |

---

*Phase 154-01 complete. Ready for 154-02.*
