# Phase 2 Loop A — Frontend Verification (authz + auth + dashboard + retry/error)

Verifies developer verdicts on items #22, #35, #36, #37, #39, #46, #47, #48, #64, #66, #67, #68, #71 against current HEAD. Every claim cites `file:line` with ≤15-word quotes. Per orchestrator override: "Defer" verdicts are not respected. Doc/README/lock-only Reject arguments overruled.

---

## #22 — S2.8 ControlForm shim deletion

**Developer verdict:** Accept w/mod (P2, rewrite imports first).

**Verified state:**
- `frontend/src/components/ControlForm.tsx:1` — `export { ControlForm } from './control-form/ControlFormContainer';` (single line, true 1-line shim).
- **Importer count is HIGHER than Phase 1 mapped (3 prod + 3 test, not 2 prod + 1 test).** Phase 1 architecture map missed `ControlCreateDialog.tsx`.

**Production importers (3):**
- `frontend/src/pages/ControlEditPage.tsx:6` — `import { ControlForm } from '@/components/ControlForm';`
- `frontend/src/pages/ControlNewPage.tsx:6` — `import { ControlForm } from '@/components/ControlForm';`
- `frontend/src/components/ControlCreateDialog.tsx:5` — `import { ControlForm } from './ControlForm';` (relative path; missed by Phase 1)

**Test importers / mocks (3):**
- `tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14` — `import { ControlForm } from '@/components/ControlForm';`
- `tests/frontend/unit/src/pages/__tests__/DirectFormCapabilityGates.test.tsx:60` — `vi.mock('@/components/ControlForm', () => ({`
- `tests/frontend/unit/src/pages/__tests__/ControlForms.vendor-context.test.tsx:39` — `vi.mock('@/components/ControlForm', () => ({`

**Verdict:** ACCEPT (P3). Developer count was undercounted; correction recorded above. Sibling shims `RiskForm.tsx`, `KRIForm.tsx`, `VendorForm.tsx` exist as comparable 1-2 line files for parity (`03-frontend-architecture.md:101-103`).

---

## #35 — S7.3 `usePermissions` hook removal

**Developer verdict:** Accept w/mod (P2, Sidebar usage + test mocks).

**Verified state:**
- `frontend/src/hooks/usePermissions.ts:4-20` — composes `useAuth()` + `useAuthz()`, returns 9 keys.
- Lines 10-17: 8 derived booleans are pure passthroughs of `authz.*` (e.g. `canViewUsers: authz.canViewUserDirectory`, `isPrivileged: authz.hasGlobalScope`).
- Line 5: `const { user, hasPermission } = useAuth();` — `hasPermission` and `user` are direct passthroughs of `useAuth`.
- **No transformation logic.** All 9 keys come from `useAuth()` and `useAuthz()`. Pure passthrough confirmed.

**Production importer (1):**
- `frontend/src/components/layout/Sidebar.tsx:12` — `import { usePermissions } from '@/hooks/usePermissions';`
- `Sidebar.tsx:25` — `const { hasPermission } = usePermissions();` (only `hasPermission` consumed; reachable via `useAuth().hasPermission`).
- `Sidebar.tsx:14` — already imports `useAuthz` separately; `Sidebar.tsx:26` — `const authz = useAuthz();`.

**Test mock count: 18 vi.mock entries across `tests/frontend/unit/src/`.**
Sample (mocks `usePermissions: () => ({ ... })`):
- `SidebarPolling.test.tsx:13`, `KRIValueModal.test.tsx:16`, `IssueDetailPage.tabs.test.tsx:13`, `IssuesPage.table-navigation.test.tsx:8`, `KRIDetailPage.edit-approval.test.tsx:26`, `RiskDetailPage.issue-entry.test.tsx:26`, `IssuesPage.grouped-views.test.tsx:10`, `VendorsPage.grouped-views.test.tsx:170`, `UserNewPage.sso.test.tsx:24`, `DashboardPage.overview.test.tsx:32`, `VendorDetailPage.issue-entry.test.tsx:34`, `ControlDetailPage.issue-entry.test.tsx:29`, `IssuesPage.url-params.test.tsx:12`, `IssueNewPage.cancel.test.tsx:9`, `IssuesPage.layout-parity.test.tsx:8`, `IssuesPage.naming.test.tsx:7`, `IssueNewPage.test.tsx:9`, `KRIDetailPage.issue-entry.test.tsx:25`.

**Verdict:** ACCEPT (P3). Pure passthrough confirmed. Removal touches 1 prod file + 18 test mocks (cluster mostly via the 9-key passthrough; many mocks redirect to `useAuthz` mocks already in place).

---

## #36 — S7.4 BusinessRouteGuards parametric refactor

**Developer verdict:** Accept (P3).

**Verified state:**
- `frontend/src/authz/BusinessRouteGuards.tsx` — 37 lines total. Confirmed shape:
  - Line 18-21: `GovernanceRouteGuard` → `authz.canViewGovernance`.
  - Line 23-26: `ActivityLogRouteGuard` → `authz.canViewActivityLog`.
  - Line 28-31: `UsersRouteGuard` → `authz.canViewUsersRoute`.
  - Line 33-36: `UserLifecycleRouteGuard` → `authz.isPlatformAdmin`.
- All four follow identical body: `const authz = useAuthz(); return <RedirectIfDenied allowed={authz.<KEY>}>{children}</RedirectIfDenied>;`
- `RedirectIfDenied` defined locally at line 10-16 (returns `<Navigate to="/" replace />` when denied).

**Typed factory shape (parametric):**
- A factory with the shape `function buildAuthzRouteGuard<K extends keyof Pick<Authz, BoolKeys>>(key: K)` (where `BoolKeys` is the closed boolean-valued subset of `Authz` from `policy.ts:13-39`). Output: a component that calls `useAuthz()` and reads `authz[key]`.
- The four current capabilities (`canViewGovernance`, `canViewActivityLog`, `canViewUsersRoute`, `isPlatformAdmin`) all exist as boolean fields on the `Authz` type, so the factory can be fully type-narrowed without strings escaping into invariant test territory.
- Important: the closed enumeration `{controls, risks, issues, vendors, departments}` from `useAuthz.invariant.test.ts:46-48` is for `authz.can('read', resource)` literals in `business.tsx`; the four guards above use boolean accessor properties, not `can()` calls, so the parametric factory does not introduce new `authz.can(...)` literals.

**Verdict:** ACCEPT (P3). Parametric factory is well-scoped; consumers `routing/core.tsx:5` (UsersRouteGuard, UserLifecycleRouteGuard), `routing/business.tsx:16-19` (GovernanceRouteGuard, ActivityLogRouteGuard).

---

## #37 — S7.10 Governance capability read from canonical builder

**Developer verdict:** Accept (P1).

**Verified local mirror (`backend/app/api/v1/endpoints/users/summary.py`):**
- Line 45-50: `def _can_view_governance(current_user: User) -> bool:` private helper.
- Line 47: `ensure_business_view_access(current_user, detail="Platform admins cannot access Governance business data")`.
- Line 50: `return can_manage_users(current_user)` (after non-platform-admin gate).
- Line 54: `can_view_governance = _can_view_governance(current_user)` consumed by `_build_shell_summary`.
- Line 76: returned in payload as `"can_view_governance": can_view_governance` to FE.

**Canonical builder (`backend/app/services/_authorization_capabilities/me.py`):**
- Line 33: `def build_me_capabilities(user: User) -> MeCapabilities:`
- Line 60-62 — canonical formula:
  ```
  can_view_governance=(
      not is_platform_admin and has_global_scope and resource_permissions["users:write"]
  ),
  ```
- `resource_permissions["users:write"]` is built at line 41-43 via `Capabilities.for_user(user).can("write", "users")`.
- Re-exported as `from app.services.authorization_capabilities import build_me_capabilities` (`auth/me.py:8`).

**Drift risk:** `_can_view_governance` uses `can_manage_users` (a `core.permissions` helper) while `build_me_capabilities` uses `resource_permissions["users:write"]`. These should be equivalent today, but they are different code paths — drift is the exact thing this audit item flags.

**Verdict:** ACCEPT (P1). The shell-summary endpoint should read `build_me_capabilities(current_user).can_view_governance` instead of recomputing locally. Sole shell-summary call site is `summary.py:54`.

---

## #39 — S8.7 AdminConsoleCapabilities real builder

**Developer verdict:** Accept w/mod (P3, move construction into authorization service with tests).

**Verified backend logic (`backend/app/api/v1/endpoints/admin/capabilities.py`):**
- Full file is 23 lines.
- Line 12-22: GET `/capabilities` handler.
- Line 14: `current_user: User = Depends(require_platform_admin)` — already gates on platform admin.
- Line 16: `_ = current_user` — discards user explicitly.
- Lines 17-22:
  ```
  return AdminConsoleCapabilities(
      can_revoke_sessions=True,
      can_run_directory_check_all=True,
      can_update_log_config=True,
      can_export_loaded_audit_logs=True,
  )
  ```

**STATIC STUB CONFIRMED.** All four booleans are unconditionally `True`. The `current_user` is bound only to enforce the route-level admin gate; no value is computed from it. The schema is asserted at `frontend/src/services/admin/adminTypes.ts:18-23` and `services/api/schemas/admin.ts:38-43` as a 4-key Pydantic/Zod pair.

**Frontend consumers:**
- `frontend/src/services/admin/adminRequests.ts:31` — `apiClient.get('/admin/capabilities', { schema: adminConsoleCapabilitiesSchema })`.
- `pages/admin-console/sections/audit/AuditLogsPanel.tsx:56` and `pages/admin-console/sections/ops/SessionsPanel.tsx:27` — `queryKey: ['adminCapabilities']`.

**Verdict:** ACCEPT (P3). Move to `app/services/_authorization_capabilities/admin.py` (sibling to `me.py:33` builder) returning a real computation (currently equivalent to `is_platform_admin = (require_platform_admin(user) succeeded)`). The contract surface is documented in `docs/security/authorization-capability-contract.md` and parallels `MeCapabilities` per audit `2026-05-09-deepening-audit.md:1424`.

---

## #46 — FE-N1 Frontend query-keys factory

**Developer verdict:** Accept (P3).

**Verified inline `queryKey:` distribution:**
- 45 lines across 22 files (`grep -rn "queryKey:" frontend/src --include="*.ts" --include="*.tsx"`).
- Phase 1 reported 44 across 22 files; current count is 45 across 22 (same files, off-by-one likely from a multi-line entry).

**Sole existing factory (`frontend/src/lib/issueQueryKeys.ts`):**
- Line 1: `export type IssueSessionScope = number | 'anonymous';`
- Line 7-9: `export function issueDetailQueryKey(userId, issueId) { return ['issue', toIssueSessionScope(userId), issueId] as const; }`
- Line 11-16: `export function issueHistoryQueryKey(...)` — `['issue-history', toIssueSessionScope(userId), issueId ?? null] as const`.
- Consumers: `pages/issues/issue-detail/useIssueDetail.ts:1`, `pages/issues/issue-detail/useIssueHistory.ts:1`.

**Concentration target shape:** `frontend/src/lib/queryKeys/` (or `services/api/queryKeys/`) with one file per resource entity, each exporting typed `as const` tuple factories. The existing `issueQueryKeys.ts` pattern is the template.

**Verdict:** ACCEPT (P3). Mechanical refactor; ~45 inline literals are read-only on caller side, and factories add a typed registry without changing behavior.

---

## #47 — FE-N4 RetryPolicy extraction (session-refresh retry only)

**Developer verdict:** Accept w/mod (P3, extract session-refresh retry, NOT generic).

**Verified retry seam (`frontend/src/services/api/ApiClientCore.ts`):**
- Line 25-30: `private shouldAttemptSilentSessionRefresh(pathname: string, attempt: number): boolean`.
  - Line 26: `if (isExplicitLogoutSuppressed()) return false;` — explicit logout short-circuit.
  - Line 27: `if (attempt > 0) return false;` — single-retry policy.
  - Line 28: `if (pathname.startsWith('/api/v1/auth/')) return false;` — auth-route exclusion.
  - Line 29: `return true;`
- Line 61-72: 401 branch in `executeRequest`. On 401:
  - Line 62: `if (this.shouldAttemptSilentSessionRefresh(prepared.pathname, attempt)) {`
  - Line 63: `const refreshedToken = await trySilentSessionRefresh();` (imported from `@/services/session/sso`).
  - Line 64-71: if refresh succeeds, recurse `executeRequest(...)` with `attempt: attempt + 1`.
  - Line 75: else `clearAuthenticatedSession({ clearBootstrap: true });` and throw `UNAUTHORIZED`.

**Retry policy is tightly entangled with the request executor.** The session-refresh decision (3 conditions) and the retry act (recurse with `attempt + 1`) are both inline in `executeRequest`. Generic retry (e.g. for 5xx, network errors) is NOT implemented; `App.tsx:14` `retry: 1` is a TanStack Query default, separate concern.

**Extract target shape:** A `RetryPolicy` type with `shouldAttempt(error: ApiClientError, attempt: number, context): boolean` and `recover(): Promise<RetryToken | null>`. Single concrete instance: `silentSessionRefreshPolicy`. Keep `executeRequest` agnostic.

**Verdict:** ACCEPT (P3). Developer modification (session-refresh-only, not generic) is correct: only session-refresh retry exists; abstracting more would be premature.

---

## #48 — FE-N6 Error-key module consolidation

**Developer verdict:** Accept (P2).

**Verified two-file split:**
- `frontend/src/i18n/getErrorMessageKey.ts` — 19 lines.
  - Line 1: `import { ERROR_CODE_TO_KEY } from '@/i18n/errorCodeMap';`
  - Line 4-19: `export function getErrorMessageKey(code?, status?)` — performs lookup in `ERROR_CODE_TO_KEY` and falls back to status-based defaults.
- `frontend/src/i18n/errorCodeMap.ts` — 14 lines.
  - Line 3-14: `export const ERROR_CODE_TO_KEY: Record<UiErrorCode, ErrorMessageKey> = { ... }` (10 entries).

**Sole consumer of `ERROR_CODE_TO_KEY`:** `getErrorMessageKey.ts:1` (no other importers; `grep` confirms private to the function).

**Sole consumers of `getErrorMessageKey`:**
- `services/api/apiErrors.ts:1` (then lines 26, 63, 70).
- `services/api/ApiClientCore.ts:44` (`getErrorMessageKey('REQUEST_FAILED', response.status)`).
- `services/api/ApiClientCore.ts:79` (`getErrorMessageKey('UNAUTHORIZED', 401)`).

**Merge target:** `frontend/src/i18n/errorKeys.ts` exporting both `ERROR_CODE_TO_KEY` (could become unexported) and `getErrorMessageKey`. Audit `2026-05-09-deepening-audit.md:1195` confirms: "fold `getErrorMessageKey.ts` + `errorCodeMap.ts` into `errorKeys.ts`. **CONCENTRATES** (-1 file)."

**Verdict:** ACCEPT (P2). Merge is mechanical; -1 file, no behavioral change. The map is private to the lookup function.

---

## #64 — FE-N2 QueryClient defaults centralization

**Developer verdict:** Accept (P2).

**Verified single construction site (`frontend/src/App.tsx`):**
- Line 11-18:
  ```
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60, // 1 minute
        retry: 1,
      },
    },
  });
  ```
- Line 59: `<QueryClientProvider client={queryClient}>` — sole instance.

**Confirmed absence of `services/api/queryClient.ts`:** `find ... -name "queryClient.ts"` returns nothing. `grep "@/services/api/queryClient"` returns nothing. Sole `new QueryClient` callsite confirmed.

**Verdict:** ACCEPT (P2). Extract to `services/api/queryClient.ts` (or `lib/queryClient.ts`) with a `RESOURCE_POLICY` map keyed by resource for per-resource staleTime/retry overrides. Mechanical extract.

---

## #66 — FE-N5 AuthContext provider split

**Developer verdict:** Defer (P4 — until session ADR work complete). **Per orchestrator: NOT respecting Defer.**

**Verified current shape (`frontend/src/contexts/AuthContext.tsx`):**
- File length: 78 lines.
- Line 11-23: `AuthContextType` exposes 11 fields, mixing session state (`user`, `isLoading`, `bootstrapStatus`, `bootstrapError`, `logoutPending`, `logoutErrorKey`, `isPreferencesHydrated`, `isAuthenticated`) with actions (`login`, `logout`, `hasPermission`).
- Line 27-44: `AuthProvider` body — composes 4 sub-modules:
  - Line 28: `const session = useSessionSnapshot();` (from `services/session`).
  - Line 29-33: `const { isPreferencesHydrated, hydratePreferences, markPreferencesReady } = usePreferenceHydration(!session.token);`
  - Line 35-38: `const { login, logout } = useAuthActions({ hydratePreferences, markPreferencesReady });`
  - Line 40-44: `useAuthBootstrap({ token: session.token, hydratePreferences, markPreferencesReady });`
- Line 50-67: returns `<AuthContext.Provider value={{ ... }}>` — fresh object literal allocated per render (memoization concern flagged by audit).

**Sub-module boundaries already cleanly factored:**
- `contexts/auth/usePreferenceHydration.ts:5-29` — `[isPreferencesHydrated, hydratePreferences, markPreferencesReady]`.
- `contexts/auth/useAuthBootstrap.ts:19-75` — single `useEffect` keyed on `[hydratePreferences, markPreferencesReady, token]`.
- `contexts/auth/useAuthActions.ts:32-87` — `login` / `logout` callbacks.
- `contexts/auth/permissions.ts:3-17` — `hasUserPermission` (resource:action splitter; 17 lines, pure).

**Proposed split shape:**
- `AuthSessionContext` — value subset: `user`, `isLoading`, `bootstrapStatus`, `bootstrapError`, `isPreferencesHydrated`, `isAuthenticated`. Re-renders on session snapshot change only.
- `AuthActionsContext` — value subset: `login`, `logout`, `hasPermission`, `logoutPending`, `logoutErrorKey`. Stable identity (callbacks already memoized via `useCallback` in `useAuthActions.ts:32,46`).
- `useAuth()` retained as a composite reader (calls both contexts and returns the same shape) — preserves `me_capabilities` reachability via `useAuth().user.me_capabilities` per audit `2026-05-09-deepening-audit.md:1522`.

**Actual prerequisite (orchestrator question):**
- ADR-011 ("Auth scheme & session model") is **proposed at item #72** but does NOT exist on disk (`find docs/adr/` returns ADR-001..ADR-010; `_context/05-adrs-capability-contract.md:12` confirms "no ADR-011 or ADR-012 file present yet").
- Audit `2026-05-09-deepening-audit.md:1611` says `FE-N8 ← FE-N5` and `2026-05-09-deepening-audit.md:1610` says `FE-N5 ← S8.7 + S7.10`.
- The orchestrator's framing of FE-N5's prerequisite as "ADR-011 (#72)" is one half-true reading. The audit itself has FE-N5 dependent on **#37 (S7.10) + #39 (S8.7)** in the dependency graph (audit line 1610), not on ADR-011. ADR-011 is a prerequisite for **#71 (S7.8)** session module merge (audit line 1654: `S7.9 (ADR-011) ──────────────► S7.8`).
- **Real prerequisite for FE-N5: items #37 (S7.10 governance capability) and #39 (S8.7 AdminConsoleCapabilities), both verified in this loop (verdicts ACCEPT).** These provide the capability contract stability that the AuthContext consumer assumes.

**Verdict (orchestrator override):** PROMOTE TO ACCEPT (P3). The split is purely structural (re-render isolation; no behavior change). Memoization regression vector documented at `2026-05-09-deepening-audit.md:2143` is real but verifiable via existing `useAuthz.invariant.test.ts` and adversarial round-2 review. Execute AFTER #37 + #39 land. Defer rationale "until session ADR work complete" conflates the prerequisite of #71 with the prerequisite of #66.

---

## #67 — FE-N7 `useResourcePanelQuery` generic hook

**Developer verdict:** Accept (P3).

**Verified hook does NOT exist:** `find frontend/src -name "useResourcePanelQuery*"` returns nothing. `grep "useResourcePanelQuery" frontend/src` returns nothing. This is a "create new" item.

**Template (`frontend/src/components/riskhub/useRiskHubConfigResource.ts`):**
- 180 lines (matches Phase 1 exactly).
- Line 12-22: `RiskHubConfigResourceDefinition<TItem, TCreate, TUpdate>` shape — `queryKey`, `load`, `create`, `update`, `delete`, `restore`, `itemId`, `panelCapabilityKey`, `includeShowInactive`. Generic in `TItem, TCreate, TUpdate`.
- Line 32-52: `RiskHubConfigResourceState<TItem, TCreate, TUpdate>` — return shape with mutations / panel state.
- Line 79-179: `useRiskHubConfigResource<TItem, TCreate, TUpdate>` body — uses `useQuery` (line 85), 4 mutations (lines 90, 100, 110, 120), `handleSave` / `handleDelete` / `handleRestore`.
- Line 69-77: `resourceQueryKey` — composes definition's queryKey with showInactive flag.
- Line 82-83: `const queryClient = useQueryClient(); const panel = useRiskHubConfigPanelState<TItem>();` — wires panel-state hook (separate file).

**Generic-hook target:** Lift signature to `useResourcePanelQuery<TItem, TCreate, TUpdate>` in `frontend/src/lib/` or `services/api/`. RiskHub-specific bits: the `useRiskHubConfigPanelState` panel hook can stay caller-provided as a generic state hook prop. ~10 admin-console panels (per audit `2026-05-09-deepening-audit.md:1197`) re-implement parts of this pattern.

**Verdict:** ACCEPT (P3). Template is well-formed; no change needed in template, just lift to a generic location. Sequenced after #46 (FE-N1 query-keys factory) per audit `2026-05-09-deepening-audit.md:2080`.

---

## #68 — FE-N8 WidgetShell + dashboard scoped query

**Developer verdict:** Defer (P4 — dedicated dashboard refactor). **Per orchestrator: NOT respecting Defer.**

**Verified state (`frontend/src/components/dashboard/`):**
- 21 root `.tsx` widget files (excluding `__tests__/` and helper `.ts` files).
- `useTranslation` calls: 29 occurrences across the 21 widgets.
- `useChartTheme` calls: 17 occurrences across the 21 widgets.
- `useDashboardFilters` consumers (6 widgets): `CategoryBreakdownCharts.tsx`, `DepartmentTable.tsx`, `KRIStatusWidget.tsx`, `FilterBar.tsx`, `RiskDrilldownModal.tsx`, `KRIBreachWidget.tsx`.
- `useEffect`/`useState` distribution (sampled): `KRIBreachWidget.tsx:4`, `KRIStatusWidget.tsx:6`, `RiskDrilldownModal.tsx:6`, `RiskCommitteeSection.tsx:5`, `DepartmentTable.tsx:3`, `FilterBar.tsx:4`. Charts (`RiskTrendChart.tsx`, `KRIBreachHistoryChart.tsx`, `IssueAgingChart.tsx`, `OpenIssuesBySeverityChart.tsx`, `ControlTrendChart.tsx`) are stateless data-prop components.

**Common widget pattern (verified in `KRIBreachWidget.tsx:11-103`, `KRIStatusWidget.tsx:13-187`):**
1. `useTranslation('dashboard')` + `useDashboardFilters()`
2. local `[isLoading, setIsLoading]` + data state
3. `useEffect` keyed on `filters.departmentId` to fetch and `setIsLoading(false)` on cancel
4. Three render branches: loading skeleton (`<div className="glass-card animate-pulse h-[300px] flex items-center justify-center">`), empty state (with icon + message), data render

**`DashboardFilterContext` consumer churn (`contexts/DashboardFilterContext.tsx`):**
- Line 13-23: `DashboardFilterContextType` exposes 7 mutators (`setDepartmentId`, `setRiskLevel`, `setControlStatus`, `setControlForm`, `setViewMode`, `resetFilters`) + `hasActiveFilters` boolean.
- Line 69-85: `<DashboardFilterContext.Provider value={...}>` — fresh object literal per render.
- Every widget consuming `useDashboardFilters()` re-renders on ANY mutation, even if it only reads `filters.departmentId`.

**Minimal shell extraction (proposal):**
- `WidgetShell.tsx` — wraps `<div className="glass-card">` + skeleton/empty/data branch. Props: `{ isLoading, isEmpty, emptyIcon?, emptyMessage?, title, badge?, footer?, children }`. Replaces ~40 lines per widget × 8 stateful widgets.
- `useDashboardScopedQuery({ scope: ['departmentId'], queryFn })` — selector-based subscription to `DashboardFilterContext` exposing only the selected slice. Avoids re-renders from unrelated mutators.
- Split context: `DashboardFiltersContext` (state) + `DashboardFiltersActionsContext` (7 setters). Mirror of the FE-N5 split pattern.

**Sequencing:** Per audit `2026-05-09-deepening-audit.md:2083`: "AFTER FE-N5". Per audit `2026-05-09-deepening-audit.md:1611`: `FE-N8 ← FE-N5`. The widget shell does NOT depend on ADR-011; it depends on FE-N5 stability so the AuthContext re-render shape is established.

**Verdict (orchestrator override):** PROMOTE TO ACCEPT (P4). Cost is real (21 widgets touched) but mechanical: shell extraction is independent of business logic. Execute AFTER #66 (FE-N5). Defer rationale ("dedicated dashboard UX/state refactor") is inflating scope; the structural shell + selector refactor is bounded.

---

## #71 — S7.8 Frontend session module merge

**Developer verdict:** Defer (P4 — until ADR-011 settles). **Per orchestrator: NOT respecting Defer.**

**Verified current state (`frontend/src/services/session/`):**
- 8 files: `bootstrap.ts`, `index.ts`, `logoutSuppression.ts`, `manager.ts`, `refreshHint.ts`, `sso.ts`, `store.ts`, `types.ts` (plus `README.md`).
- `index.ts:1-7` — barrel: `export * from './bootstrap' | './logoutSuppression' | './manager' | './refreshHint' | './sso' | './store' | './types';`.

**Per-file responsibility (verified by reading):**
- `types.ts` (14 lines) — `SessionSnapshot`, `SessionBootstrapStatus`, `SessionBootstrapError` types.
- `store.ts` (54 lines) — module-scope `sessionSnapshot`, `Set<listener>`, `getSessionSnapshot`, `setSessionSnapshot`, `subscribeSessionSnapshot`, `useSessionSnapshot` (`useSyncExternalStore`).
- `manager.ts` (142 lines) — 12 named exports: `setAuthenticatedSession` (private), `resolvePostLoginRedirect`, `syncAuthenticatedToken`, `applyBootstrappedSession`, `applyBootstrappingSession`, `applyAnonymousSession`, `applyBootstrapError`, `setLogoutPendingState`, `setLogoutErrorState`, `clearAuthenticatedSession`, `applyAuthenticatedSession`, types.
- `bootstrap.ts` (115 lines) — `bootstrapAuthSession` (single-flight promise) with token/refresh-hint state machine.
- `sso.ts` (67 lines) — `trySilentSessionRefresh` (single-flight + cooldown).
- `refreshHint.ts` (40 lines) — cookie helpers (`hasRefreshSessionHint`, `clearRefreshSessionHint`).
- `logoutSuppression.ts` (31 lines) — sessionStorage helpers (`isExplicitLogoutSuppressed`, `setExplicitLogoutSuppressed`, `clearExplicitLogoutSuppressed`).

**Overlap analysis:**
- `bootstrap.ts` calls `manager.ts` (4 imports), `store.ts` (2), `sso.ts` (1), `logoutSuppression.ts` (1), `refreshHint.ts` (1). It is a coordinator.
- `manager.ts` calls `store.ts` (2), `refreshHint.ts` (1), `types.ts` (1). It is the action layer.
- `sso.ts` calls `manager.ts` (1), `store.ts` (1), `logoutSuppression.ts` (1), `refreshHint.ts` (2). It is a refresh coordinator.
- `store.ts`, `refreshHint.ts`, `logoutSuppression.ts`, `types.ts` are leaf primitives.

**Proposed merge shape (orchestrator-pre-ADR proposal):**
- Keep `types.ts`, `store.ts` as canonical leaves (clean separation of types and snapshot store).
- Merge `refreshHint.ts` + `logoutSuppression.ts` into `sessionStorage.ts` (both are browser-storage helpers; ~70 lines combined).
- Merge `manager.ts` + `bootstrap.ts` + `sso.ts` into `coordinator.ts` (action APIs + bootstrap promise + refresh promise; all share state-machine ownership; ~320 lines but tightly coupled).
- Final shape: 4 files (`types.ts`, `store.ts`, `sessionStorage.ts`, `coordinator.ts`) + `index.ts` barrel.
- 8 → 4 files; preserves `useSessionSnapshot` for `AuthContext.tsx:7` and `pages/ApprovalsPage.tsx:4`; preserves `SessionSnapshot.user.me_capabilities` reachability per audit `2026-05-09-deepening-audit.md:1520`.

**Sequencing question:**
- Audit `2026-05-09-deepening-audit.md:1654`: `S7.9 (ADR-011) ──────────────► S7.8`. ADR-011 is item #72; #71 (S7.8) explicitly waits on ADR-011.
- Audit `2026-05-09-deepening-audit.md:2097`: "AFTER #72 ratified, #66 stable."
- Item #66 is also flagged orchestrator-override (PROMOTE TO ACCEPT) above. So if we promote both, the post-ADR-011 sequence becomes: #72 (ADR doc) → #66 (FE-N5 split) → #71 (session merge).

**Verdict (orchestrator override):** PROMOTE TO ACCEPT (P4) BUT EXECUTE AFTER ADR-011 (#72) AND #66. The merge itself is bounded (8→4 files, mechanical), but the audit's prerequisite chain (S7.9 → S7.8) is documented at audit line 1654 and the load-bearing nature is documented at audit line 1617 ("LOAD-BEARING; defer until S7.9 ratified, FE-N5 stable"). Removing the Defer is acceptable, but EXECUTE order remains: ADR-011 author → AuthContext split → session module merge.

---

## Summary table

| ID | Path | Length / Surface | Developer | Orchestrator-aware verdict |
|----|----|----|----|----|
| #22 (S2.8) | `components/ControlForm.tsx` | 1 line | Accept w/mod | ACCEPT (3 prod + 3 test, NOT 2+1) |
| #35 (S7.3) | `hooks/usePermissions.ts` | 20 lines | Accept w/mod | ACCEPT (1 prod + 18 test mocks; pure passthrough) |
| #36 (S7.4) | `authz/BusinessRouteGuards.tsx` | 37 lines | Accept | ACCEPT (4 guards → typed factory) |
| #37 (S7.10) | `users/summary.py:45-50` | 6 lines local | Accept | ACCEPT (route through `me.py:33` builder) |
| #39 (S8.7) | `admin/capabilities.py:17-22` | static stub | Accept w/mod | ACCEPT (move to authz service) |
| #46 (FE-N1) | tree-wide | 45 / 22 files | Accept | ACCEPT (template = `issueQueryKeys.ts`) |
| #47 (FE-N4) | `ApiClientCore.ts:25-72` | 401-refresh seam | Accept w/mod | ACCEPT (session-refresh policy only) |
| #48 (FE-N6) | `i18n/getErrorMessageKey.ts` + `errorCodeMap.ts` | 19+14 lines | Accept | ACCEPT (-1 file merge) |
| #64 (FE-N2) | `App.tsx:11-18` | 8 lines | Accept | ACCEPT (sole construction site) |
| #66 (FE-N5) | `AuthContext.tsx:11-77` | 78 lines | Defer | PROMOTE-ACCEPT (after #37, #39) |
| #67 (FE-N7) | template at `useRiskHubConfigResource.ts` | 180 lines | Accept | ACCEPT (lift to generic) |
| #68 (FE-N8) | 21 widgets + `DashboardFilterContext.tsx` | 7 mutators | Defer | PROMOTE-ACCEPT (after #66) |
| #71 (S7.8) | `services/session/` | 8 files → 4 | Defer | PROMOTE-ACCEPT (execute after #72 + #66) |

---

## Notes for orchestrator

1. **Phase 1 undercounted #22 importers** — `ControlCreateDialog.tsx:5` was missed in the architecture map. Total is 3 prod + 3 test, not 2+1.
2. **#37 and #39 are the prerequisites for #66 (FE-N5)** per audit dependency graph at line 1610, NOT ADR-011 (#72). The orchestrator's framing was partially correct: ADR-011 is the prerequisite for #71 (S7.8), not #66.
3. **#66 → #68 → #71 ordering survives** the Defer-override: #66 unblocks #68 (re-render isolation pattern); ADR-011 (#72) + #66 unblock #71.
4. **All 13 items have clean, bounded refactor targets.** No item requires architectural rework beyond what is documented in the audit and the Phase 1 map.
