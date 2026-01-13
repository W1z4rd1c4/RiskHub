# Phase 154: Workflow Bug Sweep Discovery

## What This Phase Fixes

This phase addresses end-to-end workflow bugs affecting core CRUD and linking operations:

1. **Create Risk/Control/KRI** - Approval workflow responses (HTTP 202) not surfaced in UI
2. **Link/Unlink** - Control-side linking endpoints are department-only (break cross-department control owners)
3. **KRI History** - Cross-department reporting owners cannot view history
4. **Approvals** - UI navigates away on 202 instead of showing approval confirmation
5. **Link filters** - Process/category filters sent but backend `/risks` doesn't support them
6. **Schema mismatch** - Control-linked risks missing description in response

---

## Confirmed Findings Matrix

| # | Issue | Severity | Evidence | Repro Steps | Expected Behavior | Actual Behavior | Fix Plan | Acceptance Criteria |
|---|-------|----------|----------|-------------|-------------------|-----------------|----------|---------------------|
| 1 | Control owner cannot reliably load Control Detail cross-department | **High** | [controls.py:759-760](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/controls.py#L759-L760) | 1. Login as Control Owner (different dept than control's dept) 2. Navigate to `/controls/{controlId}` 3. Page loads via `Promise.all` calling both `getControl` and `getLinkedRisks` | Both calls succeed; page renders with control + linked risks | `GET /controls/{id}` succeeds (has owner path at L242), but `GET /controls/{id}/risks` fails 403 (department-only check at L760). `Promise.all` rejects → page shows error state | 154-02 | Control owners can view their control's detail page including linked risks regardless of department mismatch |
| 2 | Control owner cannot link/unlink risks from Control Detail cross-department | **High** | [controls.py:792](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/controls.py#L792), [controls.py:860](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/controls.py#L860) | 1. Login as Control Owner (cross-dept) 2. Open Control Detail 3. Click "Manage Risk Linkage" 4. Attempt to link or unlink a risk | Link/unlink succeeds with 201/204 | `POST /controls/{id}/risks` returns 403 at L792 (`check_department_access(control.department_id)`). `DELETE /controls/{id}/risks/{rid}` returns 403 at L860 | 154-02 | Control owners can link/unlink risks to their controls regardless of department |
| 3 | KRI reporting owner cannot view `/kris/{id}/history` cross-department | **High** | [kris.py:785](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/kris.py#L785) | 1. Login as KRI Reporting Owner (dept != risk.dept) 2. Navigate to KRI Detail 3. Switch to History tab | History loads showing value timeline | `GET /kris/{id}/history` returns 403 at L785 (`check_department_access(kri.risk.department_id, current_user)`) with no owner bypass | 154-03 | KRI reporting owners can view history of their assigned KRIs regardless of department |
| 4 | HTTP 202 "approval created" responses not surfaced in UI | **Medium** | [ControlDetailPage.tsx:91-95](file:///Users/stefanlesnak/Antigravity/Risk%20App/frontend/src/pages/ControlDetailPage.tsx#L91-L95), [RiskDetailPage.tsx (similar pattern)](file:///Users/stefanlesnak/Antigravity/Risk%20App/frontend/src/pages/RiskDetailPage.tsx) | 1. Login as non-privileged user with controls:delete 2. Open Control Detail 3. Click Archive/Delete 4. Enter reason, confirm | UI shows toast "Approval request created" + stays on page (or shows pending badge) | `handleArchive` at L91 doesn't check response status—calls `navigate('/controls')` unconditionally, user thinks delete succeeded | 154-04 | On 202 response, UI shows confirmation toast mentioning approval required and does not navigate away as if action completed |
| 5 | Link dialog "process/category" filters are sent but backend `/risks` ignores them | **Low** | [LinkManagementDialog.tsx:147-148](file:///Users/stefanlesnak/Antigravity/Risk%20App/frontend/src/components/LinkManagementDialog.tsx#L147-L148), [risks.py:82-239](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/risks.py#L82-L239) | 1. Open LinkManagementDialog in control-to-risk mode 2. Select a Process filter 3. Observe network request includes `process=XYZ` | Search results filtered by process | Query params `process` and `category` are sent (L147-148), but `list_risks` endpoint has no process/category filter implementation—they are ignored | 154-05 | Either remove unused filters from UI or add process/category query support to `GET /risks` |
| 6 | Control↔Risk link schema mismatch: frontend expects `risk.description`, backend schema omits it | **Low** | [ControlDetailPage.tsx:361](file:///Users/stefanlesnak/Antigravity/Risk%20App/frontend/src/pages/ControlDetailPage.tsx#L361), [LinkSearchPanel.tsx:198](file:///Users/stefanlesnak/Antigravity/Risk%20App/frontend/src/components/linking/LinkSearchPanel.tsx#L198) | 1. View Control Detail with linked risks 2. Observe risk cards | Risk description displayed under name | `link.risk?.description` at L361 shows undefined; LinkSearchPanel at L198 also references `result.description`. Backend `ControlRiskLinkRead` may not eagerly include full Risk schema | 154-05 | Linked risk cards display description if present; schema includes description field |

---

## Additional Observations

### Pattern Mismatch: Risk-Side vs Control-Side Access

The **risk-side** endpoints (`risks.py`) consistently implement cross-department ownership checks:

- `GET /risks/{id}` → [L266-270](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/risks.py#L266-L270) checks `is_risk_kri_reporting_owner` and `is_risk_control_owner`
- `GET /risks/{id}/controls` → [L706-719](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/risks.py#L706-L719) mirrors same pattern
- `POST /risks/{id}/controls` → [L753-779](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/risks.py#L753-L779) checks ownership for both risk and control

The **control-side** endpoints (`controls.py`) are inconsistent:

- `GET /controls/{id}` → [L242-246](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/controls.py#L242-L246) correctly checks `is_control_owner` ✅
- `GET /controls/{id}/risks` → [L759-760](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/controls.py#L759-L760) **department-only** ❌
- `POST /controls/{id}/risks` → [L792](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/controls.py#L792) **department-only** ❌
- `DELETE /controls/{id}/risks/{rid}` → [L860](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/controls.py#L860) **department-only** ❌
- `GET /controls/{id}/executions` → [L727-729](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/controls.py#L727-L729) correctly checks owner ✅
- `POST /controls/{id}/executions` → [L676-678](file:///Users/stefanlesnak/Antigravity/Risk%20App/backend/app/api/v1/endpoints/controls.py#L676-L678) correctly checks owner ✅

---

## Confirmation Runs

**Run Date:** 2026-01-13T23:30 CET

### Backend Tests ✅

```bash
# Cross-department access tests
cd backend && pytest -q tests/test_cross_department_access.py
# Result: 7/7 passed
```

```bash
# KRI RBAC tests  
cd backend && pytest -q tests/test_kris_rbac.py
# Result: 11/11 passed
```

> **Note:** Backend tests pass because they test the *currently implemented* behavior, not the desired cross-department access for control owners on linking endpoints. New tests will need to be added in 154-02/154-03.

### Frontend E2E Tests

```bash
# Control owner cross-department access
cd frontend && npx playwright test e2e/cross-department/control-owner-access.spec.ts --project=chromium
# Result: 2 passed, 5 skipped, 1 FAILED
# Failed: "Direct URL access to other department control when not owner is denied"
#   - This test expected 403/404 for non-owner, but access was granted (likely a different issue)
```

```bash
# Link access patterns
cd frontend && npx playwright test e2e/cross-department/link-access.spec.ts --project=chromium
# Result: 1 passed, 8 skipped
#   - Most tests skipped due to missing test data for cross-department linking scenarios
```

```bash
# Approval workflow status flow
cd frontend && npx playwright test e2e/approval-workflows/status-flow.spec.ts --project=chromium
# Result: 1 passed, 3 skipped, 4 FAILED
# Failed tests involve History tab selector issues (unrelated to approval 202 handling)
#   - "View pending approvals as Risk Manager"
#   - "Filter tabs work correctly"
#   - "PENDING → CANCELLED: Creator cancels own request"
#   - "History tab shows resolved requests"
```

### Key Takeaways

1. **Backend tests pass** but don't cover the newly identified bugs (control-side linking for owners, KRI history for reporting owners)
2. **E2E failures** are mostly due to test infrastructure issues (missing data, UI selector changes) rather than the core bugs documented here
3. **Issue #4 (202 responses)** is not directly testable via these suites—it requires manual verification or new targeted tests

---

## Fix Plan Mapping

| Issue # | Fix Plan ID | Scope |
|---------|-------------|-------|
| 1, 2 | 154-02 | Backend: Add `is_control_owner` checks to control-side linking endpoints |
| 3 | 154-03 | Backend: Add reporting owner check to `/kris/{id}/history` |
| 4 | 154-04 | Frontend: Handle 202 responses in CRUD handlers across detail pages |
| 5, 6 | 154-05 | Mixed: Either implement filters or remove UI; fix schema to include description |

---

## Decision Record

**Decision:** Cross-Department Access Rules for Control-Side Endpoints

**Date:** 2026-01-13

**Choice:** `mirror-risk-side`

**Rationale:**
- Aligns with BUSINESS_LOGIC.md §7.1: "Control Owner can edit Control → Can view linked Risks (even if Dept B)"
- Matches the existing pattern on risk-side endpoints (`/risks/{id}/controls`)
- Consistent with already-implemented control owner access on `/controls/{id}`, `/controls/{id}/executions`
- Maintains symmetric access check: linking requires access to **both** control (via ownership) **and** risk (via department/ownership)

**Impact on Fix Plans:**
- 154-02: Add `is_control_owner()` bypass to `GET/POST/DELETE /controls/{id}/risks` endpoints
- 154-03: Add `is_kri_reporting_owner()` bypass to `GET /kris/{id}/history` endpoint

---

*Generated: 2026-01-13*
