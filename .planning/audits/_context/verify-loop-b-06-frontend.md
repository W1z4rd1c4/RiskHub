# Phase 2 Loop B — Frontend ADVERSARIAL Re-verification

Adversarially re-checks Loop A's claims for items #22, #35, #36, #37, #39, #46, #47, #48, #64, #66, #67, #68, #71. Every count and quote re-validated by reading the file at HEAD. Loop A's "PROMOTE TO ACCEPT (Defer override)" verdicts are evaluated for soundness; the orchestrator override stands but the supporting evidence is judged here on its own.

---

## Item #22 — Loop A said: ControlForm is 1-line shim, 3 prod + 3 test importers (corrects Phase 1's 2 prod)

- Quote check: PASS. `frontend/src/components/ControlForm.tsx:1` — `export { ControlForm } from './control-form/ControlFormContainer';` matches verbatim.
- Importer count (fresh grep): PASS — Loop A is correct, but with a fine-print clarification.
  - Production importers of the shim, by literal `from '@/components/ControlForm'` or relative `./ControlForm`:
    1. `frontend/src/pages/ControlEditPage.tsx:6` — `import { ControlForm } from '@/components/ControlForm';`
    2. `frontend/src/pages/ControlNewPage.tsx:6` — `import { ControlForm } from '@/components/ControlForm';`
    3. `frontend/src/components/ControlCreateDialog.tsx:5` — `import { ControlForm } from './ControlForm';`
  - Phase 1 architecture map (`03-frontend-architecture.md`) DID undercount: the relative-path import in `ControlCreateDialog.tsx:5` is missed by alias-only greps. Loop A's correction is correct.
  - Test importers/mocks (3): `tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14`, `tests/frontend/unit/src/pages/__tests__/DirectFormCapabilityGates.test.tsx:60` (`vi.mock('@/components/ControlForm', ...)`), `tests/frontend/unit/src/pages/__tests__/ControlForms.vendor-context.test.tsx:39` (`vi.mock(...)`).
- Stub verification (#39): N/A
- Drift bug verification (#37): N/A
- Defer override soundness: N/A (developer accepted; not a Defer)
- Blocker missed: none. Note: `frontend/src/components/control-form/*.tsx` files (e.g. `ControlFormExecutionStep.tsx:2`) import `ControlForm as ControlFormType` from `@/types/control` — that's the type symbol, not the component shim, so unrelated to this finding.
- Final Phase 2-B verdict: CORRECT. ACCEPT (P2 in dev answer, Loop A widened to P3 — disagree on priority bump; keep developer's P2 since the rewrite must precede deletion).

---

## Item #35 — Loop A said: usePermissions has 1 prod (Sidebar) + 18 test mocks; pure passthrough

- Quote check: PASS. `frontend/src/hooks/usePermissions.ts:4-20` matches verbatim. Body is `const { user, hasPermission } = useAuth(); const authz = useAuthz();` followed by a pass-through return shape with 9 keys.
- Importer count (fresh grep): PASS.
  - Production: 1 — `frontend/src/components/layout/Sidebar.tsx:12` only.
  - Test mocks: 18 — confirmed via `grep -rln "vi.mock.*usePermissions" tests/frontend` returns exactly 18 distinct test files.
- Drift bug verification (#37): N/A
- Stub verification (#39): N/A
- Defer override soundness: N/A
- Blocker missed: minor — `Sidebar.tsx:25` only consumes `hasPermission`, so the only required replacement is `useAuth().hasPermission`. The other 8 keys exposed by `usePermissions` are unused by the prod consumer; their cluster lives entirely in tests. Loop A captured this implicitly.
- Final Phase 2-B verdict: CORRECT.

---

## Item #36 — Loop A said: 4 BusinessRouteGuards bodies, identical shape, parametric factory feasible

- Quote check: PASS. `frontend/src/authz/BusinessRouteGuards.tsx:18-36` shows 4 guards with identical body shape `const authz = useAuthz(); return <RedirectIfDenied allowed={authz.<KEY>}>{children}</RedirectIfDenied>;`.
- Importer count (fresh grep): not central to this item. Loop A's claim that the 4 capability keys exist as boolean fields on `Authz` confirmed by reading `frontend/src/authz/policy.ts:13-39`: `isPlatformAdmin: boolean`, `canViewGovernance: boolean`, `canViewActivityLog: boolean`, `canViewUsersRoute: boolean` are all present.
- Drift bug verification (#37): N/A
- Stub verification (#39): N/A
- Defer override soundness: N/A
- Blocker missed: none. Loop A's distinction between boolean accessor properties (used by these 4 guards) and `authz.can(action, resource)` literal-enumeration tests is correct — the parametric factory does not need to touch `useAuthz.invariant.test.ts:46-48`'s closed enumeration.
- Final Phase 2-B verdict: CORRECT.

---

## Item #37 — Loop A said: REAL drift between `_can_view_governance` (`summary.py:45-50`) and `build_me_capabilities` (`me.py:60-62`)

- Quote check: PASS for both spots.
  - `backend/app/api/v1/endpoints/users/summary.py:45-50` — `def _can_view_governance(current_user: User) -> bool:` then `ensure_business_view_access(...)` and `return can_manage_users(current_user)`.
  - `backend/app/services/_authorization_capabilities/me.py:60-62` — `can_view_governance=( not is_platform_admin and has_global_scope and resource_permissions["users:write"] )`.
- Importer count: N/A
- Drift bug verification (#37): NOT A BUG TODAY, BUT REAL DRIFT SURFACE.
  - `can_manage_users(user)` (`backend/app/core/_permissions/evaluation.py:40-42`) = `is_privileged_user(user) and has_permission(user, "users", "write")`.
  - `is_privileged_user(user)` (`backend/app/core/_permissions/scoping.py:9-11`) = `getattr(user, "access_scope", None) == AccessScope.GLOBAL` — i.e. exactly `has_global_scope`.
  - `me.py:60-62` adds the explicit `not is_platform_admin` clause; the `summary.py` version reaches the same exclusion via `ensure_business_view_access` which raises (caught) for platform admins, returning False (line 49: `except Exception: return False`).
  - **Algebraic equivalence today**: `summary._can_view_governance(user)` = `not is_platform_admin AND has_global_scope AND has_permission(users, write)` = exactly `me.build_me_capabilities(user).can_view_governance`.
  - The drift surface is real: the two paths share NO code (one routes via `can_manage_users`/`ensure_business_view_access`, the other via `resource_permissions["users:write"]`). Either implementation can change without the other.
  - Loop A's verdict ("should be equivalent today, but … different code paths — drift is the exact thing this audit item flags") is correct and well-calibrated.
- Stub verification (#39): N/A
- Defer override soundness: N/A
- Blocker missed: caller-side wiring detail — `summary.py:54` is called inside `_build_shell_summary`, which is invoked from the `/me/shell-summary` endpoint at line 81-92, cached via `SHELL_SUMMARY_CACHE` keyed on `build_permission_sensitive_cache_key(current_user)`. Replacement should pass `build_me_capabilities(current_user).can_view_governance` directly (no async fan-out required; the builder is pure).
- Final Phase 2-B verdict: CORRECT.

---

## Item #39 — Loop A said: AdminConsoleCapabilities is a static stub — 4 booleans hardcoded `True`

- Quote check: PASS. `backend/app/api/v1/endpoints/admin/capabilities.py:17-22` literal:
  ```
  return AdminConsoleCapabilities(
      can_revoke_sessions=True,
      can_run_directory_check_all=True,
      can_update_log_config=True,
      can_export_loaded_audit_logs=True,
  )
  ```
- Importer count: PASS.
  - Schema: `frontend/src/services/admin/adminTypes.ts:18-23` — TypeScript interface with 4 keys all `boolean`.
  - Schema: `frontend/src/services/api/schemas/admin.ts:38-43` — `passthroughObject({ can_revoke_sessions: z.boolean(), can_run_directory_check_all: z.boolean(), can_update_log_config: z.boolean(), can_export_loaded_audit_logs: z.boolean() })`.
  - Frontend consumers: `frontend/src/services/admin/adminRequests.ts` exposes the request; `pages/admin-console/sections/audit/AuditLogsPanel.tsx:56` and `pages/admin-console/sections/ops/SessionsPanel.tsx:27` use `queryKey: ['adminCapabilities']`.
- Drift bug verification (#37): N/A
- Stub verification (#39): GENUINE STUB. The endpoint binds `current_user` ONLY to enforce `Depends(require_platform_admin)` (line 14), then explicitly discards it (`_ = current_user`, line 16). All four booleans are literal `True`. There is no schema-level dependency that would justify the `True` (e.g. no admin role tier feature flag, no per-capability gate). Loop A is correct: this is a static stub.
  - Functional consequence: any non-platform-admin user is rejected at the dependency gate; any platform-admin user gets `(True, True, True, True)`. Equivalent to `is_platform_admin = (require_platform_admin(user) succeeded)`.
- Defer override soundness: N/A (dev accepted)
- Blocker missed: minor — Loop A claims "currently equivalent to `is_platform_admin = (require_platform_admin(user) succeeded)`" — true. The recommended landing place `app/services/_authorization_capabilities/admin.py` is sibling to `me.py` (verified: 11 modules in that package; `admin.py` does not exist). The schema home `backend/app/schemas/admin.py:99-105` referenced in dev answer is also where the Pydantic shape lives.
- Final Phase 2-B verdict: CORRECT.

---

## Item #46 — Loop A said: 45 inline `queryKey:` literals across 22 files (corrects Phase 1's 44)

- Quote check: PASS for sole-existing-factory citations.
  - `frontend/src/lib/issueQueryKeys.ts:1` — `export type IssueSessionScope = number | 'anonymous';`.
  - `issueQueryKeys.ts:7-9` — `issueDetailQueryKey` returns `['issue', toIssueSessionScope(userId), issueId] as const`.
  - `issueQueryKeys.ts:11-16` — `issueHistoryQueryKey` returns `['issue-history', toIssueSessionScope(userId), issueId ?? null] as const`.
- Importer count (fresh grep): PASS.
  - `grep -rn "queryKey:" frontend/src --include="*.ts" --include="*.tsx" | wc -l` → 45.
  - `grep -rn "queryKey:" frontend/src --include="*.ts" --include="*.tsx" | awk -F: '{print $1}' | sort -u | wc -l` → 22.
  - 45 / 22 confirmed exactly. Loop A's increment over Phase 1's 44 is real.
  - Note: 4 of the 45 are inside `useRiskHubConfigResource.ts` (`onSuccess: () => queryClient.invalidateQueries({ queryKey: definition.queryKey })`) — those re-use a passed-in `definition.queryKey`, so they're already factory-style; the registry refactor only needs to swap the inline string-array constructions at the call sites that supply `definition.queryKey`.
- Drift bug verification (#37): N/A
- Stub verification (#39): N/A
- Defer override soundness: N/A
- Blocker missed: none.
- Final Phase 2-B verdict: CORRECT.

---

## Item #47 — Loop A said: RetryPolicy seam at `ApiClientCore.ts:25-72` is session-refresh-specific (not generic retry)

- Quote check: PASS.
  - `ApiClientCore.ts:25-30` — `private shouldAttemptSilentSessionRefresh(pathname: string, attempt: number): boolean { if (isExplicitLogoutSuppressed()) return false; if (attempt > 0) return false; if (pathname.startsWith('/api/v1/auth/')) return false; return true; }`.
  - `ApiClientCore.ts:61-72` — 401 branch in `executeRequest`: gates on `shouldAttemptSilentSessionRefresh`, awaits `trySilentSessionRefresh()` (from `@/services/session/sso`), recurses with `attempt + 1`.
  - Imports at `ApiClientCore.ts:1-4`: `isExplicitLogoutSuppressed`, `clearAuthenticatedSession`, `trySilentSessionRefresh` — all session-refresh-specific.
- Drift bug verification (#37): N/A
- Stub verification (#39): N/A
- Defer override soundness: N/A
- Blocker missed: confirms developer's "modification" framing — this IS session-refresh-only, NOT a generic retry. The `App.tsx:14-15` `retry: 1` (TanStack Query default) is unrelated; Loop A is right to call that out as a separate concern.
- Final Phase 2-B verdict: CORRECT.

---

## Item #48 — Loop A said: 2-file split (getErrorMessageKey + errorCodeMap), 1 lookup user, 3 callsites of getErrorMessageKey, mechanical merge

- Quote check: PASS.
  - `frontend/src/i18n/getErrorMessageKey.ts:1` — `import { ERROR_CODE_TO_KEY } from '@/i18n/errorCodeMap';`.
  - `frontend/src/i18n/getErrorMessageKey.ts:4-19` — `export function getErrorMessageKey(code?: string | null, status?: number): ErrorMessageKey { ... }` with status-based fallback table for 401/403/404/422/500.
  - `frontend/src/i18n/errorCodeMap.ts:3-14` — `export const ERROR_CODE_TO_KEY: Record<UiErrorCode, ErrorMessageKey> = { ... }` with 10 entries.
- Importer count (fresh grep): essentially correct; with one nuance.
  - `ERROR_CODE_TO_KEY` private to `getErrorMessageKey.ts:1` — confirmed via `grep -rn ERROR_CODE_TO_KEY frontend/src` (sole import inside the function).
  - `getErrorMessageKey` callsites: `services/api/apiErrors.ts` (Loop A says lines 26, 63, 70 — confirmed at the import level), `ApiClientCore.ts:44` (`'REQUEST_FAILED', response.status`), `ApiClientCore.ts:79` (`'UNAUTHORIZED', 401`).
  - Dev answer also flags `responseParsing.ts` as a caller — checked: that file imports `getErrorMessageKey` indirectly via `apiErrors` rather than directly. Both readings are defensible; Loop A is more precise on direct callsites.
- Drift bug verification (#37): N/A
- Stub verification (#39): N/A
- Defer override soundness: N/A
- Blocker missed: none. Audit at `2026-05-09-deepening-audit.md:1195` corroborates "fold `getErrorMessageKey.ts` + `errorCodeMap.ts` into `errorKeys.ts`" (line not re-verified — Loop A pulled this; trust as plausibly current).
- Final Phase 2-B verdict: CORRECT.

---

## Item #64 — Loop A said: Sole `new QueryClient(...)` site at `App.tsx:11-18`, no extracted module exists

- Quote check: PASS. `frontend/src/App.tsx:11-18`:
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
  And `App.tsx:59` — `<QueryClientProvider client={queryClient}>`.
- Importer count (fresh grep): PASS — `find frontend/src -name "queryClient.ts"` returns nothing; sole construction site confirmed.
- Drift bug verification (#37): N/A
- Stub verification (#39): N/A
- Defer override soundness: N/A
- Blocker missed: none.
- Final Phase 2-B verdict: CORRECT.

---

## Item #66 — Loop A said: Defer-override PROMOTE TO ACCEPT; real prereq is #37 + #39 (not ADR-011 #72)

- Quote check: PASS.
  - `frontend/src/contexts/AuthContext.tsx:11-23` — 11 fields on `AuthContextType` (verified).
  - `AuthContext.tsx:27-44` — composes `useSessionSnapshot()`, `usePreferenceHydration()`, `useAuthActions()`, `useAuthBootstrap()`. Loop A's structural decomposition matches.
  - `AuthContext.tsx:50-67` — fresh object literal in provider value (memoization concern verified).
- Importer count: sub-modules at `contexts/auth/{usePreferenceHydration.ts (29), useAuthBootstrap.ts (75), useAuthActions.ts (87), permissions.ts (17)}` exist — Loop A line counts off by ±1 (e.g. `useAuthBootstrap.ts` is 75, Loop A said 19-75 line range is fine; `useAuthActions.ts` is 87 lines, Loop A says 32-87 range fine). All sub-modules are real.
- Drift bug verification (#37): N/A
- Stub verification (#39): N/A
- Defer override soundness: SOUND, but the framing needs a small correction.
  - Audit dependency graph at `2026-05-09-deepening-audit.md:1610` — `FE-N5 ← S8.7 + S7.10` (Tier 2). VERIFIED in audit text. So Loop A is correct: #37 (S7.10) + #39 (S8.7) are FE-N5's audit prerequisites, not ADR-011.
  - Audit at `2026-05-09-deepening-audit.md:1654` — `S7.9 (ADR-011) ──────────────► S7.8`. VERIFIED. ADR-011 gates **#71 (S7.8)**, not #66.
  - Orchestrator's framing of "FE-N5 prereq = ADR-011" is conflated with the prereq for #71. Loop A's correction is correct.
  - However: dev answer's reasoning ("Splitting it before ADR-011 and admin/governance capability cleanups risks subtle auth regressions") cites BOTH the ADR AND the capability cleanups (#37, #39). Dev's Defer is more conservative than the audit's literal dependency graph; the orchestrator-override is structurally clean (the split itself doesn't depend on session-model ratification — it's a re-render-isolation refactor). PROMOTE-ACCEPT is defensible.
- Blocker missed: re-render isolation regression vector. The current `AuthContext.Provider value={{ ... }}` (line 51-65) is a fresh object literal every render; the 8 contexts (`useAuthz`, `usePermissions`, etc.) downstream will see ref churn. Splitting into Session/Actions contexts must NOT introduce additional unmemoized object literals; tests at `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` and `tests/frontend/unit/src/contexts/__tests__/` would catch a regression but only via re-render counts, which are not currently asserted.
- Final Phase 2-B verdict: CORRECT-WITH-CORRECTION. The override is sound. The corrected dependency framing matters: schedule #66 AFTER #37 + #39 land (per audit graph); ADR-011 (#72) is NOT a prerequisite for #66.

---

## Item #67 — Loop A said: useResourcePanelQuery does not yet exist; lift target is `useRiskHubConfigResource.ts` (180 lines)

- Quote check: PASS.
  - `find frontend/src -name "useResourcePanelQuery*"` → empty. Confirmed.
  - `frontend/src/components/riskhub/useRiskHubConfigResource.ts` exists. Length: 179 lines (Loop A said 180; off-by-one; trivial).
  - Definition shape: `useRiskHubConfigResource.ts:12-22` — `RiskHubConfigResourceDefinition<TItem, TCreate, TUpdate>` with `queryKey, load, create, update, delete, restore, itemId, panelCapabilityKey, includeShowInactive`. VERIFIED.
  - State shape: lines 32-52 — `RiskHubConfigResourceState<TItem, TCreate, TUpdate>` exposes panel + mutation fields. VERIFIED.
  - Hook body lines 79-179 (Loop A said 79-179) — uses `useQuery` (line 85), 4 `useMutation` calls (lines 90, 100, 110, 120). VERIFIED.
- Importer count (fresh grep): not central; `useRiskHubConfigPanelState.ts` exists at `frontend/src/components/riskhub/useRiskHubConfigPanelState.ts` (50 lines), keeping panel-state as a separate hook — Loop A is right that this can stay caller-provided.
- Drift bug verification (#37): N/A
- Stub verification (#39): N/A
- Defer override soundness: N/A
- Blocker missed: none.
- Final Phase 2-B verdict: CORRECT.

---

## Item #68 — Loop A said: Defer-override PROMOTE TO ACCEPT; 21 widget tsx files; 6 use useDashboardFilters

- Quote check: PASS for widget shape.
  - `KRIBreachWidget.tsx:1-39` — uses `useTranslation('dashboard')`, `useDashboardFilters()`, local `[isLoading, setIsLoading]`, `useEffect` keyed on `[filters.departmentId]`, three render branches (loading skeleton at line 41-45, empty at 47-50, data render below).
  - The "glass-card animate-pulse h-[300px]" pattern is verbatim at line 42.
- Importer count (fresh grep): PARTIALLY CORRECT.
  - Dashboard `.tsx` files: 21 confirmed (`ls frontend/src/components/dashboard/*.tsx | wc -l` = 21). Note 1 of these is `departmentTablePresentation.tsx` (a presentational helper); it's still .tsx, so it counts. Loop A's 21 is accurate.
  - `useDashboardFilters` consumers: 6 (`grep -rln useDashboardFilters frontend/src/components/dashboard/` → CategoryBreakdownCharts, DepartmentTable, RiskDrilldownModal, FilterBar, KRIStatusWidget, KRIBreachWidget). Confirmed.
  - **Mutator count CORRECTION**: Loop A says `DashboardFilterContextType` exposes 7 mutators. ACTUAL count from `frontend/src/contexts/DashboardFilterContext.tsx`:
    - `setDepartmentId`, `setRiskLevel`, `setControlStatus`, `setControlForm`, `setViewMode`, `resetFilters` = **6 mutators** (not 7).
    - Plus 2 readonly fields (`filters`, `viewMode`) and 1 computed boolean (`hasActiveFilters`). Total contract surface = 9 keys.
    - Loop A's "7 mutators" is wrong by one. The structural argument (re-renders for any mutation) survives.
- Drift bug verification (#37): N/A
- Stub verification (#39): N/A
- Defer override soundness: SOUND. The split-context + selector-subscription pattern is well-bounded; it does NOT depend on session model ratification. Loop A's sequencing (after #66) follows the audit graph at line 1611 (`FE-N8 ← FE-N5`).
- Blocker missed: minor — `frontend/src/pages/dashboard/useDashboardOverviewState.ts:21` has a 10-line `queryKey:` literal (the longest in the codebase, spans lines 21-31). This is the actual entry point for dashboard data — both #46 (query-key factory) AND #68 (scoped query) touch it. Sequencing #46 → #68 is consistent with audit Tier-2 placement.
- Final Phase 2-B verdict: CORRECT-WITH-CORRECTION. Promote-Accept is sound; mutator count is 6 not 7 (cosmetic).

---

## Item #71 — Loop A said: Defer-override PROMOTE TO ACCEPT (after #72 + #66); 8 → 4 file merge

- Quote check: PASS, with line-count off-by-ones.
  - 8 files in `frontend/src/services/session/`: `bootstrap.ts` (114), `index.ts` (7), `logoutSuppression.ts` (30), `manager.ts` (141), `refreshHint.ts` (39), `sso.ts` (66), `store.ts` (53), `types.ts` (14). VERIFIED.
  - Loop A's per-file lines (115/142/67/40/31/54/14) are uniformly +1 on all but `types.ts` — likely Loop A counted EOF newline. Cosmetic only; total ≈ 464 lines.
  - `index.ts:1-7` — barrel re-exports all 7 sibling modules. VERIFIED.
- Importer count (fresh grep): proposed merge viability check.
  - Loop A's plan: merge `refreshHint.ts` + `logoutSuppression.ts` → `sessionStorage.ts` (browser-storage helpers, ~70 lines combined). VIABLE: both are leaf primitives with no inter-dependency; `refreshHint.ts` reads `document.cookie`, `logoutSuppression.ts` reads `sessionStorage`. No shared state between them, but both are "browser storage". A single file is reasonable.
  - Loop A's plan: merge `manager.ts` + `bootstrap.ts` + `sso.ts` → `coordinator.ts` (~320 lines). VIABLE BUT DENSE: combined ≈ 321 lines. The three share state-machine ownership over the session snapshot (manager mutates, bootstrap orchestrates, sso refreshes). However, lumping them risks losing the clean separation between "single-flight bootstrap promise" (`bootstrap.ts`), "refresh-cooldown logic" (`sso.ts`), and "pure setter actions" (`manager.ts`). A 4-file split with `manager.ts` kept separate would preserve more locality (5 files: `types`, `store`, `sessionStorage`, `manager`, `coordinator`). But Loop A's 4-file collapse is defensible if the merged `coordinator.ts` is internally well-sectioned.
  - Final shape: `types.ts`, `store.ts`, `sessionStorage.ts`, `coordinator.ts` + `index.ts` barrel = **4 files** + barrel (or **5 files** counting the barrel — depends on what you count). 8 → 4 is correct if barrel is excluded both before and after. VIABLE.
- Drift bug verification (#37): N/A
- Stub verification (#39): N/A
- Defer override soundness: SOUND with sequencing caveat.
  - Audit at `2026-05-09-deepening-audit.md:1654` — `S7.9 (ADR-011) ──────────────► S7.8`. VERIFIED.
  - Audit at `2026-05-09-deepening-audit.md:1617` — "S7.8 (LOAD-BEARING; defer until S7.9 ratified, FE-N5 stable)". VERIFIED.
  - Audit at `2026-05-09-deepening-audit.md:1626` — Bucket E sequencing.
  - Promoting #71 to ACCEPT is fine ONLY if execute-order is preserved: ADR-011 (#72) authored → #66 (FE-N5 split) stable → #71. Loop A captures this constraint explicitly. The promote is a doc/process change (no longer "indefinitely deferred"), not a sequencing change.
- Blocker missed: minor — Loop A doesn't flag that `sso.ts:50` calls `applyAuthenticatedSession(refreshResponse)` and `manager.ts:138` defines that function. After the merge, this becomes intra-file. The single-flight cooldown logic in `sso.ts:11,17,49,55` (`refreshInFlight`, `lastRefreshFailureAt`, `REFRESH_FAILURE_COOLDOWN_MS`) is module-scope state that must survive the merge — easy to break in a careless `cat > coordinator.ts`. Mention this as an execution-time concern.
- Final Phase 2-B verdict: CORRECT-WITH-CORRECTION. Promote-Accept is sound; 8→4 viable; line counts off-by-one (cosmetic); module-scope state preservation is the merge's main risk.

---

## Cross-cuts and Loop A meta-checks

### A. Phase 1 importer-undercount theme
- #22 ControlForm: Phase 1 missed `ControlCreateDialog.tsx:5` (relative-path import). Loop A correctly identifies this as Phase-1 architecture map gap (`03-frontend-architecture.md:101-103` lists shims at `RiskForm.tsx`, `KRIForm.tsx`, `VendorForm.tsx` for parity but undercounts ControlForm consumers).
- This pattern is worth flagging to Phase 3: alias-only greps miss relative-path imports and `vi.mock` mock-only paths. The audit's importer counts should be re-validated on every shim deletion.

### B. ADR-011 dependency framing
- Audit text is unambiguous: ADR-011 (#72) gates #71 only. #66 is gated by #37 + #39 (Tier 2). Loop A's correction stands. Orchestrator framing in the prompt ("ADR-011 #72" as #66 prereq) was incorrect.

### C. "Static stub" pattern
- #39 AdminConsoleCapabilities is genuinely static (`_ = current_user; return AllTrue(...)`). The schema/types are stable but the values are Trues — exactly the audit's "drift surface, not bug" framing.

### D. Loop A line counts
- Multiple off-by-ones (session module files, useRiskHubConfigResource.ts). All trivially explained by EOF-newline counting. None affect substance. Phase 3 should not propagate Loop A's specific line-counts; trust the **range** but recount when refactor PRs land.

---

## Adversarial summary table

| Item | Loop A claim | Loop B verdict | Correction |
|------|--------------|----------------|------------|
| #22 | 3 prod + 3 test importers | CORRECT | none |
| #35 | 1 prod + 18 test mocks | CORRECT | none |
| #36 | 4 guards, parametric factory feasible | CORRECT | none |
| #37 | Real drift between local mirror and canonical builder | CORRECT | drift is structural; algebraically equivalent today |
| #39 | Static stub, 4 booleans hardcoded True | CORRECT | none |
| #46 | 45 keys / 22 files (Phase 1 said 44) | CORRECT | 4 of 45 are factory-style already |
| #47 | Session-refresh-only retry, not generic | CORRECT | none |
| #48 | 2-file split, mechanical merge | CORRECT | none |
| #64 | Sole construction site at App.tsx:11-18 | CORRECT | none |
| #66 | Defer-override PROMOTE; prereq is #37+#39 not ADR-011 | CORRECT-WITH-CORRECTION | dependency framing |
| #67 | useResourcePanelQuery does not exist; lift target ~180 lines | CORRECT | line count off-by-one |
| #68 | Defer-override PROMOTE; 21 widgets, 6 use filters | CORRECT-WITH-CORRECTION | mutators are 6 not 7 |
| #71 | Defer-override PROMOTE (after #72+#66); 8→4 viable | CORRECT-WITH-CORRECTION | line counts off-by-one; module-scope state preservation risk |

**Net for Phase 3**: All 13 of Loop A's verdicts survive adversarial re-review. Three corrections (#37 framing, #66 dependency, #68 mutator count) are non-blocking refinements. Phase 3 should land #22, #35, #36, #46, #47, #48, #64 first (no prereqs); then #37 + #39 (capability builder consolidation); then #66 (FE-N5 after #37+#39); then #67 (after #46); then #72 ADR-011; then #71; then #68 (after #66).
