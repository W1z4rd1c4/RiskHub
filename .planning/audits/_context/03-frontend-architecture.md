# Phase 1 — Frontend Architecture Map (current state)

Pure mapping of `frontend/src/` as it exists at HEAD (post-`Fix RiskHub contract triage findings`). Every claim cites `file:line` and quotes ≤15 words. No verification of audit findings, no recommendations.

---

## 1. File-tree inventory (counts)

- Total `*.ts`/`*.tsx` under `frontend/src/`: **542** (`find frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) | wc -l`)
- `frontend/src/components/`: **253**
- `frontend/src/pages/`: **152**
- `frontend/src/services/`: **69**
- `frontend/src/hooks/`: **11**
- Top-level component subdirectories (per `ls frontend/src/components/`):
  - `access`, `activity-log`, `control-form`, `controls`, `dashboard`, `documentation`, `executions`, `forms`, `governance`, `history`, `issues`, `kri`, `kri-form`, `kris`, `layout`, `linking`, `notifications`, `reports`, `risk-form`, `risks`, `riskhub`, `settings`, `tables`, `ui`, `users`, `vendor-form`, `vendors`, plus standalone shim files at root.
- Service top-level files (per `ls frontend/src/services/`): `accessApi.ts`, `activityLogApi.ts`, `adminApi.ts`, `apiClient.ts`, `approvalsApi.ts`, `authApi.ts`, `authConfig.ts`, `authRedirect.ts`, `authRequest.ts`, `capabilityFlags.ts`, `collectionApi.ts`, `controlApi.ts`, `csrfToken.ts`, `dashboardApi.ts`, `departmentApi.ts`, `directoryApi.ts`, `entraAuth.ts`, `executionApi.ts`, `issuesApi.ts`, `kriApi.ts`, `logger.ts`, `lookupApi.ts`, `notificationsApi.ts`, `orphanedItemsApi.ts`, `preferencesApi.ts`, `reportApi.ts`, `riskApi.ts`, `riskHubApi.ts`, `riskQuestionnairesApi.ts`, `userApi.ts`, `userDirectoryApi.ts`, `vendorApi.ts`, `vendorLinkApi.ts`, `vendorReportApi.ts`. Subdirectories: `admin/`, `api/`, `session/`.
- `frontend/src/services/api/schemas/`: `admin.ts`, `auth.ts`, `common.ts`, `riskHub.ts`, `workflow.ts`, `index.ts`, `entities/` (with `approvals.ts`, `controls.ts`, `dashboard.ts`, `executions.ts`, `governance.ts`, `identity.ts`, `issues.ts`, `kris.ts`, `preferences.ts`, `risks.ts`, `vendors.ts`, `index.ts`).

---

## 2. Top-level entry points

### App + Router setup
- `frontend/src/App.tsx:1-5` — imports `BrowserRouter`, `QueryClient`, `QueryClientProvider`, `AuthProvider`, `ThemeProvider`, `DashboardFilterProvider`.
- `frontend/src/App.tsx:11-18` — `QueryClient` is created module-scope:
  ```
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 1000 * 60, retry: 1 } } });
  ```
- `frontend/src/App.tsx:20-40` — `ProtectedRoute` consumes `useAuth()` and gates by `isAuthenticated`/`bootstrapStatus`.
- `frontend/src/App.tsx:57-85` — `<App />` wraps everything in `<QueryClientProvider><AuthProvider><ThemeProvider><BrowserRouter><Suspense>…</Suspense></BrowserRouter></ThemeProvider></AuthProvider></QueryClientProvider>`. `<DashboardFilterProvider>` wraps `<MainLayout />` only inside the protected `/` route.
- Main layout import: `App.tsx:8` — `import { MainLayout } from '@/components/layout';`.

### Routing manifest (`frontend/src/routing/`)
- `routing/index.ts:1-12` — combines `coreProtectedRoutes`, `businessRoutes`, `adminRoutes` into `protectedAppRoutes`, plus exports `publicRoutes` and `getSidebarNavRoutes`.
- `routing/types.ts:8-29` — `AppRouteDef` shape (`key`, `path`, `index`, `element`, optional `nav`).
- `routing/core.tsx:9-15` — lazy-imports for `DashboardPage`, `SettingsPage`, `UsersPage`, `UserNewPage`, `HeroPage`, `LoginPage`, `SsoCallbackPage`.
- `routing/core.tsx:17-25` — `RoleBasedIndex` redirects platform admins to `/admin`, otherwise renders `DashboardPage`.
- `routing/core.tsx:27-43` — `publicRoutes`: `/login`, `/auth/sso/callback`, `/landing`.
- `routing/core.tsx:45-97` — `coreProtectedRoutes`: index, `settings`, `users`, `users/new`. `users` wrapped in `UsersRouteGuard`, `users/new` in `UserLifecycleRouteGuard`.
- `routing/business.tsx:21-46` — lazy imports for every business page (Approvals, Notifications, Controls, Risks, Issues, KRIs, Departments, Vendors, AuditTrail, ActivityLog, Governance, RiskHub).
- `routing/business.tsx:48-215` — defines `businessRoutes`. Guarded routes:
  - `governance` wrapped in `<GovernanceRouteGuard>` (`business.tsx:163-167`).
  - `activity-log` wrapped in `<ActivityLogRouteGuard>` (`business.tsx:180-184`).
- `routing/admin.tsx:9-36` — `adminRoutes`: `admin` and `admin/docs`, both `isVisible: ({ authz }) => authz.canViewAdminConsole`.

---

## 3. KRI form (S3.x targets)

### Files
- `frontend/src/components/kri-form/`: `KRIFormContainer.tsx`, `KriApprovalQueuedBanner.tsx`, `KriDetailsStep.tsx`, `KriFormErrorAlert.tsx`, `KriFormFooter.tsx`, `KriFormNavigation.tsx`, `KriFormStepContent.tsx`, `KriMismatchDialog.tsx`, `KriRiskSelectionStep.tsx`, `KriVendorContextBanner.tsx`, `kriForm.selectors.ts`, `kriForm.types.ts`, `kriForm.utils.ts`, `useKriFormState.ts`, `useKriLookups.ts`, `useKriSubmit.ts`, `README.md`.
- No internal `__tests__/` directory inside `kri-form/`.

### `kriFormWorkflow.ts` (S3.11)
- Deleted in Wave 3 item `#3`.
- Absence lock: `tests/frontend/unit/src/components/kri-form/kriFormWorkflow.absent.spec.ts`.
- `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts` no longer imports `buildVendorContextWarning`.

### KRI shim (S3.9)
- `frontend/src/components/KRIForm.tsx` is 2 lines:
  ```
  export { KRIFormContainer as KRIForm } from '@/components/kri-form/KRIFormContainer';
  export type { KRIFormProps, KRIFormVendorContext } from '@/components/kri-form/kriForm.types';
  ```
- Production importers (`@/components/KRIForm`): `frontend/src/pages/KRINewPage.tsx:5`.
- Test importers: `tests/frontend/unit/src/components/__tests__/KRIForm.edit.test.tsx:5`, `tests/frontend/unit/src/components/__tests__/KRIForm.vendor-context.test.tsx:4`.

---

## 4. Control form (S2.8, S2.9, FE-deadcode-1)

### Files
- `frontend/src/components/control-form/`: `ControlFormContainer.tsx`, `ControlFormExecutionStep.tsx`, `ControlFormIdentityStep.tsx`, `ControlFormOwnershipStep.tsx`, `ControlFormRiskLinkStep.tsx`, `ControlFormStatusStep.tsx`, `controlFormFilters.ts`, `controlFormUtils.ts`, `controlFormValidation.ts`, `controlRiskLinkStepContext.ts`, `useControlFormLookups.ts`, `useControlFormWorkflow.ts`, `README.md`. No `__tests__/` directory.

### `controlFormWorkflow.ts` (FE-deadcode-1)
- Deleted in Wave 3 item `#4`.
- Absence lock: `tests/frontend/unit/src/components/control-form/controlFormWorkflow.absent.spec.ts`.

### `controlFormUtils.ts` (S2.9)
- Length: 13 lines (`control-form/controlFormUtils.ts:1-13`).
- Exports: `function formatFrequencyLabel` (line 3); `function getControlFormErrorKey` (line 7).
- Production importers (3 lines):
  - `control-form/ControlFormExecutionStep.tsx:5` `import { formatFrequencyLabel } from './controlFormUtils';`
  - `control-form/useControlFormWorkflow.ts:14` `import { getControlFormErrorKey } from './controlFormUtils';`
  - `control-form/useControlFormLookups.ts:9` `import { getControlFormErrorKey } from './controlFormUtils';`

### Control shim (S2.8)
- `frontend/src/components/ControlForm.tsx` is 1 line:
  ```
  export { ControlForm } from './control-form/ControlFormContainer';
  ```
- Production importers (`@/components/ControlForm`): `pages/ControlEditPage.tsx:6`, `pages/ControlNewPage.tsx:6`.
- Test importers: `tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14`.

### Sibling shims (for context)
- `frontend/src/components/RiskForm.tsx:1` — `export { RiskForm } from './risk-form/RiskFormContainer';` (1 line). Production importers: `pages/RiskEditPage.tsx:5`, `pages/RiskNewPage.tsx:5`. Test importer: `tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:13`.
- `frontend/src/components/VendorForm.tsx:1` — `export { VendorFormContainer as VendorForm } from '@/components/vendor-form/VendorFormContainer';`. Production importer: `pages/vendors/VendorFormView.tsx:4`. Test importer: `tests/frontend/unit/src/components/__tests__/VendorForm.test.tsx:4`.
- `frontend/src/components/risk-form/riskFormWorkflow.ts` — full workflow module (242 lines) used by `risk-form/RiskFormContainer.tsx` (not a shim; substantive logic).

---

## 5. Governance (FE-deadcode-2, S7.10)

### Files
- `frontend/src/components/governance/`: `OrphanQuickViewModal.tsx`, `OrphanedItemsTable.tsx`, `ResolveOrphanDepartmentSelection.tsx`, `ResolveOrphanFooter.tsx`, `ResolveOrphanModal.tsx`, `ResolveOrphanOwnerSelection.tsx`, `ResolveOrphanRiskSelection.tsx`, `ResolveOrphanSummary.tsx`, `index.ts`, `orphanResolutionState.ts`, `resolveOrphanHelpers.ts`, `useResolveOrphanWorkflow.ts`, `README.md`.

### `orphanResolutionPresentation.ts` (FE-deadcode-2)
- Deleted in Wave 3 item `#5`.
- Absence lock: `tests/frontend/unit/src/components/governance/orphanResolutionPresentation.absent.spec.ts`.

### `orphanResolutionState.ts` (canonical)
- 11 lines. Exports `buildOrphanResolutionLabel` (line 1) and `resolveOrphanStaleTarget` (line 5).
- Production importer: `governance/useResolveOrphanWorkflow.ts:14` `import { buildOrphanResolutionLabel, resolveOrphanStaleTarget } from './orphanResolutionState';`.
- Test importer: `tests/frontend/unit/src/components/__tests__/LinkOrphanWorkflow.test.ts:10` (`from '@/components/governance/orphanResolutionState'`).

### `governance/index.ts:1-3`
- Re-exports: `OrphanedItemsTable`, `ResolveOrphanModal`, `OrphanQuickViewModal`. Does **not** re-export presentation/state files.

### Governance route guard (S7.4 backreference)
- `authz/BusinessRouteGuards.tsx:18-21` — `GovernanceRouteGuard` uses `authz.canViewGovernance`.
- `authz/policy.ts:117` — `const canViewGovernance = meCapabilities.can_view_governance;` (strict path).
- `authz/policy.ts:73` — legacy path `canViewGovernance: !isPlatformAdmin && hasGlobalScope && hasPermission('users', 'write')`.
- Backend mirror (S7.10): `backend/app/api/v1/endpoints/users/summary.py:45-50` defines `_can_view_governance` with `ensure_business_view_access(...) ... return can_manage_users(current_user)`. The shell summary at `summary.py:54,76` exposes `can_view_governance` to the frontend independently of `me_capabilities`.

---

## 6. Notifications (FE-deadcode-3)

### Files
- `frontend/src/components/notifications/`: `NotificationBell.tsx`, `notificationPresentation.tsx`, `__tests__/`, `README.md`.

### `resourcePath.ts` (FE-deadcode-3)
- Deleted in Wave 3 item `#6`.
- Absence lock: `tests/frontend/unit/src/components/notifications/resourcePath.absent.spec.ts`.

### Canonical: `notificationPresentation.tsx`
- Defines `getNotificationResourcePath` (line 40), `getNotificationPath` (line 63), `buildNotificationPresentation` (line 67), `NotificationPresentationIcon` (line 101).
- Production importer: `pages/NotificationsPage.tsx:10` (also `Sidebar.tsx:17` for `NotificationBell` from sibling file).
- Test importer: `tests/frontend/unit/src/components/notifications/__tests__/notificationPresentation.test.tsx:5`.

---

## 7. Approval surfaces (S6.x backreference)

The audit task mentions `frontend/src/components/approval/*` — this directory does **not** exist. Approval UI lives at:

- `frontend/src/pages/ApprovalsPage.tsx` (default-export top-level page).
- `frontend/src/pages/approvals/`: `ApprovalList.tsx`, `ApprovalResolutionDialog.tsx`, `ApprovalsTabs.tsx`, `QuestionnaireInboxList.tsx`, `approvalsPresentation.ts`, `useApprovalsPageState.ts`, `README.md`.
- `frontend/src/components/forms/ApprovalQueuedBanner.tsx` — used by all entity forms.
- `frontend/src/components/riskhub/ApprovalScenariosPanel.tsx` — admin-side approval scenario config.
- `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx` — KRI-form-local banner.
- `frontend/src/types/approval.ts` — types.
- `frontend/src/lib/approvalUi.ts` — used by `risk-form/riskFormWorkflow.ts:5` for `parseUpdateResult`.
- `frontend/src/services/approvalsApi.ts` — backend HTTP client.
- `frontend/src/services/api/schemas/entities/approvals.ts` — Zod schemas.

### Approvals page wiring
- `pages/ApprovalsPage.tsx:1-10` — imports `ConfirmDialog`, `ApprovalList`, `ApprovalResolutionDialog`, `ApprovalsTabs`, `QuestionnaireInboxList`, `useApprovalsPageState`, `useSessionSnapshot`.
- `pages/approvals/approvalsPresentation.ts:13-18` — exports `APPROVAL_TABS` array.
- `pages/approvals/approvalsPresentation.ts:32-57` — `getApprovalStatusBadge`/`getApprovalActionBadge` switch over status/action types.
- `pages/approvals/ApprovalList.tsx:174,184,197` — uses `resolveCapabilityFlag(approval.capabilities, 'can_approve' | 'can_reject' | 'can_cancel')`.

---

## 8. Dashboard (FE-N8)

### Files (`frontend/src/components/dashboard/`)
- 21 widget `.tsx` files at root. 26 entries total including `__tests__/`, supporting `.ts`s, README.
- Files at root: `CategoryBreakdownCharts.tsx`, `ControlTrendChart.tsx`, `DepartmentTable.tsx`, `FilterBar.tsx`, `IssueAgingChart.tsx`, `IssuesSummaryCard.tsx`, `KRIBreachHistoryChart.tsx`, `KRIBreachWidget.tsx`, `KRIStatusWidget.tsx`, `OpenIssuesBySeverityChart.tsx`, `QuarterMetricCard.tsx`, `QuarterPeriodSelector.tsx`, `QuarterlyComparisonFrame.tsx`, `QuarterlyComparisonWidget.tsx`, `RiskCommitteeCards.tsx`, `RiskCommitteeSection.tsx`, `RiskDistributionMatrix.tsx`, `RiskDrilldownModal.tsx`, `RiskTrendChart.tsx`, `SnapshotAvailabilityNotice.tsx`, `chartTooltip.ts`, `departmentTablePresentation.tsx`, `departmentTableSorting.ts`, `quarterlyComparisonPresentation.ts`, `useQuarterlyComparisonData.ts`.

### `DashboardFilterContext` (consumer churn signal)
- `contexts/DashboardFilterContext.tsx:13-23` — context type exposes 7 mutators (`setDepartmentId`, `setRiskLevel`, `setControlStatus`, `setControlForm`, `setViewMode`, `resetFilters`, plus `hasActiveFilters` boolean).
- `contexts/DashboardFilterContext.tsx:69-85` — `<DashboardFilterContext.Provider value={...}>` allocates a fresh object literal each render.
- Consumers (sample, all in `components/dashboard/`):
  - `CategoryBreakdownCharts.tsx:128`, `DepartmentTable.tsx:24`, `FilterBar.tsx:36`, `KRIStatusWidget.tsx:16`, `RiskDrilldownModal.tsx:35`, `KRIBreachWidget.tsx:14`.
- Provider mounted in `App.tsx:69-71` only inside `<ProtectedRoute>` wrapping `<MainLayout />`.

### Dashboard data hook
- `pages/dashboard/useDashboardOverviewState.ts:21` — `queryKey: [` (single dashboard query).

---

## 9. Admin (S8.7) and AdminConsoleCapabilities

### Files
- `frontend/src/pages/AdminConsolePage.tsx` (top-level page).
- `frontend/src/pages/admin-console/sections/`: `AdminConsoleAuditPanels.tsx`, `AdminConsoleOpsPanels.tsx`, `audit/`, `ops/`, `README.md`.
  - `AdminConsoleAuditPanels.tsx:1` — `export { AuditLogsPanel } from './audit';` (1-line shim).
  - `AdminConsoleOpsPanels.tsx:1` — `export { HealthPanel, LogsPanel, SessionsPanel } from './ops';` (1-line shim).
  - `audit/`: `AuditDetailsModal.tsx`, `AuditLogsPanel.tsx`, `AuditLogsTable.tsx`, `LogSettingsPanel.tsx`, `auditExport.ts`, `auditPresentation.ts`, `index.ts`.
  - `ops/`: `HealthPanel.tsx`, `LogsPanel.tsx`, `OutboxStatusSection.tsx`, `SchedulerStatusSection.tsx`, `SessionsPanel.tsx`, `SessionsTable.tsx`, `index.ts`, `sessionPresentation.ts`.
- `frontend/src/components/admin/` does **not** exist as a directory.
- `frontend/src/services/admin/`: `adminRequests.ts`, `adminTypes.ts`, `README.md`.
- `frontend/src/services/adminApi.ts` — top-level facade.

### `AdminConsoleCapabilities` shape (S8.7)
- `services/admin/adminTypes.ts:18-23`:
  ```
  export interface AdminConsoleCapabilities {
      can_revoke_sessions: boolean;
      can_run_directory_check_all: boolean;
      can_update_log_config: boolean;
      can_export_loaded_audit_logs: boolean;
  }
  ```
- Schema: `services/api/schemas/admin.ts:38-43` — `adminConsoleCapabilitiesSchema = passthroughObject({ can_revoke_sessions, can_run_directory_check_all, can_update_log_config, can_export_loaded_audit_logs })`.
- Loader: `services/admin/adminRequests.ts:31` — `apiClient.get('/admin/capabilities', { schema: adminConsoleCapabilitiesSchema })`.
- Re-export: `services/adminApi.ts:4` — `import type { …, AdminConsoleCapabilities, … }`.
- Frontend consumers (queryKey `['adminCapabilities']`): `pages/admin-console/sections/audit/AuditLogsPanel.tsx:56`, `pages/admin-console/sections/ops/SessionsPanel.tsx:27`.

### `AdminConsolePage`
- `pages/AdminConsolePage.tsx:14-19` — tab definitions (`'health' | 'logs' | 'audit' | 'sessions'`).
- `pages/AdminConsolePage.tsx:33-35` — `if (!authz.canViewAdminConsole) return <Navigate to="/" replace />;`.
- Route mounted at `routing/admin.tsx:13` `path: 'admin'`.

---

## 10. Services (FE-N1, FE-N6) and query-key inventory

### Query-key occurrences (FE-N1)
- `grep -rcn "queryKey:" frontend/src --include=*.ts --include=*.tsx`: **44 lines across 22 files**.
- Per-file counts (top of distribution):
  - `useRiskHubConfigResource.ts`: 6 (`riskhub/useRiskHubConfigResource.ts:86,97,107,117,127`).
  - `SessionsPanel.tsx`: 5.
  - `HealthPanel.tsx`: 4.
  - `useRemediationPlanWorkflow.ts`: 3.
  - `AuditLogsPanel.tsx`: 3.
  - `useRiskHubConfig.ts`: 3 (lines 59, 112, 180).
  - `DepartmentsPanel.tsx`, `ApprovalScenariosPanel.tsx`, `SystemSettingsPanel.tsx`, `useRolesPanelData.ts`, `LogSettingsPanel.tsx`: 2 each.
  - The remaining files: 1 each.
- All literal — no central typed registry.

### Single existing factory
- `frontend/src/lib/issueQueryKeys.ts:1-17`:
  ```
  export function issueDetailQueryKey(userId, issueId) { return ['issue', toIssueSessionScope(userId), issueId] as const; }
  export function issueHistoryQueryKey(userId, issueId) { return ['issue-history', toIssueSessionScope(userId), issueId ?? null] as const; }
  ```
- Consumers: `pages/issues/issue-detail/useIssueDetail.ts:1`, `pages/issues/issue-detail/useIssueHistory.ts:1` (matched by `grep -rln "queryKey:"`).

### Error-key registry (FE-N6)
- `frontend/src/i18n/getErrorMessageKey.ts:1-19` — function maps code/status to `ErrorMessageKey`. Quotes:
  - line 1: `import { ERROR_CODE_TO_KEY } from '@/i18n/errorCodeMap';`
  - line 12-16: `if (status === 401) return 'errorKeys.unauthorized'; …`
- `frontend/src/i18n/errorCodeMap.ts:1-14` — `ERROR_CODE_TO_KEY` literal record:
  - `UNAUTHORIZED → 'errorKeys.unauthorized'`, `FORBIDDEN → 'errorKeys.forbidden'`, `NOT_FOUND → 'errorKeys.not_found'`, `VALIDATION_ERROR → 'errorKeys.validation'`, `NETWORK_ERROR → 'errorKeys.network'`, `REQUEST_TIMEOUT → 'errorKeys.request_timeout'`, `SERVER_ERROR → 'errorKeys.server'`, `REQUEST_FAILED → 'errorKeys.request_failed'`, `DEMO_LOGIN_FAILED → 'errorKeys.demo_login_failed'`, `UNKNOWN_ERROR → 'errorKeys.unknown'`.
- `services/api/apiErrors.ts:1-73` consumes via `getErrorMessageKey('REQUEST_FAILED')` (line 26), `getErrorMessageKey(error.code === 'REQUEST_TIMEOUT' ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR')` (line 63), and `getErrorMessageKey('NETWORK_ERROR')` (line 70).
- `services/api/ApiClientCore.ts:145-148` — `toUiMessageKey(error)` returns `'errorKeys.unknown'` for unknown errors.

### `services/api/` core
- `services/api/`: `ApiClientCore.ts`, `apiConfig.ts`, `apiErrors.ts`, `apiRequestBuilder.ts`, `apiTypes.ts`, `requestRuntime.ts`, `responseParsing.ts`, `schemas/`, `README.md`.
- `services/api/schemas/index.ts:1-7` — `export * from './admin' | './auth' | './common' | './entities' | './riskHub' | './workflow';`.

---

## 11. Hooks (`frontend/src/hooks/`)

### Files (10 total)
- `activityLogPageWorkflow.ts`, `useActivityLogPageState.ts`, `useAdaptivePollingQuery.ts`, `useChartTheme.ts`, `useDebouncedValue.ts`, `useDepartmentDetail.ts`, `usePendingApprovalIds.ts`, `useRiskHubConfig.ts`, `useStatusTheme.ts`, `useUsersPageFilters.ts`, `README.md`.
- `useResourcePanelQuery` does **not** exist (FE-N7 is a hypothesised hook). The closest existing pattern is `components/riskhub/useRiskHubConfigResource.ts` (180 lines) defining `useRiskHubConfigResource` plus `RiskHubConfigResourceDefinition` shape.

### `useAuthz` (canonical capability hook)
- `authz/useAuthz.ts:1-18`:
  ```
  export function useAuthz() {
      const { user, hasPermission } = useAuth();
      const strictCapabilities = useSyncExternalStore(subscribe, isStrictCapabilitiesEnabled, isStrictCapabilitiesEnabled);
      return useMemo(() => buildAuthz(user, hasPermission, user?.me_capabilities, strictCapabilities), [user, hasPermission, strictCapabilities]);
  }
  ```
- `authz/policy.ts:13-39` — `Authz` type with 23 boolean/derived fields and `can: CapabilityChecker`.
- `authz/policy.ts:41-84` — `buildLegacyAuthz(user, hasPermission)` (legacy, role-based).
- `authz/policy.ts:86-155` — `buildAuthz(user, hasPermission, meCapabilities, strictCapabilities)`. Falls back to legacy at line 100-102: `if (!strictCapabilities || !meCapabilities) { return buildLegacyAuthz(user, hasPermission); }`.

### `usePermissions` (S7.3)
- Deleted in Wave 4 `#35`. `Sidebar.tsx` now reads `hasPermission` directly from `useAuth()`, and consumers should use `useAuthz()` for derived capability booleans.

### Capability flags store
- `services/capabilityFlags.ts:1-19` — module-scope mutable `strictCapabilitiesEnabled` boolean with `setStrictCapabilitiesEnabled`/`isStrictCapabilitiesEnabled`/`subscribe` exports. Used by `useAuthz` via `useSyncExternalStore`.

---

## 12. AuthContext (FE-N5) and related

### `contexts/AuthContext.tsx:1-78`
- Imports (lines 1-7): `useCallback`, `useContext`, `useState`-equivalents are not used directly; `usePreferenceHydration`, `useAuthBootstrap`, `useAuthActions`, `hasUserPermission`, `useSessionSnapshot`.
- Context value shape (`AuthContext.tsx:11-23`): `user`, `isLoading`, `bootstrapStatus`, `bootstrapError`, `logoutPending`, `logoutErrorKey`, `isPreferencesHydrated`, `hasPermission`, `isAuthenticated`, `login`, `logout`.
- Provider body (`AuthContext.tsx:27-69`): allocates a fresh value object each render.
  ```
  return ( <AuthContext.Provider value={{ user: session.user, … }}> {children} </AuthContext.Provider> );
  ```
- `useAuth` (`AuthContext.tsx:71-77`) throws if context undefined.

### Auth-context dependency graph
- `contexts/auth/permissions.ts:3-17` — `hasUserPermission(user, resource, action)` walks `user.effective_permissions ?? user.permissions`, splits on `':'`, supports `*` wildcards.
- `contexts/auth/usePreferenceHydration.ts:5-29` — local `isPreferencesHydrated` state; calls `syncPreferencesFromServer` from `@/utils/userSettingsStorage`.
- `contexts/auth/useAuthBootstrap.ts:19-75` — single `useEffect` keyed on `[hydratePreferences, markPreferencesReady, token]`. Calls `bootstrapAuthSession()` and `applyBootstrappingSession`/`applyBootstrappedSession`/`applyAnonymousSession`/`applyBootstrapError`.
- `contexts/auth/useAuthActions.ts:32-87` — `login` calls `authApi.login` then `applyAuthenticatedSession` then `hydratePreferences`. `logout` calls `authApi.logout`, `clearAuthenticatedSession`, optional `entraAuth.logoutRedirect`.

### Session store (S7.8 backreference)
- `services/session/index.ts:1-7`: `export * from './bootstrap' | './logoutSuppression' | './manager' | './refreshHint' | './sso' | './store' | './types';`.
- `services/session/store.ts:1-54` — module-scope `sessionSnapshot`, `Set` of listeners, `getSessionSnapshot`/`setSessionSnapshot`/`subscribeSessionSnapshot`/`useSessionSnapshot` (`useSyncExternalStore`).
- `services/session/manager.ts:1-141` — 12 named exports: `setAuthenticatedSession`, `resolvePostLoginRedirect`, `syncAuthenticatedToken`, `applyBootstrappedSession`, `applyBootstrappingSession`, `applyAnonymousSession`, `applyBootstrapError`, `setLogoutPendingState`, `setLogoutErrorState`, `clearAuthenticatedSession`, `applyAuthenticatedSession`, `SessionUser`/`BootstrappedSession` types.
- `useSessionSnapshot` consumed by `AuthContext.tsx:7`, `AuthContext.tsx:28`; also `pages/ApprovalsPage.tsx:4`.

### `logoutErrorKey` consumers (downstream of FE-N6/auth state)
- `components/layout/Header.tsx:8,56-57` — renders `tErrors(logoutErrorKey)`.
- `components/layout/Sidebar.tsx:24,181-182` — renders error key in sidebar logout panel.
- `contexts/auth/useAuthBootstrap.ts:37,54` — preserves error across bootstrap.

---

## 13. authz module (`frontend/src/authz/`)

- Files: `BusinessRouteGuards.tsx`, `policy.ts`, `useAuthz.ts`, `README.md`.
- `BusinessRouteGuards.tsx:1-37` — exports four guards:
  - `GovernanceRouteGuard` (line 18) → `authz.canViewGovernance`.
  - `ActivityLogRouteGuard` (line 23) → `authz.canViewActivityLog`.
  - `UsersRouteGuard` (line 28) → `authz.canViewUsersRoute`.
  - `UserLifecycleRouteGuard` (line 33) → `authz.isPlatformAdmin`.
- All four wrap children in a `RedirectIfDenied` helper (line 10) that returns `<Navigate to="/" replace />` when denied.

### `me_capabilities` schema reachability
- `frontend/src/services/api/schemas/auth.ts:55` — `can_view_governance: z.boolean(),` inside auth schema.
- `frontend/src/services/api/schemas/entities/identity.ts:84` — `can_view_governance: z.boolean(),` inside identity schema.
- `frontend/src/types/user.ts:104` — TypeScript type field `can_view_governance: boolean;`.

### Capability invariants test reference
- `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` — imports `useAuthz` with `can_view_governance: false` (line 62).
- `tests/frontend/unit/src/authz/__tests__/useAuthz.strictCapabilities.test.tsx` — uses `can_view_governance: false` (line 24).

---

## 14. Forms cross-cutting (`frontend/src/components/forms/`)

- Files: `ApprovalQueuedBanner.tsx`, `FormStepContext.tsx`, `entityFormWorkflow.ts`, `README.md`.
- `entityFormWorkflow.ts:1-25` — exports `EntityFormStepState`, `EntityFormSubmitOutcomeInput` types and `nextEntityFormStep`/`previousEntityFormStep`/`resolveSubmitOutcome` functions.
- Consumers — production:
  - `kri-form/KRIFormContainer.tsx` (via test import alignment)
  - `control-form/ControlFormContainer.tsx:19-21` — `import { resolveSubmitOutcome } from '@/components/forms/entityFormWorkflow';`
- Test importer: `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts:7` (`from '@/components/forms/entityFormWorkflow'`).

---

## 15. Dashboard widget concentration signal (FE-N8)

- 21 widget `.tsx` files at `components/dashboard/`. `grep -rn "useTranslation\|useChartTheme"` returns 46 lines, indicating per-widget i18n+theme imports.
- Sample consumers of `useDashboardFilters` (full filter object): `KRIStatusWidget.tsx:16`, `KRIBreachWidget.tsx:14`, `RiskDrilldownModal.tsx:35`, `DepartmentTable.tsx:24`, `FilterBar.tsx:36`, `CategoryBreakdownCharts.tsx:128` — destructure individual setters/values, no granular subscription.

---

## 16. Cross-references

- `App.tsx:11-18` is the **only** `new QueryClient(...)` in the tree (FE-N2 target); `services/api/queryClient.ts` does not exist.
- Provider tree order (`App.tsx:59-83`): QueryClientProvider → AuthProvider → ThemeProvider → BrowserRouter → Suspense → Routes. `DashboardFilterProvider` appears only inside the protected `/` route element.
- The session module is the bridge between AuthContext and TanStack Query; both `AuthContext.tsx:7` and `pages/ApprovalsPage.tsx:4` read `useSessionSnapshot`.
- `useAuthz` calls `useAuth` (`useAuthz.ts:8`) and remains the canonical frontend capability projection; the former `usePermissions` wrapper was deleted in Wave 4 `#35`.
- The KRI shim, Control shim, Risk shim, and Vendor shim all live as 1-2 line files at `components/` root and re-export the canonical `*Container` from the subdirectory.

---

## 17. Quick reference index by audit ID

| Audit ID | Path | Length | Prod importers | Test importers |
|----|----|----|----|----|
| S2.8 (ControlForm shim) | `components/ControlForm.tsx` | 1 line | `pages/ControlEditPage.tsx:6`, `pages/ControlNewPage.tsx:6` | `tests/.../approval_ui_rendering.spec.tsx:14` |
| S2.9 (controlFormUtils) | `components/control-form/controlFormUtils.ts` | 13 lines | 3 (`ControlFormExecutionStep.tsx:5`, `useControlFormWorkflow.ts:14`, `useControlFormLookups.ts:9`) | 0 |
| S3.9 (KRIForm shim) | `components/KRIForm.tsx` | 2 lines | `pages/KRINewPage.tsx:5` | 2 (`KRIForm.edit.test.tsx:5`, `KRIForm.vendor-context.test.tsx:4`) |
| S3.11 (kriFormWorkflow) | `components/kri-form/kriFormWorkflow.ts` | deleted in Wave 3 `#3` | 0 | 0 |
| FE-deadcode-1 (controlFormWorkflow) | `components/control-form/controlFormWorkflow.ts` | deleted in Wave 3 `#4` | 0 | 0 |
| FE-deadcode-2 (orphanResolutionPresentation) | `components/governance/orphanResolutionPresentation.ts` | deleted in Wave 3 `#5` | 0 | 0 |
| FE-deadcode-3 (resourcePath) | `components/notifications/resourcePath.ts` | deleted in Wave 3 `#6` | 0 | 0 |
| S7.3 (usePermissions) | `hooks/usePermissions.ts` | deleted in Wave 4 `#35` | 0 | 0 |
| S7.4 (BusinessRouteGuards) | `authz/BusinessRouteGuards.tsx` | 37 lines | `routing/core.tsx:5`, `routing/business.tsx:16-19` | n/a |
| S7.8 (session split) | `services/session/` | 8 files | `AuthContext.tsx:7`, `ApprovalsPage.tsx:4`, plus `manager.ts` named exports | n/a |
| S7.10 (governance capability mirror) | `authz/policy.ts:117` + `backend/.../summary.py:45-50` | n/a | uses `meCapabilities.can_view_governance` (strict) and legacy fallback (`policy.ts:73`) | n/a |
| S8.7 (AdminConsoleCapabilities) | `services/admin/adminTypes.ts:18-23`, `services/api/schemas/admin.ts:38-43` | 4-key interface | `audit/AuditLogsPanel.tsx:56`, `ops/SessionsPanel.tsx:27` | n/a |
| FE-N1 (queryKeys) | tree-wide | 44 occurrences in 22 files | one factory: `lib/issueQueryKeys.ts` | n/a |
| FE-N2 (QueryClient) | `App.tsx:11-18` | 8 lines | sole construction site | n/a |
| FE-N5 (AuthContext value) | `contexts/AuthContext.tsx:50-68` | fresh value per render | n/a | n/a |
| FE-N6 (error keys) | `i18n/getErrorMessageKey.ts` (19 lines) + `i18n/errorCodeMap.ts` (14 lines) | two files | `apiErrors.ts:1`, `ApiClientCore.ts:147` (string literal) | n/a |
| FE-N7 (useResourcePanelQuery) | does not exist | n/a | template: `components/riskhub/useRiskHubConfigResource.ts` (180 lines) | n/a |
| FE-N8 (Dashboard widgets) | `components/dashboard/` (21 widgets), `contexts/DashboardFilterContext.tsx` | 7 mutators, fresh provider value | 6+ widgets call `useDashboardFilters()` | n/a |
