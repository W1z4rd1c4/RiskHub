# Phase 3 Loop 1 — Frontend Domain Plan

Domain: **Frontend authz + auth + dashboard + retry/error + frontend dead-code + form shims + linked-entity tabs**.

Items planned: **#4, #5, #6, #22, #23, #32, #35, #36, #37, #39, #46, #47, #48, #64, #65, #66, #67, #68, #71** (note: #37 and #39 are nominally backend items; they are kept here because they gate the frontend `#66` AuthContext split per `2026-05-09-deepening-audit.md:1610` `FE-N5 ← S8.7 + S7.10`).

All items respect the constraints: TDD-first (failing test or structural assertion before any prod edit); single-developer sequential execution; doc/lock-only Reject arguments are not honored. Where the audit's `2026-05-09-deepening-audit.md:1654` graph or Loop B framing imposes ordering, it is reflected in the per-item dependencies and the cross-domain notes at the end of the file.

---

## Item #4 — FE-deadcode-1 — DELETE `controlFormWorkflow.ts` (3 lines, 0 prod, 0 test)

- Final disposition: DELETE.
- Dependencies (in-domain): none.
- Cross-domain prerequisites: none.
- TDD shape: structural assertion (file-existence guard); no behavioural test.
- Failing test(s) to write FIRST:
  - `tests/frontend/unit/src/components/control-form/__tests__/controlFormWorkflow.deleted.test.ts` — assert that `import.meta.glob('@/components/control-form/controlFormWorkflow.ts')` resolves to `{}` (empty), and that no `*.ts(x)` under `frontend/src` references the path. Test fails today because the file exists at `frontend/src/components/control-form/controlFormWorkflow.ts:1`.
- Code/file changes:
  - DELETE `frontend/src/components/control-form/controlFormWorkflow.ts` (entire 3-line file: `export function buildControlOwnerOptionLabel(...)`).
- Lock/TOML/contract updates:
  - None expected. If the file is referenced in any `_naming_allowlist.toml` or `_archive_allowlist.toml` entry, scrub the entry.
- README / doc updates:
  - `frontend/src/components/control-form/README.md` — remove any reference to `controlFormWorkflow` if present.
- Verification commands (descriptive only, NOT to run in this planning loop):
  - `make -f scripts/Makefile test-architecture-locks` to confirm no naming/archive lock regressions.
  - Vitest run of the new deletion test plus the broader `tests/frontend/unit/src/components/control-form/` suite.
- Commit boundary: single commit, `chore(frontend): remove dead controlFormWorkflow helper`.
- Rollback note: trivial — `git revert` restores the 3-line file; no consumers exist (`grep -rn buildControlOwnerOptionLabel frontend/src` returned 0 in scoping).
- Effort: S.

---

## Item #5 — FE-deadcode-2 — DELETE `orphanResolutionPresentation.ts` (1-line re-export)

- Final disposition: DELETE.
- Dependencies (in-domain): none.
- Cross-domain prerequisites: none.
- TDD shape: structural assertion + canonical-import audit.
- Failing test(s) to write FIRST:
  - `tests/frontend/unit/src/components/governance/__tests__/orphanResolutionPresentation.deleted.test.ts` — assert (a) the file no longer exists, and (b) every `tsx`/`ts` under `frontend/src` that uses `buildOrphanResolutionLabel` imports from `@/components/governance/orphanResolutionState` (the canonical source per the prompt). Fails today because `orphanResolutionPresentation.ts:1` still exists with `export { buildOrphanResolutionLabel } from './orphanResolutionState';`.
- Code/file changes:
  - DELETE `frontend/src/components/governance/orphanResolutionPresentation.ts`.
  - No other production edit needed (Loop B confirmed 0 importers).
- Lock/TOML/contract updates:
  - None.
- README / doc updates:
  - `frontend/src/components/governance/README.md` — strike any `orphanResolutionPresentation` mention.
- Verification commands:
  - Same lock-test suite as #4.
- Commit boundary: single commit, `chore(frontend): drop unused orphanResolutionPresentation re-export`.
- Rollback note: trivial; the canonical `orphanResolutionState.ts:1` retains `buildOrphanResolutionLabel`.
- Effort: S.

---

## Item #6 — FE-deadcode-3 — DELETE `notifications/resourcePath.ts` (5-line re-export)

- Final disposition: DELETE.
- Dependencies (in-domain): none.
- Cross-domain prerequisites: none.
- TDD shape: structural assertion.
- Failing test(s) to write FIRST:
  - `tests/frontend/unit/src/components/notifications/__tests__/resourcePath.deleted.test.ts` — assert the file is gone AND the canonical exports `getNotificationPath` / `getNotificationResourcePath` resolve to `@/components/notifications/notificationPresentation`. Fails today because `resourcePath.ts:1-5` still wraps the canonical module.
- Code/file changes:
  - DELETE `frontend/src/components/notifications/resourcePath.ts` (5 lines).
- Lock/TOML/contract updates:
  - None.
- README / doc updates:
  - `frontend/src/components/notifications/README.md` — drop any `resourcePath` mention.
- Verification commands: lock suite + notifications test directory.
- Commit boundary: single commit, `chore(frontend): drop unused notifications/resourcePath re-export`.
- Rollback note: trivial.
- Effort: S.

---

## Item #22 — S2.8 — DELETE `frontend/src/components/ControlForm.tsx` 1-line shim

- Final disposition: DELETE shim, repoint all importers to `@/components/control-form/ControlFormContainer`.
- Dependencies (in-domain): none structurally; sequence after #4 (same area).
- Cross-domain prerequisites: none.
- TDD shape: structural assertion (no `from '@/components/ControlForm'` imports after edit) + behavioural-spec re-targeting test pass.
- Failing test(s) to write FIRST:
  1. `tests/frontend/unit/src/components/__tests__/ControlForm.shim.deleted.test.ts` — read the source files for the three known prod importers (`frontend/src/pages/ControlEditPage.tsx`, `frontend/src/pages/ControlNewPage.tsx`, `frontend/src/components/ControlCreateDialog.tsx`) plus a glob over `frontend/src/**/*.{ts,tsx}` and assert NONE contain `from '@/components/ControlForm'` or `from './ControlForm'`. Test fails today: e.g. `frontend/src/components/ControlCreateDialog.tsx:5` `import { ControlForm } from './ControlForm';`, `pages/ControlEditPage.tsx:6` and `pages/ControlNewPage.tsx:6`.
  2. Update existing tests to fail until repoint completes:
     - `tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14` (real import) — extend with assertion that the import resolves to `ControlFormContainer` (will fail until source/test are repointed).
     - `tests/frontend/unit/src/pages/__tests__/ControlForms.vendor-context.test.tsx:39` and `DirectFormCapabilityGates.test.tsx:60` — keep `vi.mock('@/components/control-form/ControlFormContainer', ...)` instead of the old shim path, asserted by a small lint-style structural test.
- Code/file changes:
  - DELETE `frontend/src/components/ControlForm.tsx` (1-line shim: `export { ControlForm } from './control-form/ControlFormContainer';`).
  - REPOINT 3 prod importers to `@/components/control-form/ControlFormContainer`:
    - `frontend/src/pages/ControlEditPage.tsx:6`
    - `frontend/src/pages/ControlNewPage.tsx:6`
    - `frontend/src/components/ControlCreateDialog.tsx:5`
  - REPOINT 3 test sites to the canonical container path: 1 import + 2 `vi.mock` paths (Loop B confirmed: `approval_ui_rendering.spec.tsx:14`, `ControlForms.vendor-context.test.tsx:39`, `DirectFormCapabilityGates.test.tsx:60`).
- Lock/TOML/contract updates:
  - If `_naming_allowlist.toml` exempts `ControlForm.tsx` for parity with sibling `RiskForm.tsx`/`KRIForm.tsx`/`VendorForm.tsx` shims, leave the entry only when those siblings remain; otherwise scrub.
  - `_archive_allowlist.toml` — only relevant if the shim is referenced; if so, remove.
- README / doc updates:
  - `frontend/src/components/control-form/README.md` — declare `ControlFormContainer` as the canonical entrypoint.
  - `.planning/audits/_context/03-frontend-architecture.md` — drop `ControlForm.tsx` from the shim list (Loop B noted Phase 1 undercount of importers).
- Verification commands: vitest for the three prod consumers + `tests/frontend/unit/src/components/control-form/` + new shim-deleted test.
- Commit boundary: single commit, `refactor(frontend): drop ControlForm.tsx shim, repoint to ControlFormContainer`.
- Rollback note: revert restores the 1-line shim; the import-path replacement in the 3 prod + 3 test files is mechanical and well-scoped.
- Effort: S.

---

## Item #23 — S2.9 — INLINE `controlFormUtils` helpers into narrow consumers

- Final disposition: INLINE the two helpers (`formatFrequencyLabel`, `getControlFormErrorKey`) into their three known consumers; DELETE `controlFormUtils.ts`.
- Dependencies (in-domain): #22 (cleaning shim first reduces noise in the same control-form area; structurally independent).
- Cross-domain prerequisites: none.
- TDD shape: characterisation tests pin current behaviour; structural assertion checks the file is gone afterwards.
- Failing test(s) to write FIRST:
  - `tests/frontend/unit/src/components/control-form/__tests__/controlFormUtils.inline.test.ts` — characterisation tests that exercise `formatFrequencyLabel('weekly_or_monthly')` etc. against the *call sites* (i.e. against the consumer modules after they own the function). Tests will fail today because (a) consumers still import from `./controlFormUtils` and (b) the structural assertion that `controlFormUtils.ts` is deleted will fail.
  - Add an importer-graph assertion that no file under `frontend/src` imports `@/components/control-form/controlFormUtils` (will fail today; Loop B/scoping confirmed exactly 3 importers: `ControlFormExecutionStep.tsx:5`, `useControlFormWorkflow.ts:14`, `useControlFormLookups.ts:9`).
- Code/file changes:
  - INLINE `formatFrequencyLabel` body into `frontend/src/components/control-form/ControlFormExecutionStep.tsx` (sole consumer; ~3-line implementation).
  - INLINE `getControlFormErrorKey` into `frontend/src/components/control-form/useControlFormWorkflow.ts` and `frontend/src/components/control-form/useControlFormLookups.ts` — both call sites are simple `error instanceof ApiClientError ? error.messageKey : fallback` checks; alternatively, lift one shared 5-line helper into the closest hook and have the other call it. Plan A (pure inline) is the default; Plan B (shared 5-line helper) is acceptable if duplication is judged too high during execution.
  - DELETE `frontend/src/components/control-form/controlFormUtils.ts`.
- Lock/TOML/contract updates: none.
- README / doc updates:
  - `frontend/src/components/control-form/README.md` — note utils were inlined.
- Verification commands: vitest for control-form area + new inline test + lock suite.
- Commit boundary: single commit `refactor(frontend): inline controlFormUtils helpers into narrow consumers`.
- Rollback note: revert restores file; the inlined ~5-line helpers are easily re-extracted.
- Effort: S.

---

## Item #32 — S5.8 — EXTRACT generic vendor linked-entity tab component/hook with typed entity config

- Final disposition: EXTRACT a `useVendorLinkedEntityTab<TEntity, TLinkPayload>` hook + a `VendorLinkedEntityTab` shell component; refactor the two existing tabs (`VendorLinkedRisksTab.tsx`, `VendorLinkedControlsTab.tsx`) and the partly-similar `VendorLinkedKRIsTab.tsx` to consume it.
- Dependencies (in-domain): none structural; should land BEFORE adding new linked-entity tabs.
- Cross-domain prerequisites: none.
- TDD shape: behavioural snapshot/contract test against the new hook + structural duplication-budget assertion that the three tab files no longer hand-roll the same `useEffect`/`refresh`/`useState<isLoading>`/`useState<error>` pattern.
- Failing test(s) to write FIRST:
  - `tests/frontend/unit/src/components/vendors/__tests__/useVendorLinkedEntityTab.contract.test.tsx` — render a fixture wrapper using the new hook with a stub `vendorLinkApi` shape; assert it manages `isLoading`, `error`, `existingLinks` mapping (as in `VendorLinkedRisksTab.tsx:55-64` and `VendorLinkedControlsTab.tsx:55-64`), `link`/`unlink`, and `refresh` semantics. Test fails today because the hook does not exist.
  - `tests/frontend/unit/src/components/vendors/__tests__/VendorLinkedEntityTab.duplication.test.ts` — read the three tab files and assert each contains ≤1 `useState` for loading/error tracking (i.e. relies on the hook). Will fail today: each tab declares 5 individual `useState` calls.
- Code/file changes:
  - NEW `frontend/src/components/vendors/useVendorLinkedEntityTab.ts` — generic hook over a `VendorLinkedEntityConfig<TEntity, TLinkPayload>` describing `loadFn`, `linkFn`, `unlinkFn`, `getId`, `mapToExistingLink`. Loop B's structural argument: the 5-state ceremony (`isLoading`, `error`, `linkedItems`, `dialogMode`, `isDialogOpen`) is identical across the two tabs.
  - NEW `frontend/src/components/vendors/VendorLinkedEntityTab.tsx` — generic shell handling header, dialog mount, empty state, archived/active partition (matching the current `is_archived` filter at `VendorLinkedRisksTab.tsx:66-67` and `VendorLinkedControlsTab.tsx:66-67`).
  - REFACTOR `VendorLinkedRisksTab.tsx`, `VendorLinkedControlsTab.tsx`, and (if duplication is real) `VendorLinkedKRIsTab.tsx` to compose the shell + hook with entity-specific configs/cards.
- Lock/TOML/contract updates: none.
- README / doc updates:
  - `frontend/src/components/vendors/README.md` — describe the new shell + config contract.
- Verification commands: vitest for `tests/frontend/unit/src/components/vendors/` + lock suite.
- Commit boundary: single commit, `refactor(frontend): extract generic vendor linked-entity tab + hook`.
- Rollback note: revert restores three independent tabs; the shell + hook are net-new files.
- Effort: M.

---

## Item #35 — S7.7 — DELETE `frontend/src/hooks/usePermissions.ts`

- Final disposition: DELETE; replace `Sidebar.tsx:12` consumption with `useAuth().hasPermission`; rewrite the 18 `vi.mock` test files to mock `@/contexts/AuthContext` (or `@/authz/useAuthz`) instead.
- Dependencies (in-domain): none structural; can land in parallel with #36.
- Cross-domain prerequisites: none. (The hook is a pure passthrough — `usePermissions.ts:4-20` exposes 9 keys; only `hasPermission` is consumed by prod per Loop B.)
- TDD shape: structural assertion + Sidebar render test.
- Failing test(s) to write FIRST:
  1. `tests/frontend/unit/src/hooks/__tests__/usePermissions.deleted.test.ts` — assert (a) file does not exist, (b) `grep` over `frontend/src/**/*.{ts,tsx}` returns 0 matches for `from '@/hooks/usePermissions'`, (c) `grep` over `tests/frontend/**/*.{ts,tsx}` returns 0 matches. Fails today: 1 prod (`Sidebar.tsx:12`) + 18 test mocks.
  2. `tests/frontend/unit/src/components/layout/__tests__/Sidebar.usePermissions.replaced.test.tsx` — render `Sidebar` with a stub `useAuth` that exposes `hasPermission`, assert sidebar links toggle on permission. Fails today: `Sidebar.tsx:12` still imports `usePermissions`.
- Code/file changes:
  - DELETE `frontend/src/hooks/usePermissions.ts`.
  - EDIT `frontend/src/components/layout/Sidebar.tsx:12` to import `useAuth` from `@/contexts/AuthContext` and consume `hasPermission` directly (Loop B confirmed `Sidebar.tsx:25` uses only `hasPermission`; the other 8 keys exposed by the hook are unused in prod).
  - UPDATE 18 `vi.mock('@/hooks/usePermissions', ...)` test files (Loop B-listed):
    - `tests/frontend/unit/src/components/layout/__tests__/SidebarPolling.test.tsx:13`
    - `tests/frontend/unit/src/components/kri/KRIValueModal.test.tsx:16`
    - `tests/frontend/unit/src/pages/__tests__/VendorDetailPage.issue-entry.test.tsx:34`
    - `tests/frontend/unit/src/pages/__tests__/IssuesPage.url-params.test.tsx:12`
    - `tests/frontend/unit/src/pages/__tests__/RiskDetailPage.issue-entry.test.tsx:26`
    - `tests/frontend/unit/src/pages/__tests__/IssuesPage.grouped-views.test.tsx:10`
    - `tests/frontend/unit/src/pages/__tests__/UserNewPage.sso.test.tsx:24`
    - `tests/frontend/unit/src/pages/__tests__/VendorsPage.grouped-views.test.tsx:170`
    - `tests/frontend/unit/src/pages/__tests__/IssuesPage.table-navigation.test.tsx:8`
    - `tests/frontend/unit/src/pages/__tests__/IssueNewPage.cancel.test.tsx:9`
    - `tests/frontend/unit/src/pages/__tests__/KRIDetailPage.edit-approval.test.tsx:26`
    - `tests/frontend/unit/src/pages/__tests__/IssuesPage.layout-parity.test.tsx:8`
    - `tests/frontend/unit/src/pages/__tests__/DashboardPage.overview.test.tsx:32`
    - `tests/frontend/unit/src/pages/__tests__/IssueDetailPage.tabs.test.tsx:13`
    - `tests/frontend/unit/src/pages/__tests__/IssuesPage.naming.test.tsx:7`
    - `tests/frontend/unit/src/pages/__tests__/IssueNewPage.test.tsx:9`
    - `tests/frontend/unit/src/pages/__tests__/ControlDetailPage.issue-entry.test.tsx:29`
    - `tests/frontend/unit/src/pages/__tests__/KRIDetailPage.issue-entry.test.tsx:25`
  - In each: replace `vi.mock('@/hooks/usePermissions', ...)` with mocks of either `@/contexts/AuthContext` (returning a stub `hasPermission`) or `@/authz/useAuthz` for the capability-flag keys. Pattern: most current mocks return the 9-key passthrough; rewrite to the equivalent `useAuth`/`useAuthz` shape.
- Lock/TOML/contract updates:
  - `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` — Loop B confirms this is the canonical authz invariant home; verify no entry references `usePermissions`. None expected.
  - `_naming_allowlist.toml` — drop `usePermissions` if listed.
- README / doc updates:
  - `frontend/src/hooks/README.md` — remove the entry.
  - `.planning/audits/_context/03-frontend-architecture.md` — note the hook is gone.
- Verification commands: vitest for all 18 updated tests + Sidebar test + lock suite.
- Commit boundary: single commit, `refactor(frontend): remove usePermissions passthrough, route Sidebar via useAuth`.
- Rollback note: revert restores the 20-line hook + 18 mock files; risk vector is mismatched mock shapes — keep the new mocks structurally minimal so revert is mechanical.
- Effort: S (per prompt; the 18-file mock rewrite is mechanical but voluminous).

---

## Item #36 — S7.8(a) — REFACTOR `BusinessRouteGuards.tsx` to typed factory

- Final disposition: REFACTOR 4 identical guards into a typed factory `<K extends BoolKeys>(key: K)` that yields the four named guards.
- Dependencies (in-domain): none.
- Cross-domain prerequisites: none. Loop B confirmed all 4 capability keys are boolean fields on `Authz` (`policy.ts:13-39`): `isPlatformAdmin`, `canViewGovernance`, `canViewActivityLog`, `canViewUsersRoute`.
- TDD shape: behavioural test (existing `BusinessRouteGuards.test.tsx` at `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx`) + structural assertion that the 4 component bodies are now generated.
- Failing test(s) to write FIRST:
  - `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.factory.test.tsx` — assert that a single helper `createBusinessRouteGuard(key)` builds each of the four guards (`GovernanceRouteGuard`, `ActivityLogRouteGuard`, `UsersRouteGuard`, `UserLifecycleRouteGuard`); render each with a stub `useAuthz` and check `Navigate to="/"` on denied vs `children` on allowed. Will fail today because the factory does not yet exist (`BusinessRouteGuards.tsx:18-36` defines four hand-rolled functions).
  - Structural assertion test: the file body declares `<= 1` re-export per guard plus exactly one factory call expression, no inline JSX bodies. Will fail until refactor lands.
  - Maintain the existing `BusinessRouteGuards.test.tsx` so route semantics regress red until the factory respects them.
- Code/file changes:
  - REFACTOR `frontend/src/authz/BusinessRouteGuards.tsx`:
    - Introduce `type BoolKeys = { [K in keyof Authz]: Authz[K] extends boolean ? K : never }[keyof Authz];` (or import from `@/authz/policy`).
    - Implement `function createBusinessRouteGuard<K extends BoolKeys>(key: K): React.FC<GuardProps>` that calls `useAuthz()` and routes via `<RedirectIfDenied allowed={authz[key]}>`.
    - Re-export the four named guards via `createBusinessRouteGuard('canViewGovernance')` etc.
  - No consumer changes — public exports are stable.
- Lock/TOML/contract updates:
  - None — `useAuthz.invariant.test.ts:46-48` enumerates `authz.can(action, resource)` literals (capability tuples), which are unrelated to these top-level boolean accessors. Loop B confirmed.
- README / doc updates:
  - `frontend/src/authz/README.md` — describe the factory.
- Verification commands: vitest for `tests/frontend/unit/src/authz/__tests__/` + lock suite.
- Commit boundary: single commit, `refactor(frontend/authz): replace 4 BusinessRouteGuards with typed factory`.
- Rollback note: revert restores the 4 explicit guards; type-level constraint `BoolKeys` is the only addition that needs no further callers.
- Effort: S.

---

## Item #37 — S7.10 — REPLACE `_can_view_governance` mirror with canonical `build_me_capabilities`

- Final disposition: DELETE the local `_can_view_governance` private at `backend/app/api/v1/endpoints/users/summary.py:45-50`; consume `build_me_capabilities(current_user).can_view_governance` instead.
- Dependencies (in-domain): none in the frontend domain; this is a pure backend refactor that the frontend item #66 lists as a prerequisite per the audit graph (`2026-05-09-deepening-audit.md:1610`). Loop B confirmed algebraic equivalence today, so the change is invisible to existing frontend consumers; the goal is to remove the drift surface.
- Cross-domain prerequisites: none.
- TDD shape: characterisation test ensuring `_build_shell_summary` returns the same `can_view_governance` value across all 4 user fixtures (admin, CRO, RM, dept-head); plus an algebraic-equivalence test that instantiates both code paths and compares output for a representative fixture matrix.
- Failing test(s) to write FIRST:
  - `tests/backend/pytest/api/v1/users/test_summary_can_view_governance.py` — parametrise over `(role, access_scope)` ∈ {admin/global, admin/dept, cro/global, risk_manager/global, dept_head/dept, compliance/global, end_user/dept}, assert `_build_shell_summary(...)["can_view_governance"]` equals `build_me_capabilities(user).can_view_governance`. Test seam: import via `client_factory` per CLAUDE.md `client_factory` rule. Test currently passes (algebraic equivalence) — but write it as a *contract pin* so that any future drift in either side fails red.
  - In addition, add a structural pin: the file `summary.py` does NOT import `can_manage_users` or `ensure_business_view_access` after the refactor (i.e. the local mirror is gone). Will fail today; lines 10-11 still import both.
- Code/file changes:
  - EDIT `backend/app/api/v1/endpoints/users/summary.py`:
    - REMOVE `_can_view_governance` (lines 45-50).
    - REMOVE imports of `can_manage_users`, `ensure_business_view_access` (line 10).
    - In `_build_shell_summary` (line 53), call `build_me_capabilities(current_user).can_view_governance` and bind to `can_view_governance` local.
- Lock/TOML/contract updates:
  - `_capabilities_all_allowlist.toml` — confirm `can_view_governance` is listed (it should be); no edits expected.
  - `_endpoint_commit_allowlist.toml` — `/me/shell-summary` payload must remain unchanged per snapshot tests; ensure the contract test pins `can_view_governance` to the algebraic value.
- README / doc updates:
  - `docs/security/authorization-capability-contract.md` — note that `can_view_governance` has only one source of truth (`build_me_capabilities`).
- Verification commands: pytest the new contract test + `make -f scripts/Makefile test-architecture-locks` + capability-contract validator (`scripts/security/validate_authz_capability_contract.py`).
- Commit boundary: single commit, `refactor(backend/users): consume build_me_capabilities for shell-summary governance flag`.
- Rollback note: revert restores the local mirror; algebraic equivalence guarantees no behavioural change in either direction.
- Effort: S.

---

## Item #39 — S8.7 — REPLACE `admin/capabilities.py` static stub with real builder

- Final disposition: REPLACE the static `True` literals at `backend/app/api/v1/endpoints/admin/capabilities.py:14-22` with a builder-driven response. Move the policy logic into a new `app/services/_authorization_capabilities/admin.py` (sibling to `me.py`); have the endpoint call it; pin behaviour with a snapshot test against `docs/security/capability-catalog.json`.
- Dependencies (in-domain): none in the frontend domain. Like #37, this is a backend item that gates frontend `#66` per the audit Tier-2 graph.
- Cross-domain prerequisites: none.
- TDD shape: snapshot/contract test against the capability catalog + RBAC matrix test.
- Failing test(s) to write FIRST:
  - `tests/backend/pytest/api/v1/admin/test_capabilities_builder.py` — parametrise over (admin, non-admin) plus role tiers; assert the endpoint returns a per-capability boolean matrix consistent with `docs/security/capability-catalog.json` rather than `(True, True, True, True)`. The test will fail today because all four booleans are hardcoded `True`.
  - Structural test: assert `admin/capabilities.py` does not contain literal `True` for any of the four fields (i.e. the body resolves them at runtime via `build_admin_capabilities(current_user)`).
- Code/file changes:
  - NEW `backend/app/services/_authorization_capabilities/admin.py` — `build_admin_capabilities(user: User) -> AdminConsoleCapabilities` returning per-capability booleans derived from role/scope. Loop B noted the sibling package `_authorization_capabilities/` exists with `me.py` etc., but `admin.py` does not.
  - EDIT `backend/app/api/v1/endpoints/admin/capabilities.py`:
    - Replace lines 14-22 body with `return build_admin_capabilities(current_user)`.
    - REMOVE `_ = current_user` no-op (line 16).
- Lock/TOML/contract updates:
  - `_capabilities_all_allowlist.toml` — confirm the four admin capability keys are registered against `admin_console`. Add if missing.
  - `_endpoint_commit_allowlist.toml` — endpoint shape unchanged; values now per-user.
  - `docs/security/authorization-capability-contract.json` and `capability-catalog.json` — pin authoritative truth tables for the four admin capabilities.
- README / doc updates:
  - `docs/security/authorization-capability-contract.md` — document the new builder seam.
- Verification commands: pytest `tests/backend/pytest/api/v1/admin/` + capability validator + lock suite.
- Commit boundary: single commit, `refactor(backend/admin): replace static capability stub with builder`.
- Rollback note: revert restores the 4 hardcoded `True`s; behavioural risk is per-role regression — the snapshot test pins it.
- Effort: M.

---

## Item #46 — FE-N1 — PROMOTE resource query-key factories

- Final disposition: LIFT 45 inline `queryKey:` literals across 22 files into per-domain factory modules `frontend/src/lib/queryKeys/<domain>.ts`. Treat the 4 already-factory-style call sites in `useRiskHubConfigResource.ts:97,107,117,127` as the reference shape.
- Dependencies (in-domain): #46 is a structural prereq for #65 (shared CRUD capability schema) and #67 (generic `useResourcePanelQuery`) per the prompt.
- Cross-domain prerequisites: none.
- TDD shape: structural assertion (no inline literal `queryKey: [...]` in domain files) + behavioural pin tests for each factory shape.
- Failing test(s) to write FIRST:
  - `tests/frontend/unit/src/lib/queryKeys/__tests__/queryKeys.invariant.test.ts` — for every domain (`risks`, `controls`, `vendors`, `kris`, `issues`, `dashboard`, `admin`, `riskHub`, `notifications`, `audit`, `governance`, etc. as discovered), assert `riskQueryKeys.list(filters)`/`detail(id)`/`history(id)` etc. produce a `readonly` tuple beginning with the domain literal.
  - Structural import-graph assertion: `grep` over `frontend/src/**/*.{ts,tsx}` excluding `lib/queryKeys/*` returns 0 inline `queryKey: [` literals (modulo the 4 already-factory-style usages in `useRiskHubConfigResource.ts` which receive the key from `definition`). Will fail today: Loop B counted 45/22.
- Code/file changes:
  - NEW `frontend/src/lib/queryKeys/<domain>.ts` per resource domain. Reference shape is `frontend/src/lib/issueQueryKeys.ts` (already a factory at `issueQueryKeys.ts:1-16` per Loop B). Extract similar factories for `risks`, `controls`, `vendors`, `kris`, `audit`, `admin`, `governance`, `riskHub` panels, `notifications`, `dashboard` (longest existing literal at `pages/dashboard/useDashboardOverviewState.ts:21-31` per Loop B).
  - REPOINT inline literals at the 22 known files (Loop B-listed above) to call factory functions.
- Lock/TOML/contract updates:
  - `_naming_allowlist.toml` — register the new `queryKeys/` modules per the project's naming convention.
- README / doc updates:
  - `frontend/src/lib/README.md` — add `queryKeys/` index and stewardship rule.
- Verification commands: vitest for new query-key tests + lock suite + `make -f scripts/Makefile test-architecture-locks`.
- Commit boundary: prefer one commit per domain (`risks`, `controls`, `vendors`, `kris`, `issues`, `dashboard`, `admin`, `riskHub`, `audit`, `governance`, `notifications`) with a final commit removing the structural assertion's allow-list. Each commit boundary is mechanical and reviewable independently.
- Rollback note: revert restores inline literals; per-commit boundaries make partial rollback safe.
- Effort: L (Loop B verified 45 literal sites; mechanical but volume-heavy).

---

## Item #47 — FE-N4 — EXTRACT session-refresh retry policy from `ApiClientCore.ts`

- Final disposition: EXTRACT `shouldAttemptSilentSessionRefresh` + the surrounding 401 retry orchestration into a small policy module `frontend/src/services/api/sessionRefreshPolicy.ts` (or similar) consumed by `ApiClient.executeRequest`. Loop B confirmed this is **session-refresh-specific**, not a generic retry; the new module must NOT advertise itself as a generic-retry seam.
- Dependencies (in-domain): #48 (i18n error-key merge) is independent; #71 (session module merge) lands AFTER ADR-011 (#72), so #47 only depends on the existing `services/session/sso` API surface (`trySilentSessionRefresh`).
- Cross-domain prerequisites: none.
- TDD shape: behavioural test for the policy decisions + structural assertion that `ApiClientCore.ts` no longer holds the gating booleans.
- Failing test(s) to write FIRST:
  - `tests/frontend/unit/src/services/api/__tests__/sessionRefreshPolicy.test.ts` — exercise the four gates (`isExplicitLogoutSuppressed → false`, `attempt > 0 → false`, `pathname.startsWith('/api/v1/auth/') → false`, otherwise `true`). Will fail today because the module does not exist.
  - Structural assertion: `frontend/src/services/api/ApiClientCore.ts` no longer defines `shouldAttemptSilentSessionRefresh` as a private method; the 401 branch in `executeRequest` calls into the new policy. Fails today (`ApiClientCore.ts:25-30` defines the method).
- Code/file changes:
  - NEW `frontend/src/services/api/sessionRefreshPolicy.ts` — exports `shouldAttemptSilentSessionRefresh(pathname, attempt)` returning `boolean`. Imports `isExplicitLogoutSuppressed` from `@/services/session/logoutSuppression`.
  - EDIT `frontend/src/services/api/ApiClientCore.ts`:
    - Remove the private method body (lines 25-30).
    - In `executeRequest`'s 401 branch (lines 61-72), call the imported helper.
- Lock/TOML/contract updates: none.
- README / doc updates:
  - `frontend/src/services/api/README.md` — note the new policy seam, *explicitly stating* it is session-refresh-specific (NOT a generic retry policy).
- Verification commands: vitest for the new policy test + the existing `services/api` and `services/session` tests + lock suite.
- Commit boundary: single commit, `refactor(frontend/api): extract session-refresh policy from ApiClientCore`.
- Rollback note: revert restores the inline private method; the new module is small and isolated.
- Effort: S.

---

## Item #48 — FE-N6 — MERGE `getErrorMessageKey.ts` + `errorCodeMap.ts` into single module

- Final disposition: MERGE `frontend/src/i18n/getErrorMessageKey.ts` (19 lines) + `frontend/src/i18n/errorCodeMap.ts` (14 lines) into a single `frontend/src/i18n/errorKeys.ts`; export `getErrorMessageKey` and `ERROR_CODE_TO_KEY` from the merged module. ≤3 callsites of `getErrorMessageKey` per Loop B (confirmed at `services/api/apiErrors.ts` import + `ApiClientCore.ts:44,79`).
- Dependencies (in-domain): independent.
- Cross-domain prerequisites: none.
- TDD shape: characterisation test pin + structural assertion (only one file remains).
- Failing test(s) to write FIRST:
  - `tests/frontend/unit/src/i18n/__tests__/errorKeys.merged.test.ts` — table-driven test enumerating the 10 keys in `ERROR_CODE_TO_KEY` plus the 5 status-fallbacks (401/403/404/422/500). Pins `getErrorMessageKey('UNAUTHORIZED', 401) === 'errorKeys.unauthorized'` etc. Will fail today because the module does not exist; the asserted import `from '@/i18n/errorKeys'` is unresolved.
  - Structural assertion: `frontend/src/i18n/getErrorMessageKey.ts` and `frontend/src/i18n/errorCodeMap.ts` do not exist; no callsite imports from those paths. Fails today (callsites listed above + `errorCodeMap.ts:1` re-imported by `getErrorMessageKey.ts:1`).
- Code/file changes:
  - NEW `frontend/src/i18n/errorKeys.ts` — combines the 10-entry `ERROR_CODE_TO_KEY` constant + `getErrorMessageKey` function (preserve the `code` normalisation and status fallbacks at `getErrorMessageKey.ts:7-16`).
  - DELETE `frontend/src/i18n/getErrorMessageKey.ts` and `frontend/src/i18n/errorCodeMap.ts`.
  - REPOINT callsites — at minimum:
    - `frontend/src/services/api/ApiClientCore.ts:1` (`getErrorMessageKey` import).
    - `frontend/src/services/api/apiErrors.ts` (3 callsites per Loop A; trust the count and re-verify on landing).
    - Any indirect re-exports via `frontend/src/i18n/index.ts` or `frontend/src/services/api/responseParsing.ts`.
- Lock/TOML/contract updates:
  - `_naming_allowlist.toml` — drop the two old paths if listed.
- README / doc updates:
  - `frontend/src/i18n/README.md` — note the merged module.
- Verification commands: vitest for `tests/frontend/unit/src/i18n/` and `services/api/` + lock suite.
- Commit boundary: single commit, `refactor(frontend/i18n): merge getErrorMessageKey + errorCodeMap into errorKeys`.
- Rollback note: revert restores the two-file split.
- Effort: S.

---

## Item #64 — FE-N2 — EXTRACT QueryClient defaults from `App.tsx` to `services/api/queryClient.ts`

- Final disposition: EXTRACT `new QueryClient({...})` (lines 11-18) into `frontend/src/services/api/queryClient.ts`; have `App.tsx` import the singleton.
- Dependencies (in-domain): none. Loop B confirmed sole construction site at `App.tsx:11-18`; no extracted module exists today.
- Cross-domain prerequisites: none.
- TDD shape: structural assertion + defaults pin test.
- Failing test(s) to write FIRST:
  - `tests/frontend/unit/src/services/api/__tests__/queryClient.defaults.test.ts` — import the singleton, assert `queryClient.getDefaultOptions().queries.staleTime === 60_000` and `retry === 1`. Will fail today because the module does not exist.
  - Structural assertion: `frontend/src/App.tsx` does not contain `new QueryClient(`. Fails today (`App.tsx:11`).
- Code/file changes:
  - NEW `frontend/src/services/api/queryClient.ts` — exports `queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });`.
  - EDIT `frontend/src/App.tsx` — replace lines 11-18 with `import { queryClient } from '@/services/api/queryClient';`.
- Lock/TOML/contract updates: none.
- README / doc updates:
  - `frontend/src/services/api/README.md` — note the singleton.
- Verification commands: vitest for `services/api` + render-tree smoke (`App.test.tsx` if present) + lock suite.
- Commit boundary: single commit, `refactor(frontend/api): extract QueryClient defaults to services/api/queryClient`.
- Rollback note: trivial revert.
- Effort: S.

---

## Item #65 — FE-N3 — EXTRACT `crudCapabilitySchema` shared Zod base for risks/controls/kris/vendors

- Final disposition: EXTRACT a shared `crudCapabilitySchema` Zod base containing only the **common subset across all 5 entities, which is `{ can_read, can_update }`**. For risks/controls/kris/vendors (4 entities), build a stronger common base — `{ can_read, can_update, can_archive*, can_restore }`-flavoured — by extending the shared base. **Per Loop B's explicit correction, the issues schema is structurally distinct** (uses `can_view_*_contexts` rather than `can_archive_*`/`can_restore`/`can_create_issue`); leave issues schema separate. Snapshot-lock the per-entity field counts: risks 19, controls 20, kris 14 (per Loop B), vendors 14 (per Loop B). Note: prompt says "19/20/23/14"; the 23 figure is at variance with what was sampled (vendors capabilities at `vendors.ts:22-35` show 12-14 keys) — the snapshot test must lock the *actual* counts read from current schemas, not the prompt's tentative numbers.
- Dependencies (in-domain): #46 (per the prompt). Land #46 first so query-key factories are stable; then introduce the schema base.
- Cross-domain prerequisites: capability catalog snapshot is owned by `docs/security/capability-catalog.json`. No backend changes; #65 is frontend-only.
- TDD shape: snapshot/contract test against the per-entity field counts; per-entity Zod parse test on a synthetic capability object.
- Failing test(s) to write FIRST:
  - `tests/frontend/unit/src/services/api/schemas/__tests__/crudCapabilitySchema.snapshot.test.ts` — for each of (`risks`, `controls`, `kris`, `vendors`), parse a synthetic full-true capability object and assert the result has exactly the documented field count; assert that `crudCapabilitySchema.shape` is `{ can_read, can_update }` and that each entity's full schema is `crudCapabilitySchema.merge(<entity-specific>)`. Will fail today because the shared base does not exist.
  - Per Loop B's explicit guidance, also add a guard test that asserts the *issues* schema is **NOT** built from `crudCapabilitySchema` extension (i.e. it remains structurally distinct).
- Code/file changes:
  - NEW `frontend/src/services/api/schemas/crudCapabilitySchema.ts` — `export const crudCapabilitySchema = passthroughObject({ can_read: z.boolean(), can_update: z.boolean() });`
  - EDIT `frontend/src/services/api/schemas/entities/risks.ts:8-28` — refactor `riskCapabilitiesSchema` to extend `crudCapabilitySchema`.
  - EDIT `frontend/src/services/api/schemas/entities/controls.ts` — same.
  - EDIT `frontend/src/services/api/schemas/entities/kris.ts` — same.
  - EDIT `frontend/src/services/api/schemas/entities/vendors.ts` — same.
  - LEAVE `frontend/src/services/api/schemas/entities/issues.ts` UNCHANGED structurally (issues uses `can_view_*_contexts` per Loop B).
- Lock/TOML/contract updates:
  - `docs/security/capability-catalog.json` — pin the per-entity capability counts that the snapshot test will consume.
  - `_capabilities_all_allowlist.toml` — confirm catalog/test alignment.
- README / doc updates:
  - `frontend/src/services/api/schemas/README.md` — describe the shared base + the issues exception.
- Verification commands: vitest for `services/api/schemas` + `scripts/security/validate_authz_capability_contract.py` + lock suite.
- Commit boundary: single commit per entity migration (4 commits), preceded by a setup commit creating the shared base. Final commit reconciles the snapshot lock.
- Rollback note: revert per-entity commits independently; the shared base is a thin Zod object.
- Effort: M.

---

## Item #66 — FE-N5 — SPLIT `contexts/AuthContext.tsx` into independent providers

- Final disposition: SPLIT the existing `AuthContext` (`AuthContext.tsx:1-78`) into three providers — `SessionProvider` (read-only session/user/bootstrap state), `PreferencesProvider` (preference hydration), `AuthActionsProvider` (login/logout). Loop B confirmed real prereqs are **#37 + #39** (`2026-05-09-deepening-audit.md:1610`); ADR-011 (#72) is **NOT** a prereq for #66 (Loop B explicitly corrected the orchestrator framing).
- Dependencies (in-domain): #35 (usePermissions removal) is *not* a strict prereq but should land first to avoid churn in 18 mock files. #65 is independent. **#37 + #39 are real prerequisites** (capability builder must be the single source of truth before the bootstrap context splits).
- Cross-domain prerequisites: #37 + #39 (this domain treats them as in-domain since they live in this loop's items list).
- TDD shape: behavioural pin (existing AuthBootstrap/AuthLogout tests must pass through the split); re-render isolation regression test (new).
- Failing test(s) to write FIRST:
  1. `tests/frontend/unit/src/contexts/__tests__/SessionProvider.split.test.tsx` — render a child that consumes only session (`useSession()`); mutate preferences via `usePreferenceActions()` and assert the session-consuming child does NOT re-render. Loop B's call-out: the current `AuthContext.Provider value={{ ... }}` (lines 50-67) is a fresh object every render, so the test must measure render counts via a counter ref. Fails today: any preference mutation re-renders all consumers because they all share one context.
  2. `tests/frontend/unit/src/contexts/__tests__/AuthActions.split.test.tsx` — render `useAuthActions()` independently and assert `login`/`logout` operate without depending on session-snapshot identity.
  3. Existing `tests/frontend/unit/src/contexts/__tests__/AuthBootstrapConfig.test.tsx`, `AuthBootstrapRouteGuard.test.tsx`, `AuthLogoutFlow.test.tsx`, `AuthSessionAuthority.test.tsx` (Loop B confirmed these exist) must continue to pass via a thin compatibility shim or via direct migration to the new hooks. Mark them as **must-pass throughout the split**.
- Code/file changes:
  - NEW `frontend/src/contexts/SessionContext.tsx` — owns `session.user`, `bootstrapStatus`, `bootstrapError`, `logoutPending`, `logoutErrorKey`, `isAuthenticated`, `hasPermission`. Memoise the value strictly.
  - NEW `frontend/src/contexts/PreferencesContext.tsx` — owns `isPreferencesHydrated`, `hydratePreferences`, `markPreferencesReady` from `usePreferenceHydration`.
  - NEW `frontend/src/contexts/AuthActionsContext.tsx` — owns `login`, `logout` from `useAuthActions`.
  - REWRITE `frontend/src/contexts/AuthContext.tsx` to compose the three providers; keep the `useAuth()` hook as a thin facade re-exporting the merged shape for backward compat (eliminate later in a follow-up).
  - Update `frontend/src/App.tsx` if it nests `AuthProvider` directly — it does at line 60: `<AuthProvider>` — keep the wrapping order but ensure nested providers preserve `useAuth()` semantics.
- Lock/TOML/contract updates:
  - `_naming_allowlist.toml` — register new contexts.
  - `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` — Loop B says no entry refers to `usePermissions` or to specific provider topology, but verify on landing.
- README / doc updates:
  - `frontend/src/contexts/README.md` — describe the 3-provider split + memoisation invariant.
  - `.planning/audits/_context/03-frontend-architecture.md` — refresh diagram.
- Verification commands: vitest for `tests/frontend/unit/src/contexts/__tests__/` + `useAuthz.invariant.test.ts` + lock suite.
- Commit boundary: prefer 4 commits — (1) `SessionProvider` + tests, (2) `PreferencesProvider` + tests, (3) `AuthActionsProvider` + tests, (4) `AuthContext` collapse to facade and remove dead lines. Each commit must keep the prod app booting.
- Rollback note: revert the topmost commit reverts to the prior provider; the facade-style `useAuth()` keeps the public API stable so revert is mechanical.
- Effort: M.

---

## Item #67 — FE-N7 — EXTRACT generic `useResourcePanelQuery` from `useRiskHubConfigResource.ts`

- Final disposition: EXTRACT a domain-agnostic `useResourcePanelQuery<TItem, TCreate, TUpdate>` hook from `frontend/src/components/riskhub/useRiskHubConfigResource.ts:79-179`; `useRiskHubConfigResource` becomes a thin wrapper that combines the new generic hook + `useRiskHubConfigPanelState`.
- Dependencies (in-domain): #46 (the new hook must accept a typed `queryKey` from a factory module).
- Cross-domain prerequisites: none.
- TDD shape: behavioural snapshot — render a fixture wrapper using the new hook against an in-memory CRUD stub; assert load/create/update/delete/restore semantics; structural assertion on the new file's signature.
- Failing test(s) to write FIRST:
  - `tests/frontend/unit/src/hooks/__tests__/useResourcePanelQuery.contract.test.tsx` — contract test exercising load (`isLoading`, `items`, `error`), create (`handleSave` -> invalidate), update (`handleSave` with `editingItem`), delete (`handleDelete` + `apiClient.toUiMessageKey` on error), restore (`handleRestore`). Will fail today because the hook does not exist.
  - Structural assertion: `frontend/src/components/riskhub/useRiskHubConfigResource.ts` line count ≤ ~60 (down from 179) post-refactor; it composes `useResourcePanelQuery` + `useRiskHubConfigPanelState`.
- Code/file changes:
  - NEW `frontend/src/hooks/useResourcePanelQuery.ts` — generic in `<TItem, TCreate, TUpdate>`; takes a `definition` + a `panel` slot (or returns a primitive that the consumer marries with their own panel-state hook). Reproduce the four `useMutation` blocks (`useRiskHubConfigResource.ts:90-128`) and the `handleSave`/`handleDelete`/`handleRestore` helpers (lines 130-156).
  - REFACTOR `frontend/src/components/riskhub/useRiskHubConfigResource.ts` to compose `useResourcePanelQuery` + `useRiskHubConfigPanelState`.
- Lock/TOML/contract updates: none (no public surface change).
- README / doc updates:
  - `frontend/src/hooks/README.md` — describe the generic hook.
- Verification commands: vitest for `tests/frontend/unit/src/components/riskhub/__tests__/RiskHubConfigResource.test.tsx` (existing) + new contract test + lock suite.
- Commit boundary: single commit, `refactor(frontend/hooks): extract useResourcePanelQuery from useRiskHubConfigResource`.
- Rollback note: revert restores the 179-line concrete hook; consumers stay on the same public API.
- Effort: M.

---

## Item #68 — FE-N8 — INTRODUCE `WidgetShell` + scoped query selector

- Final disposition: INTRODUCE a `WidgetShell` component that owns the loading-skeleton/error/empty/data rendering pattern shared by 21 dashboard widgets, plus a scoped query selector hook that subscribes to **only** the dashboard-filter slice each widget needs. **Loop B confirmed: 21 widgets total, 6 use `useDashboardFilters`** (`CategoryBreakdownCharts`, `DepartmentTable`, `RiskDrilldownModal`, `FilterBar`, `KRIStatusWidget`, `KRIBreachWidget`); bound the scope to those six in the first pass and design `WidgetShell` to apply to the other 15 even though they don't read filter state.
- Dependencies (in-domain): #66 (per audit `2026-05-09-deepening-audit.md:1611` `FE-N8 ← FE-N5`). Loop B-noted cross-cut: `pages/dashboard/useDashboardOverviewState.ts:21` has the longest `queryKey` literal in the codebase — #46 should land first so the new selector consumes a factory.
- Cross-domain prerequisites: none.
- TDD shape: behavioural test on the shell component + re-render isolation test on the scoped selector.
- Failing test(s) to write FIRST:
  - `tests/frontend/unit/src/components/dashboard/__tests__/WidgetShell.contract.test.tsx` — render `WidgetShell` with `isLoading`/`error`/`isEmpty`/`children`, assert each branch renders the matching glass-card / skeleton / empty / data block. Will fail today because the shell does not exist.
  - `tests/frontend/unit/src/contexts/__tests__/DashboardFilterContext.scopedSelector.test.tsx` — render two children: one subscribed to `departmentId` only, one subscribed to `riskLevel` only; mutate `riskLevel`, assert the `departmentId` consumer does NOT re-render. Loop B-corrected mutator count = 6 (`setDepartmentId`, `setRiskLevel`, `setControlStatus`, `setControlForm`, `setViewMode`, `resetFilters`). Will fail today: the single-context shape forces a re-render on any mutation.
- Code/file changes:
  - NEW `frontend/src/components/dashboard/WidgetShell.tsx` — typed shell + presentation primitive.
  - EXTEND `frontend/src/contexts/DashboardFilterContext.tsx` with a `useDashboardFilterSelector<T>(selector)` exported hook that uses `useSyncExternalStore` (or split contexts) to scope subscriptions; keep `useDashboardFilters()` as a backward-compat facade.
  - REFACTOR the 6 filter-consuming widgets to use the scoped selector + `WidgetShell`.
  - Refactor the 15 non-filter widgets to consume `WidgetShell` only (incremental — can be a follow-up commit).
- Lock/TOML/contract updates: none.
- README / doc updates:
  - `frontend/src/components/dashboard/README.md` — describe `WidgetShell` and the selector pattern.
- Verification commands: vitest for `tests/frontend/unit/src/components/dashboard/__tests__/` + lock suite.
- Commit boundary: 3 commits — (1) `WidgetShell` + tests, (2) scoped selector + tests + 6 filter-aware widget rewrites, (3) opportunistic shell adoption for the remaining 15 widgets.
- Rollback note: revert per-commit; shell is purely additive in commit 1.
- Effort: M.

---

## Item #71 — S7.8 — MERGE `frontend/src/services/session/` 8 files → 4

- Final disposition: MERGE the 8 session files into 4 (plus barrel) per Loop B's viability check: `types.ts`, `store.ts`, `sessionStorage.ts` (combines `refreshHint.ts` + `logoutSuppression.ts`), `coordinator.ts` (combines `manager.ts` + `bootstrap.ts` + `sso.ts` ~321 lines). **Module-scope state in `sso.ts:9-11` (`refreshInFlight`, `lastRefreshFailureAt`, `REFRESH_FAILURE_COOLDOWN_MS`) MUST survive the merge intact**; the test suite must pin this explicitly.
- Dependencies (in-domain): #47 (session-refresh policy extracted), #66 (AuthContext split), and ADR-011 (#72 — NOT in this domain; per audit `2026-05-09-deepening-audit.md:1654` `S7.9 (ADR-011) ──────────────► S7.8`, ADR-011 ratification is the strict prerequisite for this item).
- Cross-domain prerequisites: ADR-011 (#72). Land #71 only after #72 stabilises.
- TDD shape: behavioural pin (existing session tests + a new module-scope-state preservation test) + structural assertion that the file count is 4 (plus barrel).
- Failing test(s) to write FIRST:
  1. `tests/frontend/unit/src/services/session/__tests__/sessionStorage.merged.test.ts` — exercises both `refreshHint` cookie helpers + `logoutSuppression` sessionStorage helpers from a single module path. Fails today (modules are separate).
  2. `tests/frontend/unit/src/services/session/__tests__/coordinator.merged.test.ts` — exercises `applyAuthenticatedSession` (currently `manager.ts:138`), `trySilentSessionRefresh` (currently `sso.ts:13-26`), and bootstrap flows from a single module path. Fails today.
  3. `tests/frontend/unit/src/services/session/__tests__/coordinator.singleFlight.test.ts` — pin the module-scope cooldown contract: invoke `trySilentSessionRefresh` twice in parallel, assert one in-flight promise; force a failure, assert `lastRefreshFailureAt` blocks calls within `REFRESH_FAILURE_COOLDOWN_MS`. After the merge, the test must still pass with identical timing. **This is Loop B's main flagged risk: a careless concatenation merge can lose the single-flight semantics.**
  4. Structural assertion: `frontend/src/services/session/` contains `{ types, store, sessionStorage, coordinator, index }` (5 files) and **none of** `{ bootstrap, manager, sso, refreshHint, logoutSuppression }`. Fails today.
- Code/file changes:
  - NEW `frontend/src/services/session/sessionStorage.ts` — combine `refreshHint.ts` + `logoutSuppression.ts` (Loop B confirmed both are leaf primitives, no shared state).
  - NEW `frontend/src/services/session/coordinator.ts` — combine `manager.ts` + `bootstrap.ts` + `sso.ts`. Preserve the three module-scope variables exactly: `let refreshInFlight: Promise<string | null> | null = null;`, `let lastRefreshFailureAt = 0;`, `const REFRESH_FAILURE_COOLDOWN_MS = 1_000;`.
  - DELETE `bootstrap.ts`, `manager.ts`, `sso.ts`, `refreshHint.ts`, `logoutSuppression.ts`.
  - UPDATE `frontend/src/services/session/index.ts` (the barrel) to re-export from the new file set.
  - UPDATE all importers (e.g. `frontend/src/services/api/ApiClientCore.ts:2-4` imports `isExplicitLogoutSuppressed`, `clearAuthenticatedSession`, `trySilentSessionRefresh`; the `index.ts` barrel keeps these names stable).
- Lock/TOML/contract updates:
  - `_naming_allowlist.toml` — drop the 5 deleted modules; register `sessionStorage` + `coordinator`.
- README / doc updates:
  - `frontend/src/services/session/README.md` — re-describe the 4-file shape and call out the module-scope cooldown invariant.
- Verification commands: vitest for `tests/frontend/unit/src/services/session/__tests__/` (new directory needed; today none exists) + the upstream tests in `tests/frontend/unit/src/contexts/__tests__/Auth*` + lock suite.
- Commit boundary: 3 commits — (1) `sessionStorage` merge with tests, (2) `coordinator` merge with single-flight pin test, (3) drop now-orphan files + re-wire barrel + structural assertion. Each commit must keep `services/api/ApiClientCore.ts` building.
- Rollback note: revert per-commit. The `coordinator` merge is the highest-risk commit; rollback is needed if any single-flight pin test regresses.
- Effort: M.

---

## Domain dependency graph (in-domain only)

```
#4  ──┐
#5  ──┼─── (independent dead-code deletions)
#6  ──┘

#22 ─── (independent shim deletion; sequence after #4 to keep control-form area mechanical)
#23 ──> #22 (same area; #23 depends on #22 only by code-review locality, not by API)

#32 ─── (independent vendor-tab refactor)

#35 ─── (independent usePermissions deletion; can land in parallel with #36)
#36 ─── (independent BusinessRouteGuards factory)

#37 ─── (backend; gates #66)
#39 ─── (backend; gates #66)

#46 ─── (independent query-key factory promotion)
#47 ─── (independent session-refresh policy extraction)
#48 ─── (independent i18n merge)

#64 ─── (independent QueryClient extraction)

#65 ──> #46 (per prompt — query-key factories first)

#66 ──> #37 + #39 (per audit Tier-2 graph; Loop B-corrected; NOT ADR-011)

#67 ──> #46 (per prompt — generic resource hook needs key factories)

#68 ──> #66 (per audit `:1611` `FE-N8 ← FE-N5`); benefits from #46 already landing.

#71 ──> #47 (policy already extracted, less to move) + #66 (split landed) + ADR-011 (#72; cross-domain)
```

Suggested execution order within Loop 1:

1. **Bucket A — independent quick wins**: #4, #5, #6, #36, #46, #47, #48, #64. Land in any order; #46 should land before #65/#67/#68 to avoid rework.
2. **Bucket B — control-form cleanup**: #22 then #23.
3. **Bucket C — vendor tabs**: #32 (any time after Bucket A starts).
4. **Bucket D — usePermissions / authz consolidation**: #35 (parallel with #36 if not already done).
5. **Bucket E — capability builder (gates #66)**: #37 then #39 (backend; both small/medium; #39 has the contract surface).
6. **Bucket F — provider topology**: #66 (after #37, #39).
7. **Bucket G — generic resource hook**: #67 (after #46).
8. **Bucket H — schema base**: #65 (after #46).
9. **Bucket I — dashboard widget shell**: #68 (after #66; benefits from #46).
10. **Bucket J — session module merge**: #71 (after #47, #66, AND ADR-011 #72 cross-domain).

## Cross-domain notes

- **ADR-011 (#72)** is *not* a prerequisite for #66 (Loop B explicit correction; audit `:1610` is `FE-N5 ← S8.7 + S7.10`). It IS a prerequisite for #71 (audit `:1654`). Phase 3 should not collapse these.
- **Capability catalog** (`docs/security/capability-catalog.json`) and the Pydantic/Zod contract (`docs/security/authorization-capability-contract.{md,json}`) are touched by #37, #39, #65. Sequence #37 → #39 → #65 to avoid re-snapshotting the catalog repeatedly. Snapshot tests in #65 must lock against catalog field counts (issues 14 capability keys per `issues.ts`; risks 19 per `risks.ts:8-28`; controls and kris/vendors counts to be re-read on landing — DO NOT trust the prompt's tentative `19/20/23/14`).
- **`useAuthz.invariant.test.ts`** at `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` is the canonical authz invariant home per CLAUDE.md (Authorization Capability Contract section). #35, #36, #65, #66 all touch authz; verify on each landing that no invariant entry references the about-to-be-deleted shim/hook.
- **`client_factory`** (per CLAUDE.md): #37, #39 backend tests must use `client_factory` from `tests/backend/pytest/conftest.py`; do not introduce ad-hoc `dependency_overrides[get_db]` blocks (whitelist gate at `tests/backend/pytest/_get_db_override_whitelist.toml`).
- **Architecture locks**: every item's verification commands include `make -f scripts/Makefile test-architecture-locks`. Items that touch `_naming_allowlist.toml`, `_archive_allowlist.toml`, or `_capabilities_all_allowlist.toml` (#22, #35, #46, #48, #65, #71, plus #4-#6 if files are listed) must keep the TOML registries in sync with their structural assertions.
- **Phase 1 importer-undercount theme** (Loop B cross-cut): alias-only greps miss relative-path imports (e.g. `ControlCreateDialog.tsx:5`'s `./ControlForm`) and `vi.mock` targets. Every shim/file deletion in this loop (#4, #5, #6, #22, #23, #35, #48, #64) MUST run a structural assertion test that uses BOTH alias and relative-path scans before relying on counts.
- **Module-scope state** (Loop B re #71): the single-flight refresh contract in `sso.ts:9-11` is the highest landing-time risk in this loop. The pin test #71-3 in the skeleton above is non-negotiable.
- **Re-render isolation** (Loop B re #66 and #68): both context splits introduce new memoisation invariants. The current `AuthContext.Provider value={{ ... }}` (`AuthContext.tsx:50-67`) creates a fresh object every render; new providers must use stable `useMemo`/`useCallback` returns. The skeletons above explicitly add render-count assertions; treat them as load-bearing.
