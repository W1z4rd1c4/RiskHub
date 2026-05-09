# Verify Recipe 07 — Frontend authz + auth + dashboard + #77a (Phase 6 empirical)

Mode: EMPIRICAL VERIFICATION. Each item below was checked against the actual
current code at HEAD. Quotes are <=15 words from real files. Recipe-claimed
file/line anchors and counts are confirmed or corrected.

Format per item: STATUS, evidence (file:line + <=15-word quote), discrepancies,
test-fail-today verdict.

---

## #35 (S7.3) DELETE `usePermissions` — STATUS: CONFIRMED

- `frontend/src/hooks/usePermissions.ts` exists (20 lines), is pure passthrough.
  Body line 5: `const { user, hasPermission } = useAuth();`
  Body line 6: `const authz = useAuthz();`
  Returns `hasPermission` plus 8 `authz.*` accessors (lines 9-17).
- Production consumers: exactly 1 file (recipe says 1 — confirmed).
  `frontend/src/components/layout/Sidebar.tsx:12` ->
  `import { usePermissions } from '@/hooks/usePermissions';`
  `Sidebar.tsx:25` -> `const { hasPermission } = usePermissions();`
  Recipe's "Sidebar.tsx:25 or :12" anchor is correct (import on 12,
  call site on 25).
- `vi.mock('@/hooks/usePermissions'` test-side: **18 files** (recipe claims 18 — exact).
  All 18 paths match recipe enumeration (lines 65-82 of recipe). Cross-checked
  via `grep -rln`: 18 hits exactly.
- Failing-today verdict: structural test (`fs.existsSync(usePermissionsPath)`)
  would assert `false` but file exists -> RED today. Source-grep test for
  `from '@/hooks/usePermissions'` would find 19 hits (1 prod + 18 test) ->
  RED today. Recipe-prescribed tests fail red as written.

---

## #36 (S7.4) `BusinessRouteGuards` typed factory — STATUS: CONFIRMED

- `frontend/src/authz/BusinessRouteGuards.tsx` exists (37 lines, recipe cites
  18-36; actual guard region is lines 18-36 — exact).
- 4 explicit guards, structurally identical, each calling `useAuthz()` and
  rendering `RedirectIfDenied`:
  - `GovernanceRouteGuard` (line 18-21) -> `authz.canViewGovernance`
  - `ActivityLogRouteGuard` (line 23-26) -> `authz.canViewActivityLog`
  - `UsersRouteGuard` (line 28-31) -> `authz.canViewUsersRoute`
  - `UserLifecycleRouteGuard` (line 33-36) -> `authz.isPlatformAdmin`
- Quote (line 19): `const authz = useAuthz();` (identical across all 4).
- All 4 capability keys are boolean fields on `Authz` (recipe claim).
  Verified via existence at `policy.ts` import in `useAuthz.ts`.
- Failing-today verdict: structural test that asserts
  `function createBusinessRouteGuard<` exists -> 0 matches -> RED today.
  Test that counts `function\s+\w+RouteGuard\s*\(` -> 4 matches (would
  expect 0 post-refactor) -> RED today. Recipe tests fail red as written.

---

## #37 (S7.10) `_can_view_governance` mirror -> `build_me_capabilities` — STATUS: CONFIRMED

- `backend/app/api/v1/endpoints/users/summary.py:45-50` defines
  `_can_view_governance(current_user)` exactly as recipe claims (6 lines:
  def + try + ensure_business_view_access + except + return False + return).
- Quote (line 45): `def _can_view_governance(current_user: User) -> bool:`
- Quote (line 47):
  `ensure_business_view_access(current_user, detail="Platform admins cannot ...")`
- Quote (line 50): `return can_manage_users(current_user)`
- Imports at line 10: `from app.core.permissions import can_manage_users,
  ensure_business_view_access, has_permission` -> all three present.
- Canonical builder: `backend/app/services/_authorization_capabilities/me.py`
  exists; lines 60-62 (recipe-cited) declare the canonical
  `can_view_governance` block:
  Quote (line 60): `can_view_governance=(`
  Quote (line 61): `not is_platform_admin and has_global_scope and resource_permissions["users:write"]`
- **Algebraic equivalence**: builder's expression is logically identical to
  the local mirror (admin denied via `not is_platform_admin`, then global
  scope + users:write maps to `can_manage_users` semantics). Phase 4 correction
  ("drift-surface, not current-bug") is correct.
- Failing-today verdict: structural test that asserts
  `"_can_view_governance" not in source` -> RED today. Behavioural
  parity test (parametrised role x scope matrix) is GREEN today (algebraic
  equivalence). The pin is exclusively a regression-future-pin. Recipe is
  internally consistent.

---

## #39 (S8.7) Static admin capability stub — STATUS: CONFIRMED

- `backend/app/api/v1/endpoints/admin/capabilities.py` is 23 lines.
- Lines 14-22 are the recipe-cited static stub. Verified literally:
  - Line 14: `current_user: User = Depends(require_platform_admin),`
  - Line 16: `_ = current_user` (the recipe-claimed unused-var line; verbatim).
  - Line 17: `return AdminConsoleCapabilities(`
  - Line 18: `can_revoke_sessions=True,`
  - Line 19: `can_run_directory_check_all=True,`
  - Line 20: `can_update_log_config=True,`
  - Line 21: `can_export_loaded_audit_logs=True,`
- All 4 booleans hardcoded `True` -> CONFIRMED.
- `_ = current_user` line -> CONFIRMED literally.
- **Service module `_authorization_capabilities/admin.py` does NOT exist**
  (verified via `find`; only `me/risks/controls/issues/vendors/kris/approvals/perimeter/riskhub_config/common` exist).
  Recipe's "NEW admin.py" plan is well-grounded (gap is real).
- Failing-today verdict: structural test
  `"True" not in source.split("def get_admin_console_capabilities")[1]` ->
  4 occurrences of `True` exist -> RED today. Builder-existence test
  `from app.services._authorization_capabilities.admin import build_admin_capabilities` ->
  ImportError today -> RED. Recipe tests fail red as written.

---

## #65 (FE-N3) `crudCapabilitySchema` literal-flat — STATUS: CONFIRMED (PARSER LIMITATION VERIFIED)

- **Critical Phase 4 constraint verified**:
  `scripts/security/authz_contract_validator/capability_catalog.py` lines
  112-126 are the brace-matched parser. Read literally:
  - Line 112: `def _extract_typescript_schema_body(source: str, schema_name: str) -> str | None:`
  - Line 113-115: regex matches `passthroughObject\s*\(` only.
  - Line 120: `open_brace_index = source.find("{", match.end())`
  - Line 123: `closing_brace_index = _find_matching_closing_brace(source, open_brace_index)`
  - Line 126: `return source[open_brace_index + 1: closing_brace_index]`
- Brace-matching helper `_find_matching_closing_brace` (lines ~85-109) walks
  characters tracking `depth += 1` / `depth -= 1` per `{` / `}`. Quote
  (line 107-108): `if depth == 0: return index`.
- **It does NOT walk `.merge()` or `.extend()`** — the regex anchors on
  `passthroughObject(` and the brace-walker terminates at the matching
  `}` of that single call. Anything chained after (e.g.
  `.merge(crudCapabilitySchema)`) is invisible to the parser. Phase 4
  constraint is genuine and correctly characterised.
- Recipe's plan to keep entity schemas as
  `passthroughObject({ /* literal field list */ })` (no `.merge`/`.extend`) is
  the only parser-compatible shape.
- Failing-today verdict: contract test importing
  `crudCapabilitySchema` from `@/services/api/schemas/crudCapabilitySchema` ->
  module does not exist today -> RED. Banned-pattern test asserting body
  does NOT contain `.merge(` or `.extend(` would pass (none exist today),
  so that's GREEN today; the failure pivot is the missing module.

---

## #66 (FE-N5) Split `AuthContext.tsx` — STATUS: CONFIRMED

- `frontend/src/contexts/AuthContext.tsx` is 78 lines (recipe says 1-78 — exact).
- Lines 50-67 are the `<AuthContext.Provider value={{...}}>` block. The
  `value` object literal is constructed inline EVERY render (no `useMemo`),
  so any state change triggers all consumers to re-render — confirmed.
  Quote (line 51-52): `<AuthContext.Provider`, `value={{`
  Quote (line 53): `user: session.user,`
- 3-provider split target: recipe's split into Session/Preferences/AuthActions
  is consistent with the 3 hooks already used at lines 28-44:
  - line 28: `const session = useSessionSnapshot();`
  - lines 29-33: `usePreferenceHydration(...)` -> Preferences
  - lines 35-38: `useAuthActions({...})` -> AuthActions
  - lines 40-44: `useAuthBootstrap({...})` (consumed by Session)
- The 3 distinct value-source seams already exist; the split is mechanical.
- **Render-counter pattern viability**: vitest + `@testing-library/react` is
  used elsewhere in the repo. Pattern `useRef(0) + useEffect(() => {
  count.current += 1; }) + expect(after).toBe(before)` is a standard
  vitest/React-testing-library idiom. Compatible with current setup.
- Failing-today verdict: render-counter test where `PrefMutator` flips
  `markPreferencesReady` and asserts `dept-renders` text is unchanged ->
  TODAY the single `value={{...}}` literal causes ALL consumers to re-render
  -> RED today. Recipe test fails red as written.

---

## #67 (FE-N7) Generic `useResourcePanelQuery` — STATUS: CONFIRMED

- `frontend/src/components/riskhub/useRiskHubConfigResource.ts` is **179 lines**
  exactly (recipe says 179 or 180 — 179 confirmed).
- Already generic in `<TItem, TCreate, TUpdate>` at line 12:
  Quote: `export type RiskHubConfigResourceDefinition<TItem, TCreate, TUpdate> = {`
- Definition shape is the canonical resource-panel template (queryKey, load,
  create, update, delete, restore, itemId, panelCapabilityKey,
  includeShowInactive — lines 13-22).
- Failing-today verdict: structural test asserting line count <= 60 ->
  179 lines today -> RED. Import-test `import { useResourcePanelQuery }
  from '@/hooks/useResourcePanelQuery'` -> module does not exist ->
  RED. Recipe tests fail red as written.

---

## #68 (FE-N8) `WidgetShell` + scoped DashboardFilter — STATUS: CONFIRMED

- `frontend/src/components/dashboard/` contains exactly **21 `.tsx` files**
  (recipe says 21 — exact). Listing:
  CategoryBreakdownCharts, ControlTrendChart, DepartmentTable, FilterBar,
  IssueAgingChart, IssuesSummaryCard, KRIBreachHistoryChart, KRIBreachWidget,
  KRIStatusWidget, OpenIssuesBySeverityChart, QuarterMetricCard,
  QuarterPeriodSelector, QuarterlyComparisonFrame, QuarterlyComparisonWidget,
  RiskCommitteeCards, RiskCommitteeSection, RiskDistributionMatrix,
  RiskDrilldownModal, RiskTrendChart, SnapshotAvailabilityNotice,
  departmentTablePresentation.
  (Note: `departmentTablePresentation.tsx` is a presentation helper, not a
  widget; if "widgets" excludes it the count is 20. Recipe's claim "21
  widgets" maps to total `.tsx` files in dir.)
- 6 files import `useDashboardFilters` (recipe says 6 — exact):
  CategoryBreakdownCharts, DepartmentTable, KRIStatusWidget, FilterBar,
  RiskDrilldownModal, KRIBreachWidget. Matches recipe's enumeration verbatim.
- Failing-today verdict: shell-adoption test that imports `WidgetShell` ->
  module does not exist -> RED. Render-counter test on a scoped selector
  -> selector hook does not exist -> RED. Recipe tests fail red as written.

---

## #71 (S7.8) Merge session 8 -> 4 — STATUS: CONFIRMED (SINGLE-FLIGHT VERIFIED VERBATIM)

- `frontend/src/services/session/` contains exactly **8 `.ts` files** plus
  `README.md`:
  bootstrap, manager, sso, store, types, refreshHint, logoutSuppression,
  index. Recipe enumeration matches exactly.
- **`sso.ts:9-11` module-scope state verified VERBATIM**:
  - Line 9: `let refreshInFlight: Promise<string | null> | null = null;`
  - Line 10: `let lastRefreshFailureAt = 0;`
  - Line 11: `const REFRESH_FAILURE_COOLDOWN_MS = 1_000;`
  Recipe code block (lines 596-598 of recipe) reproduces these three
  declarations identically.
- Single-flight semantics confirmed at `sso.ts:13-26`:
  - Line 17: cooldown gate `Date.now() - lastRefreshFailureAt < REFRESH_FAILURE_COOLDOWN_MS`
  - Line 21-23: shared promise re-use:
    `if (!refreshInFlight) { refreshInFlight = runSilentSessionRefreshAttempt(); }`
- Recipe's plan to "keep the three sso.ts:9-11 declarations at the top of
  the new file" is mechanically correct: a verbatim concat preserves the
  module-scope state because all 3 are declared at module scope. Risk:
  `let` declared 3 times if the merger isn't careful — recipe explicitly
  warns and pins via the singleFlight test BEFORE the merge.
- Failing-today verdict: structural test on directory listing -> 8 files +
  README today, recipe expects 5 -> RED today. Single-flight test
  (`refreshSpy.toHaveBeenCalledTimes(1)`) -> GREEN today (already
  single-flight at `sso.ts:9-26`). The single-flight pin is preservation,
  not introduction — fails red ONLY on a careless merge (correct intent).

---

## #77a Vendor.status FE Zod soft-tolerate — STATUS: CONFIRMED

- `frontend/src/services/api/schemas/entities/vendors.ts:62` declares:
  Quote (line 62): `status: z.enum(['active']),`
  Required (no `.optional()`). Recipe's claim of `z.enum([VENDOR_STATUS_VALUES[0]])`
  is paraphrastic; actual code uses inline literal `['active']` rather than
  the constant `VENDOR_STATUS_VALUES[0]`. Effect is identical (single-value
  required enum). **Minor discrepancy**: recipe's
  `VENDOR_STATUS_VALUES[0]` framing is slightly off — the value is
  hard-coded inline.
- `linkedVendorSummarySchema` at `vendors.ts:9` is already soft-tolerant:
  Quote: `status: z.string().nullable().optional(),`
  Recipe's sanity-check claim about `vendors.ts:9` is correct.
- Failing-today verdict: `safeParse(baseVendor)` (no `status`) ->
  `result.success === false` today (status is required) -> RED. Test
  fails red as written. Recipe is correct.

---

# Critical-verification summary

## #65 parser constraint — CONFIRMED

`scripts/security/authz_contract_validator/capability_catalog.py:112-126`
uses brace-matched literal extraction:
- regex anchors on `\bpassthroughObject\s*\(`
- finds first `{` after that match
- walks chars tracking `depth` until matching `}`
- returns the slice between the two braces

It does NOT walk `.merge()`, `.extend()`, or any chained method continuation.
Anything outside the single `passthroughObject({...})` body is invisible.
Phase 4 constraint is real and correctly characterised in the recipe.

## #66 render-counter pattern — VIABLE

The `useRef(0) + useEffect(() => { count.current += 1; }) + expect(...)`
pattern is standard vitest + `@testing-library/react` idiom. The repo
already uses both in `tests/frontend/unit/`. Today's
`<AuthContext.Provider value={{ ... }}>` (lines 50-67) constructs a fresh
object literal every render -> any state change re-renders all consumers
-> render-counter test would catch the over-rendering today (RED).
Pattern viability: confirmed.

## #71 module-scope state preservation — VERBATIM CONFIRMED

`sso.ts:9-11`:
```
let refreshInFlight: Promise<string | null> | null = null;
let lastRefreshFailureAt = 0;
const REFRESH_FAILURE_COOLDOWN_MS = 1_000;
```
Recipe's merge plan (lines 596-598) reproduces these three lines verbatim.
Single-flight semantics already exist (verified at `sso.ts:13-26`). The
pin is for preservation across a refactor, not introduction.

## #39 static stub — CONFIRMED

`capabilities.py:14-22`:
- Line 16: `_ = current_user` (verbatim)
- Lines 18-21: 4 booleans hardcoded `True`
Service module `_authorization_capabilities/admin.py` does NOT exist
today (gap is real).

---

# Per-item verdicts

| Item | Status | Tests fail red today? | Notes |
|------|--------|-----------------------|-------|
| #35  | CONFIRMED | YES | 18 vi.mock files exact; 1 prod consumer (Sidebar.tsx:12 import, :25 call) |
| #36  | CONFIRMED | YES | 4 identical guards at lines 18-36 |
| #37  | CONFIRMED | Structural YES, behavioural GREEN | Algebraic-equivalence today (drift pin) |
| #39  | CONFIRMED | YES | 4 hardcoded True + `_ = current_user` verbatim |
| #65  | CONFIRMED | YES | Parser constraint is real; module missing |
| #66  | CONFIRMED | YES | Inline value={{...}} re-renders all consumers |
| #67  | CONFIRMED | YES | 179 lines exact; already generic typed |
| #68  | CONFIRMED | YES | 21 .tsx, 6 useDashboardFilters consumers |
| #71  | CONFIRMED | Structural YES, single-flight GREEN | sso.ts:9-11 verbatim; merge preserves |
| #77a | CONFIRMED | YES | status: z.enum(['active']) inline (not VENDOR_STATUS_VALUES[0]) |

---

# Issues found

1. **Minor #77a discrepancy** (cosmetic only): recipe says
   `status: z.enum([VENDOR_STATUS_VALUES[0]])` but actual code at
   `vendors.ts:62` is `status: z.enum(['active']),` (literal inline).
   No effect on the test or refactor — they're semantically equivalent.
   Suggest updating the recipe to quote the actual literal.

2. **Recipe-cited line ranges are largely exact**:
   - `summary.py:45-50` — exact (6 lines, def + 4 + return).
   - `capabilities.py:14-22` — exact.
   - `me.py:60-62` — exact (3 lines for `can_view_governance` field).
   - `BusinessRouteGuards.tsx:18-36` — exact.
   - `AuthContext.tsx:50-67` — exact (Provider value block).
   - `sso.ts:9-11` — exact, verbatim.
   - `capability_catalog.py:112-126` — exact (function definition body).

3. **#35 "Sidebar.tsx:25 or :12"** — both anchors are correct: line 12 is
   the `import`, line 25 is the call site `const { hasPermission } =
   usePermissions();`. Recipe could be tighter ("import :12, call :25") but
   isn't wrong.

4. **#37 algebraic-equivalence pin** is correctly framed by Phase 4. The
   regression-pin test is GREEN today; only the structural pin is RED.
   Recipe captures this correctly.

5. **#71 single-flight semantics are already implemented** at `sso.ts:13-26`.
   The pin is for *preservation* across the refactor, not for fixing a
   missing single-flight. Recipe wording captures this ("pin BEFORE the
   merge to lock current semantics").

6. **#68 "21 widgets"**: literal count of `.tsx` files in
   `frontend/src/components/dashboard/` is 21, but
   `departmentTablePresentation.tsx` is a presentation helper, not a
   stand-alone widget. If "widget" is interpreted strictly the count is
   20. Recipe's "21 widgets" maps to total `.tsx` count and is internally
   consistent (the WidgetShell can wrap presentation helpers as well).

---

# Recommendations

- **No structural changes to the recipe required.** All 10 items are
  empirically grounded; the failing-today tests written per recipe will
  fail red as documented (with the noted nuances around #37/#71 where
  behavioural pins are GREEN today and only structural pins are RED —
  recipe acknowledges this explicitly).
- **#77a recipe text update** (cosmetic): replace
  `status: z.enum([VENDOR_STATUS_VALUES[0]])` with the actual literal
  `status: z.enum(['active'])` to match the file. Optional polish.
- **#65 parser constraint** is the highest-stakes Phase 4 correction and
  is fully validated by the actual parser code. Recipe is safe to follow
  literally: keep entity schemas as single-call `passthroughObject({...})`
  with no chained `.merge()` / `.extend()`.
- **#66 + #68 render-counter pattern** is viable in the existing vitest
  setup. The shared helper suggestion in recipe (`renderCounter.ts`) is a
  reasonable nicety; not load-bearing.
- **#71 verbatim sso.ts:9-11** preservation: recipe's three-line code
  block matches the file exactly; a copy-paste merger preserves semantics.
  The pin test catches sloppy mergers (e.g. accidentally re-declaring
  `let refreshInFlight` per source-fragment, which would create per-file
  state and break single-flight).

---

# Phase 4 corrections re-validated

- #65 literal-flat schemas: parser constraint at `capability_catalog.py:112-126` confirmed brace-matched only.
- #66 render-counter test pattern: viable; today's inline `value={{...}}` triggers over-renders -> test fails red.
- #71 single-flight semantics preservation: `sso.ts:9-11` verified verbatim; semantics in `sso.ts:13-26` confirmed.
- #37 drift-surface (not current-bug): algebraic-equivalence between local mirror and `build_me_capabilities` confirmed.
- #39 genuinely a 4-boolean static stub: `_ = current_user` + 4 hardcoded `True` confirmed verbatim.
- #66 prereqs are #37 + #39 (not ADR-011): structurally consistent — capability builders are the value-source for the new SessionProvider's `hasPermission` and Authz state.
- #68 21 widgets / 6 useDashboardFilters consumers: confirmed exactly.
- #35 18 mock files: confirmed exactly via fresh grep.
