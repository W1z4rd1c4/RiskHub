# Phase 71-03 Findings - Risk Hub Frontend Audit

## Scope
- **Routing and gating:** `frontend/src/App.tsx`, `frontend/src/pages/RiskHubPage.tsx`, `frontend/src/pages/AdminConsolePage.tsx`, `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/contexts/AuthContext.tsx`, `frontend/src/hooks/usePermissions.ts`, `frontend/src/components/PermissionGate.tsx`
- **Risk Hub UI + API alignment:** `frontend/src/services/riskHubApi.ts`, `frontend/src/components/riskhub/SystemSettingsPanel.tsx`, `frontend/src/components/riskhub/RiskTypesPanel.tsx`, `frontend/src/components/riskhub/ApprovalScenariosPanel.tsx`, `frontend/src/components/riskhub/RolesPanel.tsx`, `frontend/src/components/riskhub/DepartmentsPanel.tsx`
- **Risk flows:** `frontend/src/types/risk.ts`, `frontend/src/services/riskApi.ts`, `frontend/src/components/RiskForm.tsx`, `frontend/src/pages/RisksPage.tsx`, `frontend/src/pages/RiskDetailPage.tsx`, `frontend/src/components/RiskScoreMatrix.tsx`
- **Out of scope:** AD Emulator

## Summary
- **Critical:** 0
- **High:** 1
- **Medium:** 3
- **Low:** 1

---

## Route and nav gating

- `frontend/src/App.tsx:46-98` - No issues found. All business routes (including Risk Hub and Admin Console) are under `ProtectedRoute` authentication gating.
- `frontend/src/pages/RiskHubPage.tsx:18-25` - No issues found. CRO-only guard redirects non-CRO users.
- `frontend/src/pages/AdminConsolePage.tsx:338-345` - No issues found. Admin-only guard redirects non-admin users.
- `frontend/src/components/layout/Sidebar.tsx:103-137` - No issues found. Sidebar hides Risk Hub for non-CRO users and Admin Console for non-admin users.
- `frontend/src/contexts/AuthContext.tsx:91-108` - No issues found. `isAuthenticated` requires both token and loaded user, preventing role gating from running before user data is available.

---

## UI and API alignment findings

### 1) High - Risk type configuration is not used in risk forms, filters, or typing
- **Evidence:** `frontend/src/types/risk.ts:3-7`, `frontend/src/services/riskApi.ts:14-24`, `frontend/src/components/RiskForm.tsx:287-295`, `frontend/src/pages/RisksPage.tsx:243-251`, `frontend/src/pages/RisksPage.tsx:417-425`, `frontend/src/pages/RiskDetailPage.tsx:370-374`
- **Impact:** CRO-configured risk types (from Risk Hub) cannot be selected in create/edit flows, do not appear in list filters, and are not represented in frontend typing. This makes Risk Hub configuration ineffective for core risk workflows and can mislabel or hide non-default types returned from the backend.
- **Fix:** Fetch risk types from `riskHubApi.getRiskTypes()` and use them to drive the Risk form selector, list filters, and display labels/colors. Replace the hardcoded `RiskType` union with a dynamic type (or store config in context and use `string` with validation).

### 2) Medium - Risk score thresholds are hardcoded and ignore System Settings
- **Evidence:** `frontend/src/pages/RisksPage.tsx:171-175`, `frontend/src/components/RiskScoreMatrix.tsx:27-30`, `frontend/src/components/RiskScoreMatrix.tsx:100-103`
- **Impact:** Even if the CRO adjusts Risk Hub threshold settings, the UI still uses fixed values (16/10/5). This can cause visible discrepancies between configured policy and displayed risk severity.
- **Fix:** Load threshold values from `riskHubApi` config (risk_thresholds category or public-config) and pass them into list badges and `RiskScoreMatrix`, with safe defaults when config is missing.

### 3) Medium - Approval scenario role picker is static and cannot represent dynamic roles
- **Evidence:** `frontend/src/components/riskhub/ApprovalScenariosPanel.tsx:8-15`, `frontend/src/components/riskhub/ApprovalScenariosPanel.tsx:94-109`
- **Impact:** Roles created in Risk Hub cannot be selected as approvers in the UI. Existing scenarios with non-listed roles are hard to manage because the dropdown only shows a fixed list.
- **Fix:** Populate role options from the backend (e.g., `riskHubApi.getRoles()`) and merge with a special-case `risk_owner` option if needed. Preserve unknown roles in the selection list so they can be retained or re-added.

### 4) Medium - Role edits can wipe permissions if the permissions list is not loaded
- **Evidence:** `frontend/src/components/riskhub/RolesPanel.tsx:28-35`, `frontend/src/components/riskhub/RolesPanel.tsx:63-74`, `frontend/src/components/riskhub/RolesPanel.tsx:207-210`, `frontend/src/components/riskhub/RolesPanel.tsx:388-392`
- **Impact:** If the user opens the Role modal before the permissions query resolves, `allPermissions` is empty, resulting in no checkboxes selected and `permission_ids: []` on save. This can unintentionally remove all permissions from a role.
- **Fix:** Gate the modal on permissions loading (show a loader or disable save until permissions are available) and avoid submitting updates when permissions are not yet loaded.

### 5) Low - Department manager cannot be cleared once set
- **Evidence:** `frontend/src/components/riskhub/DepartmentsPanel.tsx:19-41`, `frontend/src/components/riskhub/DepartmentsPanel.tsx:94-97`
- **Impact:** Selecting "No Manager" sets `managerId` to `undefined`, which omits `manager_id` from the update payload. This prevents clearing a previously assigned manager.
- **Fix:** Send `manager_id: null` when the select is cleared so the backend can remove the manager assignment.
