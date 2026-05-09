# Phase 6 — Recipe-06 Empirical Verification (Frontend dead-code, utilities, query-key factory)

Phase: **6** (recipe empirical verification).
Mode: **EMPIRICAL** — read actual code today; would each RED test fail? Will GREEN gates pass?
Reference: `.planning/audits/_context/recipe-06-frontend-deadcode.md`.
Items verified: **#4, #5, #6, #22, #23, #32, #46, #47, #48, #64** (10 items).
Convention: each verification block matches the P6-V1 shape (FACTS / RED-WOULD-FAIL / GREEN-WOULD-PASS / RISKS / VERDICT).

---

## Item #4 — FE-deadcode-1: delete `controlFormWorkflow.ts`

**FACTS (verified today):**
- File exists: `frontend/src/components/control-form/controlFormWorkflow.ts` — confirmed.
- Line count: **3 lines** — matches recipe.
- Content (verbatim ≤15 words): `export function buildControlOwnerOptionLabel(name: string | null | undefined): string`.
- Importer grep: `grep -rn "controlFormWorkflow" frontend/ tests/frontend/` → **0 matches** (truly orphan).
- Sibling file `useControlFormWorkflow.ts` exists (different basename) — no collision risk for grep with anchored `controlFormWorkflow.ts` searches.

**RED-WOULD-FAIL today:** YES. The absence test (`fs.existsSync(...)` → expect false) will fail because the file exists.

**GREEN-WOULD-PASS:** YES. With zero importers, `git rm` makes typecheck pass; absence test flips to PASS.

**RISKS:** None. Pure deletion, zero importers in code or tests.

**VERDICT:** ✅ Recipe accurate. Empirically actionable as written.

---

## Item #5 — FE-deadcode-2: delete `orphanResolutionPresentation.ts`

**FACTS:**
- File exists: `frontend/src/components/governance/orphanResolutionPresentation.ts` — confirmed.
- Line count: **1 line** — matches recipe.
- Content (verbatim): `export { buildOrphanResolutionLabel } from './orphanResolutionState';`.
- Importer grep: `grep -rn "orphanResolutionPresentation" frontend/ tests/frontend/` → **0 matches**.
- Re-export target `./orphanResolutionState` — exists in same directory (relied on by behavior assertion).

**RED-WOULD-FAIL today:** YES. File exists; the recipe's two-assertion test fails on first assertion.

**GREEN-WOULD-PASS:** YES. Zero importers; deletion is safe. Second assertion (`buildOrphanResolutionLabel` still exported from `orphanResolutionState`) is a positive coverage check unchanged by deletion.

**RISKS:** None.

**VERDICT:** ✅ Recipe accurate.

---

## Item #6 — FE-deadcode-3: delete `notifications/resourcePath.ts`

**FACTS:**
- File exists: `frontend/src/components/notifications/resourcePath.ts` — confirmed.
- Line count: **4 lines** (recipe says "4-line re-export") — matches.
- Content (verbatim): `export { getNotificationPath, getNotificationResourcePath } from './notificationPresentation';`.
- Importer grep: `grep -rn "from.*notifications/resourcePath" frontend/ tests/frontend/` → **0 matches**.

**RED-WOULD-FAIL today:** YES. File exists.

**GREEN-WOULD-PASS:** YES. Zero importers; deletion is safe.

**RISKS:** None.

**VERDICT:** ✅ Recipe accurate.

---

## Item #22 — S2.8: delete `ControlForm.tsx` 1-line shim

**FACTS:**
- Shim exists: `frontend/src/components/ControlForm.tsx` — **1 line** confirmed.
- Content (verbatim): `export { ControlForm } from './control-form/ControlFormContainer';`.
- Importer grep: **3 prod importers** confirmed (recipe-claimed):
  - `frontend/src/pages/ControlEditPage.tsx:6` → `import { ControlForm } from '@/components/ControlForm';`
  - `frontend/src/pages/ControlNewPage.tsx:6` → `import { ControlForm } from '@/components/ControlForm';`
  - `frontend/src/components/ControlCreateDialog.tsx:5` → `import { ControlForm } from './ControlForm';`
- **ADDITIONAL test importer found** (recipe omits): `tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14` → `import { ControlForm } from '@/components/ControlForm';`. This is a **test** importer; recipe's "3 prod importers" count is technically correct but the GREEN diff section in the recipe doesn't list this 4th edit. The verification gate `npm run -w tests/frontend/unit typecheck` will fail until the test file is also migrated.

**RED-WOULD-FAIL today:** YES. Shim exists.

**GREEN-WOULD-PASS:** Conditional. PASS only if the implementer also migrates the test importer. The recipe's text says "Spot-check: `rg from '@/components/ControlForm'` frontend/ tests/frontend/ → 0 matches" — this implicitly requires the test file too, but the GREEN diff block does not enumerate it. Minor recipe oversight.

**RISKS:** 🟡 Recipe under-specifies the test-file edit. Add to GREEN: also edit `approval_ui_rendering.spec.tsx:14`.

**VERDICT:** 🟡 Recipe accurate on prod claim; needs minor amendment to mention test importer migration.

---

## Item #23 — S2.9: inline `controlFormUtils` helpers

**FACTS:**
- Source: `frontend/src/components/control-form/controlFormUtils.ts` — exists, **12 lines** including blank-line, with 2 exports.
- Two exports verified in source: `formatFrequencyLabel(value: string): string` and `getControlFormErrorKey(error: unknown, fallback = 'errorKeys.unknown'): string`.
- In-tree consumers (verified by grep, exactly **3** as recipe claims):
  - `frontend/src/components/control-form/ControlFormExecutionStep.tsx:5` imports `formatFrequencyLabel`.
  - `frontend/src/components/control-form/useControlFormLookups.ts:9` imports `getControlFormErrorKey`.
  - `frontend/src/components/control-form/useControlFormWorkflow.ts:14` imports `getControlFormErrorKey`.
- All three live in `control-form/` directory — confirms recipe ordering note "both touch `control-form/`".
- `ApiClientError` is exported from `@/services/apiClient` (verified — `getControlFormErrorKey` references `ApiClientError`).

**RED-WOULD-FAIL today:** YES. File exists; absence test fails.

**GREEN-WOULD-PASS:** YES. Inlining + delete is straightforward. Minor recipe-flagged duplication of `getControlFormErrorKey` across `useControlFormLookups.ts` and `useControlFormWorkflow.ts` is intentional (recipe's REFACTOR note acknowledges).

**RISKS:** None — Phase 4 already authorized intentional duplication.

**VERDICT:** ✅ Recipe accurate.

---

## #22 → #23 ordering verification

Both files live under `frontend/src/components/control-form/` (or import via `@/components/...` reaching that directory). The strict order constraint makes sense to avoid concurrent diffs in one tree. Verified consistent.

---

## Item #32 — S5.8: extract generic vendor linked-entity tab

**FACTS (line counts):**
- `frontend/src/components/vendors/VendorLinkedRisksTab.tsx` — **202 lines** (recipe claimed 200 — close).
- `frontend/src/components/vendors/VendorLinkedControlsTab.tsx` — **203 lines** (recipe match).
- `frontend/src/components/vendors/VendorLinkedKRIsTab.tsx` — **199 lines** (recipe claimed 200 — close).
- All three have identical opening import block shape: `useCallback, useEffect, useMemo, useState`, `motion`, `LinkManagementDialog`, `ExistingLinkItem`, `useTranslation`, `vendorLinkApi`, `logError`. Distinct: card component (`VendorLinkedRiskCard` / `VendorLinkedControlCard` / `KRIGaugeCard`), type (`LinkedRisk` / `LinkedControl` / `LinkedKRI`), prop names (`canCreateRisk` etc.).
- All three define `type DialogMode = 'links-only' | 'search-only';` — identical.
- All three follow same skeleton shape (state, refresh, handlers, render).

**RED-WOULD-FAIL today:** YES. The recipe's hook test imports `'@/components/vendors/useVendorLinkedEntities'` (does not exist); component test imports `'@/components/vendors/VendorLinkedEntitiesTab'` (does not exist). Both fail at module resolution.

**GREEN-WOULD-PASS:** YES. The three tabs are sufficiently parallel (~95% structurally identical) to extract a generic, as recipe describes.

**RISKS:** 🟡 The "differences" section (#32 of recipe) lists 7 axes of variance — all genuine. The generic component as designed accepts adapters/render-props/i18n-key props that subsume all 7. Effort estimate "M" is plausible but on the optimistic side given full migration of 3 tabs + new generic ≈ 600 LoC churn.

**VERDICT:** ✅ Recipe accurate; tabs verified similar enough to extract a generic.

---

## Item #46 — FE-N1: promote query-key factories (with budget-ratchet) — **CRITICAL**

**FACTS:**
- **Inline `queryKey: [` literal count: `grep -rnE "queryKey:\s*\[" frontend/src/` → exactly `33` matches.**
  - This **matches the recipe's Phase 4 correction** (33, NOT the prompt's earlier 45).
  - The prompt-side `grep -rn "queryKey:" frontend/src/` returns 45 (because that captures factory-call sites like `queryKey: issueDetailQueryKey(...)`, `queryKey: definition.queryKey`, `queryKey: resourceQueryKey(...)`, plus type-annotation lines `queryKey: QueryKey;`). Subtracting these (12 non-inline-literal hits: 4 `definition.queryKey`, 1 `resourceQueryKey`, 2 `issueDetailQueryKey`, 3 `issueHistoryQueryKey`, 2 `QueryKey;` annotations) gives **45 − 12 = 33**. Recipe's 33 is empirically correct.
- Existing factory-pattern prior art: `frontend/src/lib/issueQueryKeys.ts` already exports `issueDetailQueryKey` and `issueHistoryQueryKey` — used at 5 sites. The recipe doesn't mention this existing factory; the budget logic excludes these sites correctly because they don't use `queryKey: [` literals.
- No existing `frontend/src/lib/queryKeys/` directory — confirmed.
- No existing `tests/frontend/unit/src/lib/queryKeys/` directory — confirmed.
- Vitest supports `__dirname` (verified at `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts:8` uses `resolve(__dirname, '../../../../..')`). Recipe's path-back-counting in the budget test (`'../../../../../../../frontend/src'`) is plausible.
- Existing test convention uses `process.cwd()` more often than `__dirname`; the recipe's `__dirname` choice is defensible but inconsistent with the dominant convention. Either works.

**RED-WOULD-FAIL today:** YES.
- Pre-Commit-A: budget test imports nothing yet, file doesn't exist; test won't be discovered → vacuously "no test fail" but also no factories. Recipe's plan calls Commit A "create framework, budget=33", which **passes** because count=33 ≤ 33. So Commit A's budget test is GREEN immediately — that matches recipe's text "Before Commit A: FAIL (file does not exist)".
- Each subsequent commit (B, C, D, E) decrements `MAX_INLINE_QUERY_KEYS`; if any decrement happens without migration, count > budget → FAIL (per recipe).

**GREEN-WOULD-PASS:** YES. The walk pattern, regex `queryKey:\s*\[`, and count semantics are all empirically valid (just verified the same regex returns 33 against current code).

**RISKS:**
- 🟢 Budget regex `queryKey:\s*\[` is exact and won't accidentally match factory call sites (`queryKey: someFactory()` lacks `[`). Confirmed empirically.
- 🟢 Walker excludes test files via `!/\.test\.[tj]sx?$/.test(entry.name)` — covers `.test.ts/.tsx` but NOT `.spec.ts/.tsx`. Frontend uses both extensions (`approval_ui_rendering.spec.tsx`, etc.). Minor — but `walk()` starts at `frontend/src` not `tests/`, so this is moot for the budget metric. **Not a defect.**
- 🟡 Recipe doesn't track 5 sites that already use the existing `issueQueryKeys.ts` factory + 4 sites using `definition.queryKey` + 1 site using `resourceQueryKey`. These remain valid factory consumers; budget remains 33 because they don't add inline literals.

**VERDICT:** ✅ Recipe accurate. **Empirical count: 33, exactly matches recipe's claim.** Prompt's 45 was raw-grep count and was correctly noted as wrong.

---

## Item #47 — FE-N4: extract session-refresh policy from `ApiClientCore.ts`

**FACTS:**
- File: `frontend/src/services/api/ApiClientCore.ts` — **169 lines total**.
- Lines 25-30 hold `private shouldAttemptSilentSessionRefresh(pathname: string, attempt: number): boolean { ... }` — verified verbatim.
- Lines 61-73 hold the inline `if (response.status === 401)` retry/refresh/clear logic in `executeRequest`. Recipe's "lines 61-73" is approximately accurate (actual: 61-82 wraps the full block; the core retry decision is at 62-72).
- Function uses `isExplicitLogoutSuppressed`, `trySilentSessionRefresh`, `clearAuthenticatedSession` — all imported from session services — recipe's extraction plan dependencies match.
- Existing covering test: `tests/frontend/unit/src/services/__tests__/apiClient.401-recovery.test.ts` exercises the 401 retry behavior. Recipe says "existing tests must continue to pass" — empirically true; this file tests the integration.

**RED-WOULD-FAIL today:** YES. The recipe's RED test imports `'@/services/api/sessionRefreshPolicy'` (file does not exist).

**GREEN-WOULD-PASS:** YES. The extraction is strictly behavior-preserving (same inputs → same outputs); existing 401-recovery integration test will continue to pass.

**RISKS:**
- 🟡 Recipe's diff drops the inline `clearAuthenticatedSession({ clearBootstrap: true })` and `throw new ApiClientError(...)` from `ApiClientCore.executeRequest`. The new `applySessionRefreshPolicy` returns `{kind: 'unauthorized'}` BUT also throws on "unauthorized" path internally (recipe lines 1021-1027). The `ApiClientCore` caller code shrinks to only check `outcome.kind === 'retry'` for the retry path, but never reads `'unauthorized'` because the policy throws before returning that kind. Logically correct, but reading the recipe diff suggests dead code (`outcome.kind === 'unauthorized'` is never evaluated in `executeRequest`). Defensible since `applySessionRefreshPolicy` always either returns `{kind:'retry'}` or throws.

**VERDICT:** ✅ Recipe accurate; minor logical-flow note above is internal to the policy and doesn't break the recipe.

---

## Item #48 — FE-N6: merge `i18n/getErrorMessageKey.ts` + `i18n/errorCodeMap.ts`

**FACTS:**
- `frontend/src/i18n/getErrorMessageKey.ts` exists — **19 lines** (recipe matches `1-19`).
- `frontend/src/i18n/errorCodeMap.ts` exists — **14 lines** (recipe matches `1-14`).
- `getErrorMessageKey.ts` content verified: imports `ERROR_CODE_TO_KEY` from `errorCodeMap`, returns `ErrorMessageKey`.
- `errorCodeMap.ts` content verified: 10-entry `Record<UiErrorCode, ErrorMessageKey>` — recipe's `expect(...).toHaveLength(10)` matches.
- Importers grep:
  - `from '@/i18n/getErrorMessageKey'`: **4 importers** found:
    1. `frontend/src/services/api/responseParsing.ts:1`
    2. `frontend/src/services/api/ApiClientCore.ts:1`
    3. `frontend/src/services/api/apiErrors.ts:1`
    4. `tests/frontend/unit/src/i18n/__tests__/errorKeyMapping.spec.ts:2`
  - `from '@/i18n/errorCodeMap'`: **1 importer** (the to-be-deleted `getErrorMessageKey.ts` itself).
- Recipe's "Estimated importers: `frontend/src/services/api/ApiClientCore.ts:1` (verified above) plus any other files" — empirical truth is 3 prod + 1 test for `getErrorMessageKey`; recipe correctly defers to grep-driven enumeration.

**RED-WOULD-FAIL today:** YES. Recipe's RED test imports `'@/i18n/errorMessageKey'` (file does not exist).

**GREEN-WOULD-PASS:** YES. Combining is straightforward; 4 importer migrations are unambiguous. The existing `tests/frontend/unit/src/i18n/__tests__/errorKeyMapping.spec.ts` continues to test the merged module after import path migration.

**RISKS:**
- 🟢 Recipe's "Estimated importers" needs grep-driven discovery of 4 importers (3 prod + 1 test). The text already says this — empirically the count is 4 and confirmed.
- 🟢 The 10-entry assertion is exact (verified ERROR_CODE_TO_KEY has exactly 10 keys: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, NETWORK_ERROR, REQUEST_TIMEOUT, SERVER_ERROR, REQUEST_FAILED, DEMO_LOGIN_FAILED, UNKNOWN_ERROR).

**VERDICT:** ✅ Recipe accurate.

---

## Item #64 — FE-N2: extract QueryClient defaults from `App.tsx`

**FACTS:**
- File: `frontend/src/App.tsx` — confirmed.
- Lines 11-18 hold `const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 1000 * 60, retry: 1 } } });` — verified verbatim (matches recipe).
- Line 3 imports `QueryClient, QueryClientProvider` from `@tanstack/react-query` — needs migration to drop `QueryClient`.
- No existing `frontend/src/services/api/queryClient.ts` — confirmed (only `tests/frontend/unit/src/test/queryClient.ts` for the test client).
- No existing `frontend/src/lib/queryClient.ts` — confirmed (recipe's target path is greenfield).
- Existing files in `frontend/src/lib/`: `riskScoreTheme.ts`, `monitoringStatus.ts`, `approvalUi.ts`, `capabilities.ts`, `utils.ts`, `executionResult.ts`, `issueQueryKeys.ts` — recipe's new file `lib/queryClient.ts` doesn't conflict.

**RED-WOULD-FAIL today:** YES. Recipe's test imports `'@/lib/queryClient'` (file does not exist) → module-not-found.

**GREEN-WOULD-PASS:** YES. Pure extraction; behavior unchanged. `App.tsx` smoke-mount tests (if any exist) continue to pass.

**RISKS:** None.

**VERDICT:** ✅ Recipe accurate.

---

## Critical verifications (recap)

### #46 site count (queryKey budget) — CONFIRMED

- Recipe claim: **33 inline `queryKey: [` literals**.
- Empirical (`grep -rnE "queryKey:\s*\[" frontend/src/` today): **33**.
- Prompt's earlier 45 figure: derived from `grep -rn "queryKey:"` (raw, captures all `queryKey:` references including factory calls and type annotations). Recipe correctly uses the more specific `\s*\[` pattern.
- Distribution of 33 across 17 source files:
  - `riskhub/` cluster (~12 sites): `useRiskHubCapabilities.ts` (1), `ApprovalScenariosPanel.tsx` (2), `RiskTypesPanel.tsx` (1), `DepartmentsPanel.tsx` (2), `roles/useRolesPanelData.ts` (2), `SystemSettingsPanel.tsx` (2), `useRiskHubConfig.ts` (3 — in `frontend/src/hooks/` not `riskhub/`).
  - `admin-console/` cluster (~13 sites): `audit/AuditLogsPanel.tsx` (3), `audit/LogSettingsPanel.tsx` (2), `ops/HealthPanel.tsx` (4), `ops/LogsPanel.tsx` (1), `ops/SessionsPanel.tsx` (5).
  - `dashboard/Sidebar.tsx` (1), `dashboard/useDashboardOverviewState.ts` (1).
  - `pages/GovernancePage.tsx` (1), `pages/DocumentationPage.tsx` (1), `components/settings/DocumentationSettings.tsx` (1).
  - Total: **33** (matches).

### #46 budget-ratchet test pattern — VERIFIED EMPIRICALLY VALID

- `node:fs` and `node:path` are available in vitest tests (multiple existing tests use them).
- `__dirname` works (verified at `useAuthz.invariant.test.ts`).
- `walk()` recursive pattern with `readdirSync(... withFileTypes: true)` is standard Node API; matches existing test patterns in `architecture/noInlineReactI18nextMock.test.ts:10-22`.
- Regex `/queryKey:\s*\[/g` is sound — it matches ONLY inline-literal call sites because factory calls look like `queryKey: someFactoryFn(...)` (no `[` after `queryKey:`).

### #22 → #23 ordering — VERIFIED

Both items touch `frontend/src/components/control-form/`. The strict-sequential ordering (#22 first, then #23) avoids concurrent edits to the same directory tree.

### #32 generic-extract feasibility — VERIFIED

The three Vendor tabs are 199-203 lines each, ~95% structurally identical (same imports modulo card type, same `DialogMode`, same skeleton). Generic extraction is empirically feasible.

---

## Issues found

| # | Severity | Issue |
|---|---|---|
| #22 | 🟡 | Recipe claims "3 prod importers" (correct) but GREEN diff section omits the 4th importer in `tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14`. Typecheck gate forces the implementer to discover and migrate this; minor recipe completeness gap. |
| #46 | 🟢 | Recipe doesn't acknowledge the existing `frontend/src/lib/issueQueryKeys.ts` factory (used at 5 sites). Doesn't affect budget count (33) but the recipe's "promote resource query-key factories" framing already-has-prior-art that could be referenced as an existing template. |
| #46 | 🟢 | Recipe's `walk()` excludes `.test.ts/.tsx` but not `.spec.ts/.tsx`. The walker starts at `frontend/src/`, so this is moot — no test files live under `frontend/src/`. **Not a defect.** |
| #47 | 🟢 | The recipe's diff suggests `outcome.kind === 'unauthorized'` is "checked" in `ApiClientCore`, but `applySessionRefreshPolicy` always throws before returning `'unauthorized'`. Logically correct (unreachable branch); minor recipe-readability nit. |

---

## Recommendations

1. **#22**: Amend the recipe's GREEN diff section to enumerate the 4th importer (`tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14`). One-line addition.
2. **#46**: Add a one-line preface in the recipe acknowledging `frontend/src/lib/issueQueryKeys.ts` as existing prior art that the new `frontend/src/lib/queryKeys/` directory parallels. No code change.
3. **#47**: Optional cosmetic — clarify in the recipe that `applySessionRefreshPolicy` throws on the "unauthorized" path, so the caller's `outcome.kind === 'retry'` check is the only path that returns to caller.
4. **All items**: Recipe's RED-test path-back patterns (`'../../../../../../frontend/src/...'`) should be empirically counted by the implementer when files are created (vitest's import-resolution failure messages will surface incorrect counts immediately). The path patterns shown in the recipe are best-effort but specific to each file's depth — implementer should validate by running the absence test once after writing.

---

## Per-item verdict summary

| ID | Verdict | RED would FAIL today? | GREEN-passable? | Notes |
|---|---|---|---|---|
| #4 | ✅ | YES | YES | Pure deletion, 0 importers, 3 lines confirmed. |
| #5 | ✅ | YES | YES | Pure deletion, 0 importers, 1 line confirmed. |
| #6 | ✅ | YES | YES | Pure deletion, 0 importers, 4 lines confirmed. |
| #22 | 🟡 | YES | Conditional | 3 prod importers confirmed; **+1 test importer** recipe omits in GREEN diff. |
| #23 | ✅ | YES | YES | 12 lines, 3 in-tree consumers confirmed exactly. |
| #32 | ✅ | YES | YES | 3 tabs, 199-203 lines each, ~95% identical structure. |
| #46 | ✅ | YES | YES | **33 inline `queryKey: [` literals confirmed** (matches recipe; prompt's 45 was wrong-grep). |
| #47 | ✅ | YES | YES | Lines 25-30 + 61-73 confirmed; existing 401-recovery test continues to cover. |
| #48 | ✅ | YES | YES | 19 + 14 lines confirmed; 10-entry map confirmed; 4 importers found. |
| #64 | ✅ | YES | YES | App.tsx 11-18 confirmed; no existing `lib/queryClient.ts`. |

**Bottom line:** 9 of 10 items are recipe-accurate and empirically actionable. **Item #22** has a minor amendment-needed (recipe should mention the 4th test-file importer). Recipe is otherwise empirically grounded; the **critical #46 budget metric of 33 is confirmed exactly** against current code.

