# Recipe 07 — Frontend authz + auth + dashboard + #77a Vendor.status pre-test

Phase 5 (per-item TDD recipe drafting), domain: **Frontend authz + auth + dashboard + new test for #77a**.

Authoritative inputs:
- Loop 1 plan: `.planning/audits/_context/plan-loop-1-06-frontend.md` (full per-item disposition).
- Loop B (verify-loop-b-06-frontend): file/line truth on every prod consumer.
- Phase 4 corrections (review-loop-2-08, review-loop-2-04 validator-adversarial): #65 parser constraint, #66 render-counter requirement, #71 module-scope preservation, #37 algebraic-equivalence pin, #39 stub fact, dashboard widget count.
- Architecture lock contracts: `tests/backend/pytest/architecture/_*.toml`, `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts`, capability catalog parser at `scripts/security/authz_contract_validator/capability_catalog.py:112-126`.

Constraints in force (from Phase 1 prompt):
- Single sequential developer, TDD-first (red test before any prod edit).
- Doc/lock-only Reject arguments are not honored.
- All Phase 4 corrections incorporated (see Phase 4 corrections summary at file end).
- Backend test seam: `client_factory` per CLAUDE.md.
- Frontend tests: vitest + MSW for HTTP, render-counter pattern for re-render isolation.

Items in this recipe (10):
- #35 (S7.3) — Delete `usePermissions` hook.
- #36 (S7.4) — `BusinessRouteGuards` typed factory.
- #37 (S7.10) — Backend mirror delete `_can_view_governance` to `build_me_capabilities`.
- #39 (S8.7) — `AdminConsoleCapabilities` real builder + Pydantic-Zod parity.
- #65 (FE-N3) — `crudCapabilitySchema` literal-flat shared base (Phase 4 critical).
- #66 (FE-N5) — Split `AuthContext.tsx` into independent providers (render-counter pin).
- #67 (FE-N7) — Extract generic `useResourcePanelQuery`.
- #68 (FE-N8) — `WidgetShell` + scoped query selector (6 filter consumers, 21 widgets).
- #71 (S7.8) — Merge `services/session/` 8 files to 4 (single-flight pin).
- #77a (NEW) — Pre-migration Vendor.status FE Zod soft-tolerate test.

---

## Item #35 (S7.3) — DELETE `frontend/src/hooks/usePermissions.ts`

- Final disposition: DELETE the hook; rewire `Sidebar.tsx:25` to consume `useAuth().hasPermission` directly; rewrite the 18 `vi.mock('@/hooks/usePermissions', ...)` test files to mock `@/contexts/AuthContext` (or `@/authz/useAuthz` for the capability-flag keys).
- Dependencies (in-domain): none structural; can land in parallel with #36. Should land BEFORE #66 (AuthContext split) to avoid churn in the 18 mock files (each mock would otherwise be rewritten twice).
- Cross-domain prerequisites: none. The hook at `frontend/src/hooks/usePermissions.ts:4-20` is a pure passthrough to `useAuth().hasPermission` + 8 `useAuthz()` accessors. Loop B confirmed only `hasPermission` is consumed in prod (`Sidebar.tsx:25`).
- TDD shape: structural assertion (file deletion + grep absence) + behavioural pin (Sidebar still toggles links on permission).
- Failing test(s) to write FIRST:
  1. `tests/frontend/unit/src/hooks/__tests__/usePermissions.deleted.structural.test.ts` — uses `fs.existsSync(...)` and `fs.readdirSync(...)` over the resolved repo path. Three assertions:
     - `expect(fs.existsSync(usePermissionsPath)).toBe(false);`
     - Walk `frontend/src/**/*.{ts,tsx}` via `fast-glob` (already in dev deps) and assert no file source contains `from '@/hooks/usePermissions'`.
     - Walk `tests/frontend/**/*.{ts,tsx}` similarly and assert zero matches.
     Will fail today: file exists; 1 prod import (Sidebar) + 18 test imports.
  2. `tests/frontend/unit/src/components/layout/__tests__/Sidebar.usePermissions.replaced.test.tsx` — render `<Sidebar />` inside `MemoryRouter` + `QueryClientProvider`; mock `@/contexts/AuthContext` via `vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: stubUser, hasPermission: vi.fn().mockReturnValue(true), logout: vi.fn(), logoutPending: false, logoutErrorKey: null }) }));` and `vi.mock('@/authz/useAuthz', () => ({ useAuthz: () => stubAuthz }));`. Assert sidebar links toggle on permission. Fails today because `Sidebar.tsx:12` imports `usePermissions` which is mocked elsewhere.
- Code / file changes:
  - DELETE `frontend/src/hooks/usePermissions.ts`.
  - EDIT `frontend/src/components/layout/Sidebar.tsx`:
    - Remove line 12 (`import { usePermissions } from '@/hooks/usePermissions';`).
    - Replace line 25 with destructure from existing `useAuth()` line 24: `const { user, logout, logoutPending, logoutErrorKey, hasPermission } = useAuth();`.
  - REWRITE the 18 test mocks. Pattern (each file currently has):
    ```ts
    vi.mock('@/hooks/usePermissions', () => ({
        usePermissions: () => ({ hasPermission: (r, a) => /*...*/, canViewUsers: /*...*/ }),
    }));
    ```
    Becomes:
    ```ts
    vi.mock('@/contexts/AuthContext', async (orig) => ({
        ...(await orig() as object),
        useAuth: () => ({ user: stubUser, hasPermission: (r, a) => /*...*/ }),
    }));
    ```
    For files that consumed `canViewUsers`/`canManageAccess`/etc., add a parallel `vi.mock('@/authz/useAuthz', ...)`.
    The 18 files (per Loop B) are:
    - `tests/frontend/unit/src/components/layout/__tests__/SidebarPolling.test.tsx`
    - `tests/frontend/unit/src/components/kri/KRIValueModal.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/VendorDetailPage.issue-entry.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/IssuesPage.url-params.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/RiskDetailPage.issue-entry.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/IssuesPage.grouped-views.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/UserNewPage.sso.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/VendorsPage.grouped-views.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/IssueDetailPage.tabs.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/DashboardPage.overview.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/IssuesPage.table-navigation.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/IssueNewPage.cancel.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/IssuesPage.naming.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/KRIDetailPage.edit-approval.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/IssueNewPage.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/IssuesPage.layout-parity.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/ControlDetailPage.issue-entry.test.tsx`
    - `tests/frontend/unit/src/pages/__tests__/KRIDetailPage.issue-entry.test.tsx`
- Lock / TOML / contract updates:
  - `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` — verify no entry references `usePermissions`. None expected.
  - `_naming_allowlist.toml` — drop `usePermissions` if currently listed (most likely not, hook lives in `frontend/src/hooks/`).
- README / doc updates:
  - `frontend/src/hooks/README.md` — remove the entry for `usePermissions`.
  - `.planning/audits/_context/03-frontend-architecture.md` — note the hook is gone.
- Verification commands:
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/hooks/__tests__/usePermissions.deleted.structural.test.ts`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/components/layout/__tests__/Sidebar.usePermissions.replaced.test.tsx`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/components/layout/__tests__/SidebarPolling.test.tsx` (regression)
  - `cd frontend && pnpm vitest run` (full FE unit suite, all 18 mock-rewrites pass)
  - `make -f scripts/Makefile test-architecture-locks`
- Commit boundary: single commit, `refactor(frontend): remove usePermissions passthrough, route Sidebar via useAuth`.
- Rollback note: revert restores the 20-line hook + 18 mock files. Risk vector: mismatched mock shapes across the 18 rewrites — keep new mocks minimal (only the keys each test consumes) so revert is mechanical.
- Effort: S.

---

## Item #36 (S7.4) — REFACTOR `BusinessRouteGuards.tsx` to typed factory

- Final disposition: REFACTOR `frontend/src/authz/BusinessRouteGuards.tsx:18-36` — 4 identical guards (`GovernanceRouteGuard`, `ActivityLogRouteGuard`, `UsersRouteGuard`, `UserLifecycleRouteGuard`) — into a typed factory `createBusinessRouteGuard<K extends BoolKeys>(key: K)`. Public exports stay stable; consumer code (`routing/*`) is unchanged.
- Dependencies (in-domain): none. Can run in parallel with #35.
- Cross-domain prerequisites: none. Loop B confirmed all 4 capability keys are boolean fields on `Authz` (`policy.ts:13-39`): `isPlatformAdmin`, `canViewGovernance`, `canViewActivityLog`, `canViewUsersRoute`.
- TDD shape: behavioural test (existing `BusinessRouteGuards.test.tsx` continues to pass) + new factory contract test + structural assertion that the file body declares no inline JSX.
- Failing test(s) to write FIRST:
  1. `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.factory.test.tsx` — for each `(name, key, allowedKey)` in `[(GovernanceRouteGuard, canViewGovernance), (ActivityLogRouteGuard, canViewActivityLog), (UsersRouteGuard, canViewUsersRoute), (UserLifecycleRouteGuard, isPlatformAdmin)]`: render with stubbed `useAuthz()` returning `{ [key]: true }` / `{ [key]: false }` and assert children rendered / `<Navigate to="/" replace />` rendered. Will fail until factory exists. Skeleton:
     ```ts
     import { createBusinessRouteGuard } from '@/authz/BusinessRouteGuards';
     // (the import resolves only after refactor lands)
     ```
  2. `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.structural.test.ts` — read `frontend/src/authz/BusinessRouteGuards.tsx` source via `fs.readFileSync`. Assert:
     - Exactly 1 `function createBusinessRouteGuard<` declaration.
     - `(source.match(/function\s+\w+RouteGuard\s*\(/g) ?? []).length === 0` (no hand-rolled function declarations besides the factory).
     - 4 `export const` named guards bound to `createBusinessRouteGuard(...)` calls.
     Will fail today.
  3. Existing `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx` continues to pass — pin route semantics during the refactor.
- Code / file changes:
  - EDIT `frontend/src/authz/BusinessRouteGuards.tsx`:
    ```ts
    import type { ReactNode } from 'react';
    import { Navigate } from 'react-router-dom';
    import { useAuthz } from '@/authz/useAuthz';
    import type { Authz } from '@/authz/policy';

    type GuardProps = { children: ReactNode };
    type BoolKeys = { [K in keyof Authz]: Authz[K] extends boolean ? K : never }[keyof Authz];

    export function createBusinessRouteGuard<K extends BoolKeys>(key: K) {
        return function BusinessRouteGuard({ children }: GuardProps) {
            const authz = useAuthz();
            if (!authz[key]) return <Navigate to="/" replace />;
            return <>{children}</>;
        };
    }

    export const GovernanceRouteGuard = createBusinessRouteGuard('canViewGovernance');
    export const ActivityLogRouteGuard = createBusinessRouteGuard('canViewActivityLog');
    export const UsersRouteGuard = createBusinessRouteGuard('canViewUsersRoute');
    export const UserLifecycleRouteGuard = createBusinessRouteGuard('isPlatformAdmin');
    ```
  - No changes to consumers (routing files import the same names).
- Lock / TOML / contract updates: none. `useAuthz.invariant.test.ts:46-48` enumerates `authz.can(action, resource)` capability tuples — unrelated to top-level boolean keys.
- README / doc updates:
  - `frontend/src/authz/README.md` — describe the factory contract and the `BoolKeys` type.
- Verification commands:
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.factory.test.tsx`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.structural.test.ts`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx`
  - `cd frontend && pnpm tsc --noEmit`
  - `make -f scripts/Makefile test-architecture-locks`
- Commit boundary: single commit, `refactor(frontend/authz): replace 4 BusinessRouteGuards with typed factory`.
- Rollback note: revert restores 4 explicit guards. The `BoolKeys` type is the only new concept; no other callers depend on it.
- Effort: S.

---

## Item #37 (S7.10) — REPLACE `_can_view_governance` mirror with canonical `build_me_capabilities`

- Final disposition: DELETE the local `_can_view_governance` private at `backend/app/api/v1/endpoints/users/summary.py:45-50`; consume `build_me_capabilities(current_user).can_view_governance` instead. **Phase 4 correction: algebraically equivalent today; this is a drift-surface elimination, not a current-bug fix.** The contract test must be a regression-pin against future divergence.
- Dependencies (in-domain): none. This is a backend item kept here because the audit graph (`2026-05-09-deepening-audit.md:1610` — `FE-N5 ← S8.7 + S7.10`) lists it as a `#66` prereq.
- Cross-domain prerequisites: none.
- TDD shape: characterisation test (regression-pin) over the role x access-scope matrix; structural pin that the mirror imports are gone.
- Failing test(s) to write FIRST:
  1. `tests/backend/pytest/api/v1/users/test_summary_can_view_governance.py` — uses `client_factory` (CLAUDE.md mandate) to call `/api/v1/users/me/shell-summary` and parametrises over the same role x scope matrix the existing `tests/backend/pytest/test_aggregate_overviews.py:106` exercises (admin/global, admin/dept, cro/global, risk_manager/global, dept_head/dept, compliance/global, end_user/dept). For each fixture, assert `payload["can_view_governance"] == build_me_capabilities(user).can_view_governance`. Both implementations evaluate to the same value today — the test pins the contract so any future drift fails red. Skeleton:
     ```python
     import pytest
     from app.services._authorization_capabilities.me import build_me_capabilities

     @pytest.mark.parametrize("user_fixture_name", ["admin", "cro", "risk_manager", "dept_head", "compliance", "end_user"])
     async def test_shell_summary_can_view_governance_matches_build_me_capabilities(
         client_factory, request, user_fixture_name
     ):
         user = request.getfixturevalue(f"test_user_{user_fixture_name}")
         client = await client_factory(user)
         resp = await client.get("/api/v1/users/me/shell-summary")
         assert resp.status_code == 200
         expected = build_me_capabilities(user).can_view_governance
         assert resp.json()["can_view_governance"] == expected
     ```
  2. `tests/backend/pytest/api/v1/users/test_summary_structural.py` — read `backend/app/api/v1/endpoints/users/summary.py` source. Assert:
     - `"_can_view_governance" not in source` (function gone).
     - `"can_manage_users" not in source` (import gone).
     - `"ensure_business_view_access" not in source` (import gone).
     - `"build_me_capabilities" in source` (replacement present).
     Fails today: lines 10, 23, 24, 45-50 still reference these.
- Code / file changes:
  - EDIT `backend/app/api/v1/endpoints/users/summary.py`:
    - Remove line 10 imports (`from app.core.permissions import can_manage_users, ensure_business_view_access, has_permission`) and re-add only `has_permission` (still used by `_count_questionnaire_inbox` line 40).
    - Remove the `_can_view_governance` function at lines 45-50.
    - In `_build_shell_summary` (line 53), import `build_me_capabilities` from `app.services._authorization_capabilities.me` and replace line 54 with:
      ```python
      can_view_governance = build_me_capabilities(current_user).can_view_governance
      ```
- Lock / TOML / contract updates:
  - `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — confirm `can_view_governance` listed; no edits expected.
  - `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — `/me/shell-summary` payload schema unchanged; no entry edit.
  - Capability contract validator (`scripts/security/validate_authz_capability_contract.py`) — must remain green.
- README / doc updates:
  - `docs/security/authorization-capability-contract.md` — note `can_view_governance` has a single source of truth (`build_me_capabilities`).
- Verification commands:
  - `pytest tests/backend/pytest/api/v1/users/test_summary_can_view_governance.py -v`
  - `pytest tests/backend/pytest/api/v1/users/test_summary_structural.py -v`
  - `pytest tests/backend/pytest/test_aggregate_overviews.py -v` (existing summary tests still pass)
  - `python scripts/security/validate_authz_capability_contract.py`
  - `make -f scripts/Makefile test-architecture-locks`
- Commit boundary: single commit, `refactor(backend/users): consume build_me_capabilities for shell-summary governance gate`.
- Rollback note: revert restores the local mirror. Algebraic equivalence today means no behaviour change either way; the rollback risk is purely loss of the regression-pin.
- Effort: S.

---

## Item #39 (S8.7) — REPLACE static admin capability stub with real builder + Pydantic-Zod parity

- Final disposition: NEW `backend/app/services/_authorization_capabilities/admin.py` exposing `build_admin_capabilities(user: User) -> AdminConsoleCapabilities`. EDIT `backend/app/api/v1/endpoints/admin/capabilities.py:14-22` so `get_admin_console_capabilities` returns `build_admin_capabilities(current_user)` instead of the 4-`True` literal stub. Pydantic-Zod parity lock: backend `AdminConsoleCapabilities` (`backend/app/schemas/admin.py:99-105`, 4 fields) and frontend `adminConsoleCapabilitiesSchema` (`frontend/src/services/api/schemas/admin.ts:38-43`) stay literally aligned and validated by the catalog parser.
- Dependencies (in-domain): none. Backend item gating frontend `#66`.
- Cross-domain prerequisites: none.
- TDD shape: per-role matrix RBAC test on the new builder + endpoint contract test + structural pin against literal `True` + Pydantic-Zod parity test (already enforced by `validate_authz_capability_contract`, but add an explicit field-set parity test).
- Failing test(s) to write FIRST:
  1. `tests/backend/pytest/api/v1/admin/test_capabilities_builder.py` — parametrise over (admin, dept_head, end_user, cro, risk_manager, compliance) x access scope. Use `client_factory`. Assert each capability (`can_revoke_sessions`, `can_run_directory_check_all`, `can_update_log_config`, `can_export_loaded_audit_logs`) is per-role correct (admin → all True; non-admin → 401 from `require_platform_admin`). Add a unit-level test that calls `build_admin_capabilities(...)` directly without HTTP and asserts the matrix. Will fail today because builder doesn't exist.
  2. `tests/backend/pytest/api/v1/admin/test_capabilities_structural.py` — read `backend/app/api/v1/endpoints/admin/capabilities.py` source. Assert:
     - `"True" not in source.split("def get_admin_console_capabilities")[1]` (no literal `True` in body).
     - `"build_admin_capabilities" in source`.
     Fails today (`capabilities.py:18-21` is 4 literal `True`s).
  3. `tests/backend/pytest/api/v1/admin/test_capabilities_parity.py` — Pydantic-Zod parity. Read `backend/app/schemas/admin.py` and extract `AdminConsoleCapabilities` field names; read `frontend/src/services/api/schemas/admin.ts` and extract `adminConsoleCapabilitiesSchema` field names via the same parser used by `scripts/security/authz_contract_validator/capability_catalog.py`. Assert the two field sets are equal. Pin the literal-flat shape: the Zod schema MUST be `passthroughObject({ ... })` with no `.merge()` / `.extend()` (parser cannot follow continuations). Will fail if either side drifts.
- Code / file changes:
  - NEW `backend/app/services/_authorization_capabilities/admin.py`:
    ```python
    from __future__ import annotations
    from app.models import User
    from app.models.role import RoleType
    from app.schemas.admin import AdminConsoleCapabilities


    def _is_platform_admin(user: User) -> bool:
        role = getattr(user, "role", None)
        return getattr(role, "name", None) == RoleType.ADMIN.value


    def build_admin_capabilities(user: User) -> AdminConsoleCapabilities:
        is_admin = _is_platform_admin(user)
        return AdminConsoleCapabilities(
            can_revoke_sessions=is_admin,
            can_run_directory_check_all=is_admin,
            can_update_log_config=is_admin,
            can_export_loaded_audit_logs=is_admin,
        )
    ```
  - EDIT `backend/app/api/v1/endpoints/admin/capabilities.py`:
    ```python
    from app.api.v1.endpoints.admin._deps import require_platform_admin
    from app.models import User
    from app.schemas.admin import AdminConsoleCapabilities
    from app.services._authorization_capabilities.admin import build_admin_capabilities

    @router.get("/capabilities", response_model=AdminConsoleCapabilities)
    async def get_admin_console_capabilities(
        current_user: User = Depends(require_platform_admin),
    ) -> AdminConsoleCapabilities:
        return build_admin_capabilities(current_user)
    ```
- Lock / TOML / contract updates:
  - `docs/security/capability-catalog.json` — confirm `AdminConsoleCapabilities` surface entry lists exactly the 4 fields (`can_revoke_sessions`, `can_run_directory_check_all`, `can_update_log_config`, `can_export_loaded_audit_logs`). Add if missing.
  - `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — confirm all 4 keys present; add missing.
- README / doc updates:
  - `backend/app/services/_authorization_capabilities/README.md` — append `admin.py` section.
  - `docs/security/authorization-capability-contract.md` — note admin console has a real builder.
- Verification commands:
  - `pytest tests/backend/pytest/api/v1/admin/test_capabilities_builder.py -v`
  - `pytest tests/backend/pytest/api/v1/admin/test_capabilities_structural.py -v`
  - `pytest tests/backend/pytest/api/v1/admin/test_capabilities_parity.py -v`
  - `python scripts/security/validate_authz_capability_contract.py`
  - `make -f scripts/Makefile test-architecture-locks`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/services/api/schemas` (parity)
- Commit boundary: single commit, `feat(backend/admin): replace static admin capability stub with role-aware builder`.
- Rollback note: revert restores 4-`True` stub. Frontend Zod schema is unchanged either way; rollback is symmetric.
- Effort: M.

---

## Item #65 (FE-N3) — EXTRACT `crudCapabilitySchema` shared Zod base (LITERAL FLAT — NOT `.merge`)

> **Phase 4 CRITICAL CONSTRAINT**: the backend Zod parser at
> `scripts/security/authz_contract_validator/capability_catalog.py:112-126`
> uses brace-matching only. It does NOT walk `.merge()` or `.extend()`
> continuations. Recipe MUST keep each entity schema as a single
> `passthroughObject({ /* literal field list */ })` so the parser sees
> the full set. The "shared base" is a *type-level* and *test-level*
> contract, not a runtime composition.

- Final disposition: NEW `frontend/src/services/api/schemas/crudCapabilitySchema.ts` exporting (a) `CRUD_BASE_FIELDS` runtime constant (`['can_read', 'can_update'] as const`) and (b) `crudCapabilitySchema = passthroughObject({ can_read: z.boolean(), can_update: z.boolean() })`. Per-entity schemas in `risks.ts`, `controls.ts`, `kris.ts`, `vendors.ts` keep their **literal flat field list** — they MUST NOT use `crudCapabilitySchema.merge(...)` or `.extend(...)`. The shared base is enforced by **structural test**: each entity capability literal must include every field in `CRUD_BASE_FIELDS`. The issues schema is structurally distinct (uses `can_view_*_contexts` instead of archive/restore/create-issue) and is **explicitly NOT** built from the shared base — Loop B confirmed.
- Dependencies (in-domain): #46 (query-key factory) per the audit graph. Land #46 first.
- Cross-domain prerequisites: capability catalog (`docs/security/capability-catalog.json`) is touched. Sequence #37 → #39 → #65 to avoid catalog re-snapshot churn.
- TDD shape: structural assertion (each entity schema body includes the base fields) + behavioural Zod parse tests + parser-compatibility test (run the actual catalog parser against each entity file and assert it returns the full field set).
- Failing test(s) to write FIRST:
  1. `tests/frontend/unit/src/services/api/schemas/__tests__/crudCapabilitySchema.contract.test.ts`:
     - Assert `Object.keys(crudCapabilitySchema.shape)` is `['can_read', 'can_update']`.
     - For each `(entityFile, expectedFieldCount)` in `[('entities/risks.ts', 19), ('entities/controls.ts', 20), ('entities/kris.ts', 26), ('entities/vendors.ts', 14)]` (counts re-read from current schemas at this commit; **lock the actual count** rather than the prompt's tentative `19/20/23/14`):
       - Read the source file via `fs.readFileSync`.
       - Use the same regex used by `capability_catalog.py:112-126` (transliterated to JS) to extract the schema body.
       - Assert `body.includes('can_read: z.boolean()')` and `body.includes('can_update: z.boolean()')` (CRUD base present literally).
       - Assert the body parses to exactly `expectedFieldCount` `z.boolean()` lines (locked count).
       - Assert the body does NOT contain `.merge(` or `.extend(` (parser-compat constraint).
     Will fail at the body-parse phase only after refactor; fails today only at the type-level export side. Make the test red TODAY by asserting `import { crudCapabilitySchema } from '@/services/api/schemas/crudCapabilitySchema';` resolves.
  2. `tests/frontend/unit/src/services/api/schemas/__tests__/crudCapabilitySchema.parser.test.ts` — invoke the Python parser via `node:child_process.execFileSync('python', ['scripts/security/authz_contract_validator/capability_catalog.py', '--frontend-file', 'frontend/src/services/api/schemas/entities/risks.ts', '--schema', 'riskCapabilitiesSchema'])` (no shell, argv array — safe). Assert the parsed field set matches the snapshot. Pins the parser-compat constraint end-to-end. (Note: prefer `execFileSync` over `execSync` to avoid shell injection, per repo convention.)
  3. `tests/frontend/unit/src/services/api/schemas/__tests__/issuesCapabilities.distinct.test.ts` — assert `issueCapabilitiesSchema` body does **NOT** import `crudCapabilitySchema` and does NOT call `.merge()` against it. Pins Loop B's correction.
- Code / file changes:
  - NEW `frontend/src/services/api/schemas/crudCapabilitySchema.ts`:
    ```ts
    import { passthroughObject, z } from './common';

    export const CRUD_BASE_FIELDS = ['can_read', 'can_update'] as const;
    export type CrudBaseField = typeof CRUD_BASE_FIELDS[number];

    /**
     * Shared CRUD base — common subset across risks/controls/kris/vendors.
     * NOTE: Per-entity schemas MUST NOT use `.merge()` / `.extend()` against
     * this schema, because the capability catalog Zod parser at
     * `scripts/security/authz_contract_validator/capability_catalog.py:112-126`
     * uses brace-matched literal extraction and does not walk continuations.
     * Treat this as a type-level + test-level contract only.
     */
    export const crudCapabilitySchema = passthroughObject({
        can_read: z.boolean(),
        can_update: z.boolean(),
    });
    ```
  - NO edits to `risks.ts` / `controls.ts` / `kris.ts` / `vendors.ts` schema bodies (per Phase 4 constraint). The four entity schemas keep their literal flat shape; the test suite enforces the contract.
  - `issues.ts` UNCHANGED (structurally distinct).
- Lock / TOML / contract updates:
  - `docs/security/capability-catalog.json` — re-snapshot per-entity field counts after #37/#39 land; #65 must lock actual counts read from current schemas.
  - `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — verify all per-entity capability keys present.
- README / doc updates:
  - `frontend/src/services/api/schemas/README.md` — explain the parser-compat constraint and why `.merge()` is forbidden in capability schemas.
- Verification commands:
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/services/api/schemas/__tests__/crudCapabilitySchema.contract.test.ts`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/services/api/schemas/__tests__/crudCapabilitySchema.parser.test.ts`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/services/api/schemas/__tests__/issuesCapabilities.distinct.test.ts`
  - `python scripts/security/validate_authz_capability_contract.py`
  - `make -f scripts/Makefile test-architecture-locks`
- Commit boundary: single commit, `feat(frontend/schemas): add crudCapabilitySchema base + literal-flat parity tests`.
- Rollback note: revert removes the new module + tests. Per-entity schemas were never edited, so no behaviour change from rollback — only the contract regression-pin is lost.
- Effort: M.

---

## Item #66 (FE-N5) — SPLIT `AuthContext.tsx` into independent providers (render-counter pin)

- Final disposition: SPLIT `frontend/src/contexts/AuthContext.tsx:1-78` into three providers:
  - `SessionProvider` (read-only `user`, `isLoading`, `bootstrapStatus`, `bootstrapError`, `logoutPending`, `logoutErrorKey`, `isAuthenticated`, `hasPermission`).
  - `PreferencesProvider` (`isPreferencesHydrated`, `hydratePreferences`, `markPreferencesReady`).
  - `AuthActionsProvider` (`login`, `logout`).
  Each provider memoises its `value` strictly so unrelated state changes do not re-render unrelated consumers.
- Dependencies (in-domain): #35 should land first to avoid mock-rewrite churn. **#37 + #39 are real prerequisites** (capability builder must be the single source of truth before the bootstrap context splits — per Phase 4 correction). #65 is independent. **ADR-011 (#72) is NOT a prereq for #66** (Phase 4 explicit correction).
- Cross-domain prerequisites: #37 + #39 (Loop 1 lists them in this domain).
- TDD shape: behavioural pin (existing AuthBootstrap/AuthLogout tests must continue to pass through a thin compat shim) + **render-counter regression test** (new) + structural assertion that `AuthContext.tsx` is replaced.
- Failing test(s) to write FIRST:
  1. `tests/frontend/unit/src/contexts/__tests__/SessionProvider.split.renderCounter.test.tsx` — render-counter pattern (Phase 4 mandated):
     ```tsx
     import { useEffect, useRef } from 'react';
     import { render, act, screen } from '@testing-library/react';
     import { SessionProvider, useSession } from '@/contexts/SessionContext';
     import { PreferencesProvider, usePreferenceActions } from '@/contexts/PreferencesContext';

     function SessionConsumer() {
         const count = useRef(0);
         const session = useSession();
         useEffect(() => { count.current += 1; });
         return <span data-testid="session-renders">{count.current}|{session.user?.id ?? 'none'}</span>;
     }

     function PrefMutator() {
         const { markPreferencesReady } = usePreferenceActions();
         return <button onClick={() => markPreferencesReady(true)}>flip</button>;
     }

     it('mutating preferences does NOT re-render session consumer', () => {
         render(
             <SessionProvider>
                 <PreferencesProvider>
                     <SessionConsumer />
                     <PrefMutator />
                 </PreferencesProvider>
             </SessionProvider>
         );
         const before = screen.getByTestId('session-renders').textContent;
         act(() => screen.getByText('flip').click());
         const after = screen.getByTestId('session-renders').textContent;
         expect(after).toBe(before); // render count unchanged
     });
     ```
     **Phase 4 mandate**: this is the render-counter pattern (`useRef(0)` + `useEffect(() => { count.current++; })` + assertion `expect(count.current).toBe(N)` after rerender). Will fail today because the single `AuthContext.Provider value={{ ... }}` (lines 50-67) creates a fresh value object every render — every consumer re-renders on any state change.
  2. `tests/frontend/unit/src/contexts/__tests__/AuthActions.split.test.tsx` — render `useAuthActions()` (login/logout) independently; assert calls work when `useSession()` is not in the same component subtree. Fails today (the actions are bundled in the same context as session state).
  3. `tests/frontend/unit/src/contexts/__tests__/AuthContext.compatShim.test.tsx` — pin that `useAuth()` continues to expose the union surface (`user`, `isLoading`, `bootstrapStatus`, `bootstrapError`, `logoutPending`, `logoutErrorKey`, `isPreferencesHydrated`, `hasPermission`, `isAuthenticated`, `login`, `logout`) so existing consumers (Sidebar, etc., post-#35 rewire) keep working.
  4. Existing `tests/frontend/unit/src/contexts/__tests__/AuthBootstrapConfig.test.tsx`, `AuthBootstrapRouteGuard.test.tsx`, `AuthLogoutFlow.test.tsx`, `AuthSessionAuthority.test.tsx` MUST continue to pass — pin behaviour during the split.
- Code / file changes:
  - NEW `frontend/src/contexts/SessionContext.tsx` — owns the session-derived state from `useSessionSnapshot()` (currently `AuthContext.tsx:28`), `hasPermission`, `isAuthenticated`. Wrap value in `useMemo` over `[session.user, session.token, session.bootstrapStatus, session.bootstrapError, session.logoutPending, session.logoutErrorKey, hasPermission]`.
  - NEW `frontend/src/contexts/PreferencesContext.tsx` — wraps `usePreferenceHydration(...)` (currently `AuthContext.tsx:31-33`). Memoises `value` over `[isPreferencesHydrated, hydratePreferences, markPreferencesReady]`.
  - NEW `frontend/src/contexts/AuthActionsContext.tsx` — wraps `useAuthActions(...)` (currently `AuthContext.tsx:35-38`). Memoises `value` over `[login, logout]`.
  - REWRITE `frontend/src/contexts/AuthContext.tsx` to a *compat shim* that nests the three providers and exposes `useAuth()` as a union of the three contexts (so `Sidebar`/etc. still work without churn):
    ```tsx
    export function AuthProvider({ children }: { children: ReactNode }) {
        return (
            <SessionProvider>
                <PreferencesProvider>
                    <AuthActionsProvider>{children}</AuthActionsProvider>
                </PreferencesProvider>
            </SessionProvider>
        );
    }

    export function useAuth() {
        return { ...useSession(), ...usePreferenceState(), ...useAuthActionsContext() };
    }
    ```
  - Existing `useAuth` consumers (Sidebar after #35, all 18 mocks rewritten in #35) keep working.
- Lock / TOML / contract updates: none (capability contract unchanged).
- README / doc updates:
  - `frontend/src/contexts/auth/README.md` — describe the three providers and the compat shim.
- Verification commands:
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/contexts/__tests__/SessionProvider.split.renderCounter.test.tsx`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/contexts/__tests__/AuthActions.split.test.tsx`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/contexts/__tests__/AuthContext.compatShim.test.tsx`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/contexts/__tests__/AuthBootstrapConfig.test.tsx tests/frontend/unit/src/contexts/__tests__/AuthBootstrapRouteGuard.test.tsx tests/frontend/unit/src/contexts/__tests__/AuthLogoutFlow.test.tsx tests/frontend/unit/src/contexts/__tests__/AuthSessionAuthority.test.tsx`
  - `cd frontend && pnpm tsc --noEmit`
  - `make -f scripts/Makefile test-architecture-locks`
- Commit boundary: single commit, `refactor(frontend/contexts): split AuthContext into Session/Preferences/AuthActions providers`.
- Rollback note: revert restores the 78-line monolithic `AuthContext.tsx`. The compat shim ensures `useAuth()` keeps the same surface either way; rollback is mechanical. Risk vector: render counters that previously passed must continue to pass under rollback (compat shim must not regress).
- Effort: M.

---

## Item #67 (FE-N7) — EXTRACT generic `useResourcePanelQuery`

- Final disposition: EXTRACT a domain-agnostic `useResourcePanelQuery<TItem, TCreate, TUpdate>` hook from `frontend/src/components/riskhub/useRiskHubConfigResource.ts:79-179`. `useRiskHubConfigResource` becomes a thin wrapper that combines the new generic hook + `useRiskHubConfigPanelState`.
- Dependencies (in-domain): #46 (query-key factory) — the new hook must accept a typed `queryKey` from a factory module.
- Cross-domain prerequisites: none.
- TDD shape: behavioural snapshot (load/create/update/delete/restore semantics) against an in-memory CRUD stub + structural assertion on file size.
- Failing test(s) to write FIRST:
  1. `tests/frontend/unit/src/hooks/__tests__/useResourcePanelQuery.contract.test.tsx` — render a fixture wrapper that uses `useResourcePanelQuery` against a `vi.fn()`-backed CRUD stub. Assert:
     - Initial: `isLoading === true`, `items === []`, `error === null`.
     - After resolve: `isLoading === false`, `items.length === 3`.
     - `handleSave({ id: undefined, ...payload })` invokes the create stub, then invalidates the query (next fetch is called).
     - `handleSave({ id: 1, ...payload })` (with `editingItem` set) invokes the update stub.
     - `handleDelete(1)` invokes delete + on error surfaces `apiClient.toUiMessageKey`.
     - `handleRestore(1)` invokes restore stub.
     Will fail today because the hook does not exist.
  2. `tests/frontend/unit/src/hooks/__tests__/useResourcePanelQuery.structural.test.ts` — read `frontend/src/components/riskhub/useRiskHubConfigResource.ts`. Assert post-refactor:
     - File line count <= 60 (was 179).
     - File imports `useResourcePanelQuery` from `@/hooks/useResourcePanelQuery`.
     - File imports `useRiskHubConfigPanelState`.
     Fails today.
- Code / file changes:
  - NEW `frontend/src/hooks/useResourcePanelQuery.ts`:
    ```ts
    interface ResourcePanelQueryDefinition<TItem, TCreate, TUpdate> {
        queryKey: readonly unknown[];
        list: (signal: AbortSignal) => Promise<TItem[]>;
        create: (payload: TCreate) => Promise<TItem>;
        update: (id: number, payload: TUpdate) => Promise<TItem>;
        remove: (id: number) => Promise<void>;
        restore: (id: number) => Promise<TItem>;
    }

    export function useResourcePanelQuery<TItem extends { id: number }, TCreate, TUpdate>(
        definition: ResourcePanelQueryDefinition<TItem, TCreate, TUpdate>,
    ) { /* reproduces useRiskHubConfigResource:90-156 */ }
    ```
  - REWRITE `frontend/src/components/riskhub/useRiskHubConfigResource.ts` to compose the new hook + `useRiskHubConfigPanelState`. Target <= 60 lines.
- Lock / TOML / contract updates: none.
- README / doc updates:
  - `frontend/src/hooks/README.md` — add `useResourcePanelQuery` entry.
- Verification commands:
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/hooks/__tests__/useResourcePanelQuery.contract.test.tsx`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/hooks/__tests__/useResourcePanelQuery.structural.test.ts`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/components/riskhub` (existing panel tests)
  - `cd frontend && pnpm tsc --noEmit`
- Commit boundary: single commit, `refactor(frontend/hooks): extract generic useResourcePanelQuery from useRiskHubConfigResource`.
- Rollback note: revert restores the 179-line hook. Behaviour identical; the new hook is purely structural.
- Effort: M.

---

## Item #68 (FE-N8) — `WidgetShell` + scoped DashboardFilter selector

- Final disposition: NEW `frontend/src/components/dashboard/WidgetShell.tsx` — typed shell encapsulating loading-skeleton / error / empty / data branches shared by 21 dashboard widgets. EXTEND `frontend/src/contexts/DashboardFilterContext.tsx` with a `useDashboardFilterSelector<T>(selector)` hook that uses `useSyncExternalStore` (or split contexts) for scoped subscriptions; keep `useDashboardFilters()` as a backward-compat facade. **Phase 4 confirmed: 21 widgets total, 6 use `useDashboardFilters`** (`CategoryBreakdownCharts`, `DepartmentTable`, `RiskDrilldownModal`, `FilterBar`, `KRIStatusWidget`, `KRIBreachWidget`); first pass scope = those 6. The other 15 can adopt `WidgetShell` only (no selector) in a follow-up commit.
- Dependencies (in-domain): #66 (per audit graph `:1611` `FE-N8 ← FE-N5`); benefits from #46 already landed.
- Cross-domain prerequisites: none.
- TDD shape: behavioural test on `WidgetShell` branches + render-counter regression test on the scoped selector.
- Failing test(s) to write FIRST:
  1. `tests/frontend/unit/src/components/dashboard/__tests__/WidgetShell.contract.test.tsx` — render `<WidgetShell isLoading=... error=... isEmpty=... title="Foo">{data}</WidgetShell>` for each branch combination. Assert each branch renders the matching glass-card / skeleton / error / empty / data slot. Fails today (component doesn't exist).
  2. `tests/frontend/unit/src/contexts/__tests__/DashboardFilterContext.scopedSelector.renderCounter.test.tsx` — render-counter pattern:
     ```tsx
     function DepartmentConsumer() {
         const count = useRef(0);
         const dept = useDashboardFilterSelector(state => state.filters.departmentId);
         useEffect(() => { count.current += 1; });
         return <span data-testid="dept-renders">{count.current}|{dept ?? 'none'}</span>;
     }

     function RiskMutator() {
         const { setRiskLevel } = useDashboardFilterMutators();
         return <button onClick={() => setRiskLevel('high')}>mut</button>;
     }
     ```
     Mutate `riskLevel`; assert `dept-renders` count is unchanged after rerender. Phase 4 confirmed there are **6 mutators** to test surface (`setDepartmentId`, `setRiskLevel`, `setControlStatus`, `setControlForm`, `setViewMode`, `resetFilters`). Fails today: the single context shape (`DashboardFilterContext.tsx:32-86`) re-renders all consumers on any mutation.
  3. `tests/frontend/unit/src/components/dashboard/__tests__/DashboardWidgets.shellAdoption.test.tsx` — for the 6 filter-consuming widgets, assert each imports `WidgetShell`. Fails today.
- Code / file changes:
  - NEW `frontend/src/components/dashboard/WidgetShell.tsx`:
    ```tsx
    interface WidgetShellProps {
        title: string;
        isLoading?: boolean;
        error?: Error | null;
        isEmpty?: boolean;
        emptyLabel?: string;
        children: ReactNode;
    }
    export function WidgetShell({ title, isLoading, error, isEmpty, emptyLabel, children }: WidgetShellProps) { /* glass-card + branch */ }
    ```
  - EXTEND `frontend/src/contexts/DashboardFilterContext.tsx`:
    - Re-implement state via `useSyncExternalStore` over an internal store with `subscribe`/`getSnapshot`.
    - Export `useDashboardFilterSelector<T>(selector: (s: DashboardFilters) => T)` and `useDashboardFilterMutators()` (returns the 6 mutators).
    - Keep `useDashboardFilters()` as backward-compat facade returning the legacy union shape.
  - REFACTOR the 6 filter consumers (`CategoryBreakdownCharts.tsx`, `DepartmentTable.tsx`, `RiskDrilldownModal.tsx`, `FilterBar.tsx`, `KRIStatusWidget.tsx`, `KRIBreachWidget.tsx`) to use `useDashboardFilterSelector` + `WidgetShell`.
  - The other 15 widgets adopt `WidgetShell` only (no selector); incremental — separate commit OK.
- Lock / TOML / contract updates: none.
- README / doc updates:
  - `frontend/src/components/dashboard/README.md` — describe `WidgetShell` + scoped selector contract.
- Verification commands:
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/components/dashboard/__tests__/WidgetShell.contract.test.tsx`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/contexts/__tests__/DashboardFilterContext.scopedSelector.renderCounter.test.tsx`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/components/dashboard/__tests__/DashboardWidgets.shellAdoption.test.tsx`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/components/dashboard` (regression)
  - `cd frontend && pnpm tsc --noEmit`
- Commit boundary: single commit, `refactor(frontend/dashboard): introduce WidgetShell + scoped DashboardFilter selector`.
- Rollback note: revert restores the legacy 6-widget direct subscriptions. The compat facade ensures legacy consumers keep working either way.
- Effort: M.

---

## Item #71 (S7.8) — MERGE `frontend/src/services/session/` 8 → 4 (single-flight pin)

- Final disposition: MERGE the 8 session files into 4 (plus barrel):
  - Keep: `types.ts`, `store.ts`.
  - NEW `sessionStorage.ts` ← combine `refreshHint.ts` + `logoutSuppression.ts`.
  - NEW `coordinator.ts` ← combine `manager.ts` + `bootstrap.ts` + `sso.ts`.
  - DELETE: `bootstrap.ts`, `manager.ts`, `sso.ts`, `refreshHint.ts`, `logoutSuppression.ts`.
  - UPDATE `index.ts` barrel.
  **Module-scope state in `sso.ts:9-11` (`refreshInFlight`, `lastRefreshFailureAt`, `REFRESH_FAILURE_COOLDOWN_MS`) MUST survive the merge intact** — pin via single-flight test.
- Dependencies (in-domain): #47 (session-refresh policy extracted) and #66 (AuthContext split). **ADR-011 (#72) is a strict prereq** per audit `:1654` `S7.9 (ADR-011) ──────────────► S7.8`. Land #71 only after #72 stabilises (cross-domain).
- Cross-domain prerequisites: ADR-011 (#72).
- TDD shape: behavioural pin (existing session tests pass) + module-scope state preservation test (new) + structural assertion that file count is 5 (`types`, `store`, `sessionStorage`, `coordinator`, `index`).
- Failing test(s) to write FIRST:
  1. `tests/frontend/unit/src/services/session/__tests__/sessionStorage.merged.test.ts` — exercise both `refreshHint` cookie helpers (`hasRefreshSessionHint`, `clearRefreshSessionHint`) + `logoutSuppression` sessionStorage helpers (`isExplicitLogoutSuppressed`, `setExplicitLogoutSuppressed`, `clearExplicitLogoutSuppressed`) imported from a single module path `@/services/session/sessionStorage`. Fails today.
  2. `tests/frontend/unit/src/services/session/__tests__/coordinator.merged.test.ts` — exercise `applyAuthenticatedSession` (currently `manager.ts:138`), `trySilentSessionRefresh` (currently `sso.ts:13`), and `bootstrapAuthSession` (currently `bootstrap.ts:39`) imported from `@/services/session/coordinator`. Fails today.
  3. **`tests/frontend/unit/src/services/session/__tests__/coordinator.singleFlight.test.ts`** — Phase 4 mandated single-flight pin:
     ```ts
     import { vi, describe, it, expect, beforeEach } from 'vitest';
     import { authApi } from '@/services/authApi';
     import { trySilentSessionRefresh, __resetSilentSessionRefreshForTests } from '@/services/session/coordinator';
     import { __setRefreshSessionHintForTests } from '@/services/session/sessionStorage';

     beforeEach(() => {
         __resetSilentSessionRefreshForTests();
         __setRefreshSessionHintForTests();
     });

     it('two concurrent calls share one in-flight refresh', async () => {
         const refreshSpy = vi.spyOn(authApi, 'refresh').mockResolvedValue({
             access_token: 'tok', user: { id: 1 } as any,
         } as any);
         const [a, b] = await Promise.all([
             trySilentSessionRefresh(),
             trySilentSessionRefresh(),
         ]);
         expect(refreshSpy).toHaveBeenCalledTimes(1); // single-flight
         expect(a).toBe('tok');
         expect(b).toBe('tok');
     });

     it('REFRESH_FAILURE_COOLDOWN_MS gates retries after failure', async () => {
         vi.spyOn(authApi, 'refresh').mockRejectedValueOnce(new Error('boom'));
         await trySilentSessionRefresh(); // failure recorded
         const second = await trySilentSessionRefresh(); // within cooldown
         expect(second).toBeNull();
     });
     ```
     This is the explicit Phase 4 mandate: **2 concurrent calls to `applyAuthenticatedSession`/`trySilentSessionRefresh` should result in only 1 refresh attempt**. The test pins both single-flight (`refreshInFlight` shared promise) and the post-failure cooldown (`lastRefreshFailureAt` + `REFRESH_FAILURE_COOLDOWN_MS`). Will fail if a careless concatenation merge re-instantiates the module-scope state per file boundary. Pin BEFORE the merge to lock current semantics; pin must continue to pass after the merge.
  4. `tests/frontend/unit/src/services/session/__tests__/coordinator.structural.test.ts` — read directory listing of `frontend/src/services/session/`. Assert exactly `{ 'types.ts', 'store.ts', 'sessionStorage.ts', 'coordinator.ts', 'index.ts' }` (5 entries) and **none of** `{ 'bootstrap.ts', 'manager.ts', 'sso.ts', 'refreshHint.ts', 'logoutSuppression.ts' }`. Fails today.
- Code / file changes:
  - NEW `frontend/src/services/session/sessionStorage.ts` — verbatim concatenation of `refreshHint.ts` + `logoutSuppression.ts`. Both are leaf primitives with no shared state.
  - NEW `frontend/src/services/session/coordinator.ts` — verbatim concatenation of `manager.ts` + `bootstrap.ts` + `sso.ts`. **Module-scope state preservation**: keep the three `sso.ts:9-11` declarations at the top of the new file:
    ```ts
    let refreshInFlight: Promise<string | null> | null = null;
    let lastRefreshFailureAt = 0;
    const REFRESH_FAILURE_COOLDOWN_MS = 1_000;
    ```
    AND the bootstrap-level `let bootstrapPromise: ... | null = null;` (`bootstrap.ts:16`). All three test seams (`__resetSilentSessionRefreshForTests`, `__resetAuthSessionCoordinatorForTests`, `__resetBootstrapSessionCacheForTests`) MUST stay exported.
  - DELETE: `bootstrap.ts`, `manager.ts`, `sso.ts`, `refreshHint.ts`, `logoutSuppression.ts`.
  - REWRITE `frontend/src/services/session/index.ts`:
    ```ts
    export * from './coordinator';
    export * from './sessionStorage';
    export * from './store';
    export * from './types';
    ```
- Lock / TOML / contract updates:
  - `tests/backend/pytest/architecture/_naming_allowlist.toml` — add new file paths if listed by name; remove the 5 deleted paths if listed.
- README / doc updates:
  - `frontend/src/services/session/README.md` — replace the 8-file map with the 4-file map. Note the module-scope state preservation contract (single-flight + cooldown) and link to the singleFlight pin test.
- Verification commands:
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/services/session/__tests__/sessionStorage.merged.test.ts`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/services/session/__tests__/coordinator.merged.test.ts`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/services/session/__tests__/coordinator.singleFlight.test.ts`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/services/session/__tests__/coordinator.structural.test.ts`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/services/session` (full session regression)
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/contexts` (auth context regression — verifies #66 still works)
  - `cd frontend && pnpm tsc --noEmit`
  - `make -f scripts/Makefile test-architecture-locks`
- Commit boundary: single commit, `refactor(frontend/services/session): merge 8 files into 4 (preserve single-flight contract)`.
- Rollback note: revert restores the 8-file layout. Single-flight pin must continue to pass under rollback (state preserved either way). Risk vector: a careless rollback might lose the pin test if it imported from the merged path — keep the pin test path-stable via `@/services/session` (barrel) imports rather than direct `@/services/session/coordinator` imports.
- Effort: M.

---

## Item #77a (NEW) — Vendor.status FE Zod soft-tolerate pre-test (pre-migration)

- Final disposition: **NEW pre-migration test** asserting `vendorSchema` (and other Zod schemas that include `status`) can soft-tolerate a missing `status` field — so deploy-skew between BE (#69+#70 migration removes `Vendor.status` from the response) and FE (still expects `status: z.enum(['active'])` per `vendors.ts:62`) does not throw. Recipe: temporarily relax the schema to `status: z.enum(['active']).optional()` (or equivalent soft-tolerate) BEFORE the BE migration lands; the post-migration cleanup (#77b, owned by P5-A5) tightens it back.
- Dependencies (in-domain): none. **MUST land before #69+#70** (the atomic Vendor.status BE migration in P5-A8/cross-cut wave).
- Cross-domain prerequisites: none. Coordinate sequencing with P5-A8 (#76 auth/ commit migration is unrelated; #77b post-migration TS cleanup is in P5-A5).
- TDD shape: behavioural pin — parse a synthetic vendor payload missing `status` and assert it succeeds; parse a payload with `status: 'active'` and assert it still succeeds.
- Failing test(s) to write FIRST:
  1. `tests/frontend/unit/src/services/api/schemas/__tests__/vendors.statusOptional.test.ts`:
     ```ts
     import { describe, it, expect } from 'vitest';
     import { vendorSchema } from '@/services/api/schemas/entities/vendors';

     const baseVendor = {
         id: 1, name: 'Acme', process: 'P1',
         outsourcing_owner_user_id: 1,
         linked_risks: [],
         vendor_type: 'ict' as const,
         risk_score_1_5: 3,
         supports_important_core_insurance_function: false,
         dora_relevant: false,
         is_significant_vendor: false,
         has_alternative_providers: true,
         is_archived: false,
         created_at: '2026-01-01T00:00:00Z',
         updated_at: '2026-01-01T00:00:00Z',
     };

     describe('vendorSchema soft-tolerates missing status (pre-migration #69+#70)', () => {
         it('accepts payload WITH status: active', () => {
             const result = vendorSchema.safeParse({ ...baseVendor, status: 'active' });
             expect(result.success).toBe(true);
         });

         it('accepts payload WITHOUT status field', () => {
             const result = vendorSchema.safeParse(baseVendor);
             expect(result.success).toBe(true); // tolerates deploy-skew
         });
     });
     ```
     Fails today because `vendorSchema` (line 62) declares `status: z.enum(['active'])` (required). Pinning this BEFORE the BE migration is the entire point — the test is the gate that forces the schema relaxation.
  2. `tests/frontend/unit/src/services/api/schemas/__tests__/vendors.statusOptional.lookup.test.ts` — sanity check `linkedVendorSummarySchema` (already at `vendors.ts:9` declares `status: z.string().nullable().optional()`) — that one is already soft-tolerant. The failing pin is specifically the top-level `vendorSchema.status`.
- Code / file changes:
  - EDIT `frontend/src/services/api/schemas/entities/vendors.ts:62`:
    ```ts
    // Pre-migration soft-tolerate (item #77a) — restored to z.enum(['active']) post-migration in #77b.
    status: z.enum(['active']).optional(),
    ```
  - EDIT `frontend/src/types/vendor.ts` — relax `Vendor.status` to `'active' | undefined` (mirror Zod). The post-migration cleanup (#77b in P5-A5) removes `status` entirely.
- Lock / TOML / contract updates:
  - None at this stage. `_endpoint_commit_allowlist.toml` Vendor surfaces remain green; #69+#70 will rewrite them.
- README / doc updates:
  - `docs/migrations/vendor-status-removal.md` (or wherever the #69+#70 plan lives) — note that #77a is the FE pre-test landing in this commit; #77b is the post-migration cleanup in P5-A5.
- Verification commands:
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/services/api/schemas/__tests__/vendors.statusOptional.test.ts`
  - `cd frontend && pnpm vitest run tests/frontend/unit/src/services/api/schemas` (regression — no other parser breaks)
  - `cd frontend && pnpm tsc --noEmit`
- Commit boundary: single commit, `test(frontend/vendors): soft-tolerate missing Vendor.status pre-migration #69+#70`.
- Rollback note: revert restores `status: z.enum(['active'])` (required). If rollback happens AFTER the BE migration has landed, the FE will reject vendor payloads — coordinate with P5-A8 to ensure rollback order is FE-rollback → BE-rollback, not the other way.
- Effort: S.

---

# Cross-domain handoff notes

- **#37 + #39 are real prereqs for #66**, NOT ADR-011 (Phase 4 explicit correction; audit `:1610` is `FE-N5 ← S8.7 + S7.10`). Sequence: #37 → #39 → #65 → #35 → #66 → #67 → #68 → #71 (only after #72/ADR-011 stabilises). #36 lands in parallel.
- **#76 (auth/ commit migration)** is owned by P5-A8 cross-cut. Coordinate sequencing if FE auth-related items reference auth/ allowlist state (most do not — #35/#36/#66 only touch `frontend/src/contexts/`, `frontend/src/authz/`, `frontend/src/hooks/`).
- **#77a placement**: precedes #69+#70 BE migration so deploy-skew is tolerated. **#77b (post-migration TS cleanup)** is owned by P5-A5 — DO NOT include #77b in this recipe.
- **Capability catalog parser constraint** (#65): the parser at `scripts/security/authz_contract_validator/capability_catalog.py:112-126` is brace-matched and does NOT walk `.merge()` / `.extend()`. All capability schemas across this loop (and the rest of the codebase) MUST stay literal-flat. Document this in `frontend/src/services/api/schemas/README.md` as part of #65.
- **Render-counter pattern** (#66, #68): `useRef(0)` + `useEffect(() => { count.current += 1; })` + assertion `expect(after).toBe(before)` after rerender. Same pattern in both items; share a tiny helper if convenient (e.g. `tests/frontend/unit/src/test-helpers/renderCounter.ts`).
- **Single-flight pattern** (#71): pin the module-scope state in `coordinator.ts` BEFORE the merge so the test fails red on careless concatenation. The test is path-stable via `@/services/session` barrel imports.
- **Pydantic-Zod parity items** in this loop:
  - **#39** — `AdminConsoleCapabilities` (4 fields) <-> `adminConsoleCapabilitiesSchema` (4 fields, literal flat). Test: `tests/backend/pytest/api/v1/admin/test_capabilities_parity.py` extracts both via the catalog parser and asserts field-set equality.
  - **#65** — `crudCapabilitySchema` is the *type-level* parity contract. Per-entity Pydantic models in `backend/app/services/_authorization_capabilities/{risks,controls,kris,vendors}.py` and per-entity Zod schemas in `frontend/src/services/api/schemas/entities/{risks,controls,kris,vendors}.ts` MUST literal-include `can_read` and `can_update`. Tests pin both sides.
  - **#15** is in this loop's prompt header but not in the items list (only 10 items). If P5-A1/P5-A2 reference #15 separately, treat as out-of-scope here.
- **Quality gates**: each item's verification block runs `pnpm vitest run`, `pnpm tsc --noEmit`, the relevant Python pytest path, `python scripts/security/validate_authz_capability_contract.py`, and `make -f scripts/Makefile test-architecture-locks`. Round 3 NEW-vs-PRE-EXISTING triage applies to the merged repo state per CLAUDE.md.
- **Defers planned**: `Defers planned` constraint (Phase 1) means: where Loop 1 marked an item as Defer, don't promote it. None of the 10 items in this recipe are deferred.
- **MSW pattern note**: MSW (`msw/node` `setupServer`) is the FE HTTP test seam. Where the recipe says "render a fixture", MSW handlers stub `/api/v1/...` payloads. None of the 10 items here add net-new MSW handlers — all behaviour is exercised at the hook/component level with `vi.fn()` stubs and existing `tests/frontend/unit/src/test-utils/msw` server config. The vendor pre-test (#77a) is `safeParse`-only and doesn't go over the wire.

# Phase 4 corrections incorporated

- #65 **literal-flat schemas** (no `.merge()` / `.extend()` against `crudCapabilitySchema`). Parser at `capability_catalog.py:112-126` uses brace-matching; the recipe explicitly enforces `passthroughObject({...})` per-entity bodies and adds a structural test that bans `.merge(` in capability schemas.
- #66 **render-counter test pattern** is the explicit Phase 4 mandate; sample test code included.
- #71 **single-flight semantics preservation** — explicit test for two concurrent calls resulting in one refresh attempt + cooldown gate; module-scope state at `sso.ts:9-11` listed verbatim in the merge plan.
- #37 **drift-surface, not current-bug** — recipe writes a regression-pin contract test (algebraic-equivalence today; failure-future).
- #39 **genuinely a 4-boolean static stub** — recipe creates `_authorization_capabilities/admin.py` with role-aware booleans + Pydantic-Zod parity test.
- #66 **real prereq is #37 + #39, NOT ADR-011 (#72)** — recipe lists prereqs explicitly and notes ADR-011 is unrelated to #66.
- #68 **21 widgets total, 6 use `useDashboardFilters`** — recipe scopes first pass to the 6 named widgets; Phase 4 mutator count of 6 (`setDepartmentId`, `setRiskLevel`, `setControlStatus`, `setControlForm`, `setViewMode`, `resetFilters`) used in the render-counter test.
- #35 **18 mock files** — recipe enumerates all 18 by path (matches Loop B's authoritative list).
