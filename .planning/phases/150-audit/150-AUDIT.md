# Phase 150 Audit Report (RiskHub-only)

**Date:** 2025-12-29  
**Scope:** RiskHub frontend + backend (AD Emulator excluded)  
**Inputs:** `150-02-FINDINGS.md`, `150-03-FINDINGS.md`  
**Note:** `150-01-FINDINGS.md` is not available yet (backend auth/permissions audit pending).

---

## Severity Summary

| Severity | Count | Notes |
|----------|-------|-------|
| Critical | 0 | - |
| High | 4 | Authorization mismatches and audit-trail correctness issues |
| Medium | 6 | Archived-data consistency and pagination gaps |
| Low | 5 | Reporting/consistency and tooling edge cases |

---

## Priority Findings (Ordered)

1. **High — Execution result enum mismatch (frontend vs backend)**  
   **Where:** `frontend/src/services/executionApi.ts:5-20`, `frontend/src/pages/AuditTrailPage.tsx:50-105`, `frontend/src/pages/DepartmentDetailPage.tsx:226-234`, `backend/app/models/control_execution.py:8-14`, `backend/app/schemas/control.py:31-36`  
   **Impact:** Audit trail filters fail and result badges render incorrectly; execution logging can send invalid values.  
   **Fix:** Standardize on `passed/failed/warning/not_applicable` across frontend and backend.

2. **High — Default role fallback can assign privileged roles**  
   **Where:** `backend/app/services/directory_sync_service.py:77-88`, `frontend/src/pages/UserNewPage.tsx:43-48`, `backend/app/db/seed.py:13-23`  
   **Impact:** When a safe default role is missing, both directory sync and new-user flow can fall back to the first role, unintentionally granting elevated access.  
   **Fix:** Require explicit safe default role (`employee` or `control_owner`) and fail fast if missing.

3. **High — Approvals UI gated by missing `approvals:write` permission**  
   **Where:** `backend/app/db/seed.py:26-46`, `frontend/src/hooks/usePermissions.ts:26`, `frontend/src/pages/ApprovalsPage.tsx:23-281`  
   **Impact:** Risk managers can resolve approvals via API but cannot in UI; workflow appears broken.  
   **Fix:** Seed `approvals:write` or align frontend gating with backend `can_resolve_approvals`.

4. **High — Risk list KRI count/breach flags derived from paged data**  
   **Where:** `frontend/src/pages/RisksPage.tsx:96-109`, `frontend/src/services/kriApi.ts:5-7`, `backend/app/api/v1/endpoints/kris.py:20-27`  
   **Impact:** KRI counts and breach indicators can be underreported, hiding breaches on risks with many KRIs.  
   **Fix:** Use backend aggregates or fetch all pages when computing per-risk summaries.

5. **Medium — Dashboard metrics include archived risks/controls**  
   **Where:** `backend/app/api/v1/endpoints/dashboard.py:83-166`, `backend/app/api/v1/endpoints/dashboard.py:169-231`, `backend/app/api/v1/endpoints/dashboard.py:234-280`, `backend/app/api/v1/endpoints/dashboard.py:364-409`  
   **Impact:** Executive metrics diverge from list views that exclude archived items.  
   **Fix:** Exclude archived by default; allow explicit `include_archived=true`.

6. **Medium — Department controls list/count include archived by default**  
   **Where:** `backend/app/api/v1/endpoints/departments.py:94-99`, `backend/app/api/v1/endpoints/departments.py:401-406`  
   **Impact:** Department summaries and drill-downs show totals that exceed visible controls.  
   **Fix:** Default filter to exclude archived or add an explicit flag.

7. **Medium — Unauthenticated lookup endpoint**  
   **Where:** `backend/app/api/v1/endpoints/lookups.py:1-20`  
   **Impact:** Cross-department metadata is exposed without authentication/scoping.  
   **Fix:** Require `get_current_user` and apply department scoping.

8. **Medium — `seed_kris.py` destructive delete + round-robin fallback**  
   **Where:** `backend/scripts/seed_kris.py:47-56`, `backend/scripts/seed_kris.py:130-135`  
   **Impact:** Data loss if prerequisites missing; KRIs can be linked to unrelated risks.  
   **Fix:** Validate prerequisites before delete; require explicit mappings or skip unmatched entries.

9. **Medium — Frontend list truncation due to hard-coded limits**  
   **Where:** `frontend/src/pages/RisksPage.tsx:79-86`, `frontend/src/pages/ControlsPage.tsx:41-50`, `frontend/src/pages/KRIsPage.tsx:22-33`, `frontend/src/pages/DepartmentDetailPage.tsx:46-52`, `frontend/src/pages/AuditTrailPage.tsx:27-44`  
   **Impact:** Grouped views and tabs can silently omit data above 50-100 items.  
   **Fix:** Implement pagination or server-side grouping/aggregation.

10. **Medium — Critical filter applies only to current page**  
    **Where:** `frontend/src/pages/RisksPage.tsx:113-121`  
    **Impact:** “Critical” view can hide critical risks outside the current page.  
    **Fix:** Add server-side filtering or fetch all results before filtering.

11. **Low — KRI breach list includes archived risks**  
    **Where:** `backend/app/api/v1/endpoints/kris.py:79-108`  
    **Impact:** Breach widgets can show KRIs tied to archived risks.  
    **Fix:** Exclude archived risks by default.

12. **Low — Control summary response shape mismatch**  
    **Where:** `backend/app/api/v1/endpoints/departments.py:381-409`, `backend/app/schemas/control.py:122-133`  
    **Impact:** Department control lists can omit `department_name` and `control_owner_name`.  
    **Fix:** Populate summary fields consistently with `/controls`.

13. **Low — Dashboard control trend errors are swallowed**  
    **Where:** `backend/app/api/v1/endpoints/dashboard.py:292-361`  
    **Impact:** Errors return empty trends, masking defects.  
    **Fix:** Log and differentiate error vs empty data.

14. **Low — Orphaned item timestamps mix naive vs UTC**  
    **Where:** `backend/app/services/orphaned_item_service.py:163-164`, `backend/app/services/orphaned_item_service.py:201-202`, `backend/app/services/orphaned_item_service.py:246-247`, `backend/app/services/orphaned_item_service.py:471-473`  
    **Impact:** Inconsistent ordering and timezone drift.  
    **Fix:** Use UTC-aware timestamps consistently.

15. **Low — `verify_data_consistency.py` uses unsupported `size` param and counts incorrectly**  
    **Where:** `backend/scripts/verify_data_consistency.py:30-33`, `backend/scripts/verify_data_consistency.py:52-54`, `backend/scripts/verify_data_consistency.py:94-101`  
    **Impact:** False positives/negatives in consistency checks.  
    **Fix:** Use `skip/limit` paging and `total` from API.

---

## Fix Order Recommendation

**Quick wins (low effort, high impact):**
1. Align execution result enums (Item 1).
2. Seed `approvals:write` (Item 3).
3. Enforce safe default role selection (Item 2).
4. Add critical filter server-side (Item 10).

**Medium effort:**
5. Exclude archived items in dashboard and department summaries (Items 5-6).
6. Protect lookup endpoint (Item 7).
7. Fix KRI count/breach aggregation and list truncation (Items 4, 9).

**Deeper refactors / tooling:**
8. Improve seed scripts and verification tooling (Items 8, 15).
9. Cleanup low-severity consistency issues (Items 11-14).

---

## Coverage Gap

- Phase 150-01 (backend auth/permissions audit) is still pending; findings above may not cover auth-specific issues.
