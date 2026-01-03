# Phase 150-03 Findings - Frontend Permission & Data Flow Audit

## Scope
- Frontend permission gating: AuthContext, usePermissions, PermissionGate, UsersPage, UserNewPage, ApprovalsPage, route protection.
- Frontend data flows and pagination: Risks, Controls, KRIs, Departments, Audit Trail, and supporting services.
- Out of scope: AD Emulator.

## Summary
- **Critical:** 0
- **High:** 4
- **Medium:** 6
- **Low:** 0

---

## Permission Gating & Role Assumptions

### High — Approvals UI gated by `approvals:write` permission that is not seeded
- **Where:** `frontend/src/hooks/usePermissions.ts:26`, `frontend/src/pages/ApprovalsPage.tsx:23-281`, `backend/app/db/seed.py:26-46`
- **Impact:** Risk managers can resolve approvals via API, but the UI hides approve/reject actions, creating a broken workflow and inconsistent authorization cues.
- **Fix:** Add `approvals:write` to `PERMISSIONS` seed or change frontend gating to align with backend `can_resolve_approvals`.
- **Status:** Known (Phase 7 permission audit), still present.

### High — New user default role can fall back to a privileged role
- **Where:** `frontend/src/pages/UserNewPage.tsx:43-48`, `backend/app/db/seed.py:13-23`
- **Impact:** When the expected `employee` role is missing, the form defaults to the first role returned by the API; role ordering is undefined, so new users can be created with elevated roles unintentionally.
- **Fix:** Seed a safe default role (e.g., `employee` or `control_owner`) and fail if not found; require explicit role selection if missing.
- **Status:** Known (Phase 7 permission audit), still present.

### Medium — User management routes/actions lack permission gating
- **Where:** `frontend/src/App.tsx:33-77`, `frontend/src/pages/UsersPage.tsx:73-81`, `frontend/src/pages/UsersPage.tsx:200-220`, `frontend/src/pages/UserNewPage.tsx:17-76`
- **Impact:** Any authenticated user can navigate to `/users` and `/users/new` and sees edit/deactivate UI actions. Backend blocks unauthorized actions, but the UI exposes admin-only affordances and role lists, creating misleading UX and role enumeration risk.
- **Fix:** Add permission-based route guards for user management, and gate edit/deactivate actions with `canManageUsers` (or show a read-only state).
- **Status:** New.

---

## Data Flow, Pagination, and Response Mismatches

### High — Execution result enum mismatch between frontend and backend
- **Where:** `frontend/src/services/executionApi.ts:5-20`, `frontend/src/pages/AuditTrailPage.tsx:50-105`, `frontend/src/pages/DepartmentDetailPage.tsx:226-234`, `backend/app/models/control_execution.py:8-14`, `backend/app/schemas/control.py:31-36`
- **Impact:** Frontend expects `pass/fail/issues_found`, while backend uses `passed/failed/warning`. Filters return zero results, and status badges/icons render incorrectly.
- **Fix:** Align frontend enum values to backend (`passed/failed/warning/not_applicable`) and update filters/mappings to the same set.
- **Status:** New.

### High — Risk list KRI counts and breach flags are computed from paged data
- **Where:** `frontend/src/pages/RisksPage.tsx:96-109`, `frontend/src/services/kriApi.ts:5-7`, `backend/app/api/v1/endpoints/kris.py:20-27`
- **Impact:** `kriApi.getKRIs({ risk_id })` uses default `size=20`. If a risk has more KRIs, `kri_count` and `has_breach` are undercounted, potentially hiding breached KRIs.
- **Fix:** Use backend-provided `kri_count/has_breach` fields, add a dedicated aggregate endpoint, or request `size` large enough with pagination handling.
- **Status:** New.

### Medium — Critical filter only applies to the current page
- **Where:** `frontend/src/pages/RisksPage.tsx:113-121`
- **Impact:** The `critical=true` view filters only the current page and resets totals to the filtered page length, hiding critical risks on other pages.
- **Fix:** Add a server-side `critical` filter or fetch all results before filtering.
- **Status:** New.

### Medium — Grouped views capped at 100 items, no pagination
- **Where:** `frontend/src/pages/RisksPage.tsx:79-86`, `frontend/src/pages/ControlsPage.tsx:41-50`
- **Impact:** Grouped views (category/department/process) are built from at most 100 records, producing incomplete group counts and drill-downs for larger datasets.
- **Fix:** Implement paginated fetching for grouped views or add server-side grouping endpoints.
- **Status:** Known (AUDIT 2025-12-26), still present.

### Medium — KRIs page fetches max 100 and paginates client-side
- **Where:** `frontend/src/pages/KRIsPage.tsx:22-33`, `frontend/src/pages/KRIsPage.tsx:138-142`
- **Impact:** KRIs beyond the first 100 never appear, and totals are computed from the truncated set.
- **Fix:** Use backend pagination (`page/size`) and surface `total` in UI.
- **Status:** New.

### Medium — Department detail lists are capped at 100 items
- **Where:** `frontend/src/pages/DepartmentDetailPage.tsx:46-52`
- **Impact:** Risks, controls, KRIs, and users are limited to 100 entries with no pagination, leading to incomplete tables and mismatched counts.
- **Fix:** Add pagination for department tabs or request totals from the API.
- **Status:** New.

### Medium — Audit trail list is capped at 50 with no pagination
- **Where:** `frontend/src/pages/AuditTrailPage.tsx:27-44`
- **Impact:** Only the first 50 executions are visible, and there is no way to access older history.
- **Fix:** Add pagination controls and track total count from the backend.
- **Status:** New.

---

## Notes
- All findings are RiskHub-only; no AD Emulator files reviewed or referenced.
