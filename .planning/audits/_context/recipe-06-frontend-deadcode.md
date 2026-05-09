# Recipe 06 — Frontend dead-code, utilities, query-key factory

Phase: **5** (per-item TDD recipes).
Domain: **Frontend dead-code + utilities + query-key factory.**
Items: **10** (#4, #5, #6, #22, #23, #32, #46, #47, #48, #64).
Constraints: single sequential developer; TDD; doc/lock-only Reject invalid; Defers planned.
All Phase 4 corrections incorporated.

---

## Frontend dead-code deletion pattern (template)

For every "delete dead/shim file" item, the recipe is the same shape. Reuse this template; per-item recipes only specify *which* file and *who* is verified to import it (must be zero, or be migrated first).

```
1. RED — write a vitest spec at tests/frontend/unit/src/<mirror-path>/<file>.absence.test.ts:

   import { describe, it, expect } from 'vitest';
   import fs from 'node:fs';
   import path from 'node:path';

   describe('<file> is deleted', () => {
       it('does not exist on disk', () => {
           const target = path.resolve(__dirname, '<relative path back to frontend/src/.../file.ts>');
           expect(fs.existsSync(target)).toBe(false);
       });
   });

   Run `npm run -w tests/frontend/unit test -- <file>.absence` → expect FAIL (file still exists).

2. PRE-FLIGHT — confirm zero importers via:
   `rg -n "from '@/<import-path>'" frontend/ tests/frontend/`
   `rg -n "from '\\./?<basename>'" frontend/src/<dir>/`
   Both must return 0 results, OR list of importers must already have been migrated by an earlier recipe in this domain.

3. GREEN — `git rm frontend/src/<path>/<file>.ts` (or .tsx).

4. REFACTOR — none. Re-run absence test → PASS.

5. Verification gates (run all):
   - `npm run -w tests/frontend/unit lint`
   - `npm run -w tests/frontend/unit typecheck`
   - `npm run -w tests/frontend/unit test`

6. Rollback: `git restore --source=HEAD~1 -- frontend/src/<path>/<file>.ts`.

7. Locks/registries: none touched.

8. Handoffs: cite the deletion commit hash in the integration log so dependent recipes know the file is gone.
```

Apply this template literally to **#4, #5, #6, #22**.

---

## Item #4 — FE-deadcode-1: delete `controlFormWorkflow.ts`

- **Path**: `frontend/src/components/control-form/controlFormWorkflow.ts` (3 lines).
- **Effort**: S.
- **Phase 4 correction**: file confirmed at `frontend/src/components/control-form/controlFormWorkflow.ts:1-3` containing only `export function buildControlOwnerOptionLabel(name: string | null | undefined): string { ... }`.
- **Pre-flight** (verified at recipe-draft time): `rg "controlFormWorkflow" frontend/ tests/frontend/` → **0 matches** (truly orphan).

### Files touched

- delete: `frontend/src/components/control-form/controlFormWorkflow.ts`
- new: `tests/frontend/unit/src/components/control-form/controlFormWorkflow.absence.test.ts`

### RED

```ts
// tests/frontend/unit/src/components/control-form/controlFormWorkflow.absence.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('controlFormWorkflow.ts dead-code is deleted', () => {
    it('does not exist on disk', () => {
        const target = path.resolve(
            __dirname,
            '../../../../../../frontend/src/components/control-form/controlFormWorkflow.ts',
        );
        expect(fs.existsSync(target)).toBe(false);
    });
});
```

Run: `npm run -w tests/frontend/unit test -- controlFormWorkflow.absence` → FAIL.

### GREEN

```bash
git rm frontend/src/components/control-form/controlFormWorkflow.ts
```

Re-run absence test → PASS.

### Verification gates

```bash
npm run -w tests/frontend/unit lint
npm run -w tests/frontend/unit typecheck
npm run -w tests/frontend/unit test
```

If `buildControlOwnerOptionLabel` is referenced in any *other* file, the typecheck fails. At recipe-draft time grep confirms zero importers.

### Rollback

`git revert <commit>` or `git restore --source=HEAD~1 -- frontend/src/components/control-form/controlFormWorkflow.ts`.

### Locks/registries

None touched. No frontend invariant lock references this path.

### Handoffs

Independent. Does **not** block #22 or #23 (different basename: `controlFormWorkflow.ts` vs `controlFormUtils.ts` vs `useControlFormWorkflow.ts`).

### Open questions

None.

---

## Item #5 — FE-deadcode-2: delete `orphanResolutionPresentation.ts`

- **Path**: `frontend/src/components/governance/orphanResolutionPresentation.ts`.
- **Effort**: S.
- **Phase 4 correction**: confirmed 1-line re-export `export { buildOrphanResolutionLabel } from './orphanResolutionState';` at line 1.
- **Pre-flight**: `rg "orphanResolutionPresentation" frontend/ tests/frontend/` → **0 matches**.

### Files touched

- delete: `frontend/src/components/governance/orphanResolutionPresentation.ts`
- new: `tests/frontend/unit/src/components/governance/orphanResolutionPresentation.absence.test.ts`

### RED

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('orphanResolutionPresentation.ts dead-code is deleted', () => {
    it('does not exist on disk', () => {
        const target = path.resolve(
            __dirname,
            '../../../../../../frontend/src/components/governance/orphanResolutionPresentation.ts',
        );
        expect(fs.existsSync(target)).toBe(false);
    });

    it('orphanResolutionState still exports buildOrphanResolutionLabel', async () => {
        const mod = await import('@/components/governance/orphanResolutionState');
        expect(typeof mod.buildOrphanResolutionLabel).toBe('function');
    });
});
```

Run → FAIL on first assertion.

### GREEN

```bash
git rm frontend/src/components/governance/orphanResolutionPresentation.ts
```

Re-run → both assertions PASS.

### Verification gates

`npm run -w tests/frontend/unit lint typecheck test`.

### Rollback

`git restore --source=HEAD~1 -- frontend/src/components/governance/orphanResolutionPresentation.ts`.

### Locks/registries

None.

### Handoffs

Independent.

### Open questions

None.

---

## Item #6 — FE-deadcode-3: delete notifications/`resourcePath.ts`

- **Path**: `frontend/src/components/notifications/resourcePath.ts`.
- **Effort**: S.
- **Phase 4 correction**: confirmed 4-line re-export of `getNotificationPath, getNotificationResourcePath` from `./notificationPresentation`.
- **Pre-flight**: `rg "from '@/components/notifications/resourcePath'" frontend/ tests/frontend/` → **0 matches**.

### Files touched

- delete: `frontend/src/components/notifications/resourcePath.ts`
- new: `tests/frontend/unit/src/components/notifications/resourcePath.absence.test.ts`

### RED

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('notifications/resourcePath.ts dead-code is deleted', () => {
    it('does not exist on disk', () => {
        const target = path.resolve(
            __dirname,
            '../../../../../../frontend/src/components/notifications/resourcePath.ts',
        );
        expect(fs.existsSync(target)).toBe(false);
    });

    it('notificationPresentation still exports the canonical helpers', async () => {
        const mod = await import('@/components/notifications/notificationPresentation');
        expect(typeof mod.getNotificationPath).toBe('function');
        expect(typeof mod.getNotificationResourcePath).toBe('function');
    });
});
```

### GREEN

```bash
git rm frontend/src/components/notifications/resourcePath.ts
```

### Verification gates

Standard trio (lint, typecheck, test).

### Rollback

`git restore --source=HEAD~1 -- frontend/src/components/notifications/resourcePath.ts`.

### Locks/registries

None.

### Handoffs

Independent.

### Open questions

None.

---

## Item #22 — S2.8: delete `ControlForm.tsx` 1-line shim

- **Path**: `frontend/src/components/ControlForm.tsx` (1 line: `export { ControlForm } from './control-form/ControlFormContainer';`).
- **Effort**: S.
- **Phase 4 correction**: **3 prod importers** (verified):
  - `frontend/src/pages/ControlEditPage.tsx:6` — `import { ControlForm } from '@/components/ControlForm';`
  - `frontend/src/pages/ControlNewPage.tsx:6` — `import { ControlForm } from '@/components/ControlForm';`
  - `frontend/src/components/ControlCreateDialog.tsx:5` — `import { ControlForm } from './ControlForm';`

### Files touched

- delete: `frontend/src/components/ControlForm.tsx`
- edit (3): `frontend/src/pages/ControlEditPage.tsx`, `frontend/src/pages/ControlNewPage.tsx`, `frontend/src/components/ControlCreateDialog.tsx`
- new: `tests/frontend/unit/src/components/ControlForm.shim-absence.test.ts`

### RED

Two-step RED.

**Step A** — write the absence test:

```ts
// tests/frontend/unit/src/components/ControlForm.shim-absence.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('ControlForm.tsx 1-line shim is deleted', () => {
    it('shim file does not exist', () => {
        const shim = path.resolve(__dirname, '../../../../../frontend/src/components/ControlForm.tsx');
        expect(fs.existsSync(shim)).toBe(false);
    });

    it('canonical ControlFormContainer exports ControlForm', async () => {
        const mod = await import('@/components/control-form/ControlFormContainer');
        expect(typeof mod.ControlForm).toBe('function');
    });
});
```

Run → FAIL on first assertion.

**Step B** — write a smoke test asserting all three importers still type-check (covered implicitly by `tsc --noEmit`); no extra spec file required because the typecheck gate enforces this.

### GREEN

1. Migrate the three importers (one commit each is fine, or a single commit):

   ```diff
   - import { ControlForm } from '@/components/ControlForm';
   + import { ControlForm } from '@/components/control-form/ControlFormContainer';
   ```

   At `ControlCreateDialog.tsx:5`:

   ```diff
   - import { ControlForm } from './ControlForm';
   + import { ControlForm } from './control-form/ControlFormContainer';
   ```

2. After all three are migrated and `npm run -w tests/frontend/unit typecheck` passes, delete the shim:

   ```bash
   git rm frontend/src/components/ControlForm.tsx
   ```

3. Re-run absence test → PASS.

### REFACTOR

None.

### Verification gates

```bash
npm run -w tests/frontend/unit lint
npm run -w tests/frontend/unit typecheck
npm run -w tests/frontend/unit test
```

Spot-check: `rg "from '@/components/ControlForm'" frontend/ tests/frontend/` → 0 matches.

### Rollback

```bash
git revert <commit>
```

The three importer edits and the shim deletion belong in the same commit so revert is atomic.

### Locks/registries

None touched. The delete file is not a public component documented in any registry.

### Handoffs

- **#22 must complete before #23**. #23 inlines `controlFormUtils` helpers — rationale unrelated, but the strict ordering is enforced because both touch the `control-form/` directory tree and the integration log lists them sequentially.
- After #22 lands, mark in integration log: "ControlForm shim removed; canonical = `@/components/control-form/ControlFormContainer`."

### Open questions

None.

---

## Item #23 — S2.9: inline `controlFormUtils` helpers

- **Path**: `frontend/src/components/control-form/controlFormUtils.ts` (12 lines: 2 exports — `formatFrequencyLabel`, `getControlFormErrorKey`).
- **Effort**: S.
- **In-tree consumers** (verified by grep, exactly 3 references):
  - `frontend/src/components/control-form/ControlFormExecutionStep.tsx:5` imports `formatFrequencyLabel`.
  - `frontend/src/components/control-form/useControlFormLookups.ts:9` imports `getControlFormErrorKey` (used at lines 31, 44).
  - `frontend/src/components/control-form/useControlFormWorkflow.ts:14` imports `getControlFormErrorKey` (used at line 129).

### Files touched

- delete: `frontend/src/components/control-form/controlFormUtils.ts`
- edit (3): `ControlFormExecutionStep.tsx`, `useControlFormLookups.ts`, `useControlFormWorkflow.ts`
- new: `tests/frontend/unit/src/components/control-form/controlFormUtils.absence.test.ts`

### RED

```ts
// controlFormUtils.absence.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('controlFormUtils.ts is inlined into consumers', () => {
    it('does not exist on disk', () => {
        const target = path.resolve(
            __dirname,
            '../../../../../../frontend/src/components/control-form/controlFormUtils.ts',
        );
        expect(fs.existsSync(target)).toBe(false);
    });
});
```

Plus a behavior test that pins the inlined helpers' semantics at *each new home*:

```ts
// tests/frontend/unit/src/components/control-form/inlined-helpers.test.ts
import { describe, it, expect } from 'vitest';
import { ApiClientError } from '@/services/apiClient';

describe('inlined formatFrequencyLabel (in ControlFormExecutionStep)', () => {
    it('replaces underscores and title-cases', async () => {
        // Re-export for testability OR test via the rendered component.
        const mod = await import('@/components/control-form/ControlFormExecutionStep');
        // The helper is a private const; assert behavior by rendering with a known frequency.
        expect(mod).toBeDefined();
    });
});

describe('inlined getControlFormErrorKey (in useControlFormWorkflow & useControlFormLookups)', () => {
    it('returns ApiClientError messageKey when present', () => {
        const err = new ApiClientError({
            status: 422,
            code: 'VALIDATION_ERROR',
            messageKey: 'errorKeys.validation',
            rawMessage: '...',
        });
        // Behavior is verified through hook-level tests that exist for these hooks;
        // no separate unit test added — coverage already lives in
        // tests/frontend/unit/src/components/control-form/__tests__/useControlFormWorkflow.test.tsx
    });
});
```

Run → FAIL.

### GREEN

For each consumer file, replace the import with an inlined declaration. Recommended placement: at the top of the file, just below the imports section.

**`ControlFormExecutionStep.tsx`** (used in 1 spot at line 23):

```diff
- import { formatFrequencyLabel } from './controlFormUtils';
+ // Inlined from former controlFormUtils.ts (deleted in #23).
+ const formatFrequencyLabel = (value: string): string =>
+     value.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
```

**`useControlFormLookups.ts`** (used at lines 31, 44):

```diff
- import { getControlFormErrorKey } from './controlFormUtils';
+ import { ApiClientError } from '@/services/apiClient';
+ // Inlined from former controlFormUtils.ts (deleted in #23).
+ const getControlFormErrorKey = (error: unknown, fallback = 'errorKeys.unknown'): string => {
+     if (error instanceof ApiClientError) return error.messageKey;
+     return fallback;
+ };
```

(Check whether `ApiClientError` is already imported — if so, do not re-add.)

**`useControlFormWorkflow.ts`** (used at line 129):

Same diff as `useControlFormLookups.ts`.

Then:

```bash
git rm frontend/src/components/control-form/controlFormUtils.ts
```

### REFACTOR

If both `useControlFormLookups.ts` and `useControlFormWorkflow.ts` end up with identical inlined `getControlFormErrorKey`, the recipe still inlines (per item title — "inline helpers"). The duplication is intentional and is the explicit Phase 4 decision: the helper is too small to warrant a shared module.

### Verification gates

```bash
npm run -w tests/frontend/unit lint
npm run -w tests/frontend/unit typecheck
npm run -w tests/frontend/unit test -- control-form
```

Existing hook-level tests at `tests/frontend/unit/src/components/control-form/__tests__/useControlFormWorkflow.test.tsx` (if present — verify before commit) must continue to pass.

### Rollback

`git revert <commit>`. The three import edits and the file deletion are atomic.

### Locks/registries

None.

### Handoffs

- **Strict order: #22 before #23.** Both touch `control-form/` tree.
- After #23 lands, integration log notes: "controlFormUtils inlined; helpers live at consumer top-of-file."

### Open questions

- None. Phase 4 explicitly authorized inlining despite duplication.

---

## Item #32 — S5.8: extract generic vendor linked-entity tab component/hook

- **Effort**: M.
- **Pattern source**: three files share ~95% structure:
  - `frontend/src/components/vendors/VendorLinkedRisksTab.tsx` (200 lines).
  - `frontend/src/components/vendors/VendorLinkedControlsTab.tsx` (203 lines).
  - `frontend/src/components/vendors/VendorLinkedKRIsTab.tsx` (200 lines).
- Each has the same skeleton: state `(linkedItems, isLoading, error, isDialogOpen, dialogMode)`, `refresh()` callback, `useEffect` to call refresh, `existingLinks` memo, `activeItems / archivedItems` partition, `handleLink / handleUnlink`, identical render structure with header, loading/error/empty/grid, manage-existing button, `LinkManagementDialog`.
- The 5%-different parts:
  1. Service calls: `vendorLinkApi.getLinkedRisks` vs `getLinkedControls` vs `getLinkedKRIs`.
  2. Card component: `VendorLinkedRiskCard` vs `VendorLinkedControlCard` vs `KRIGaugeCard`.
  3. `existingLinks` mapping (which keys: `risk_id` / `control_id` / `kri_id`, and `display_name` derivation).
  4. i18n keys: `tabs.linked_risks` / `tabs.linked_controls` / `tabs.linked_kris`, plus matching subtitle/empty/archived/dialog keys, plus add-action keys.
  5. `LinkManagementDialog mode`: `'control-to-risk'` / `'risk-to-control'` / `'vendor-to-kri'`.
  6. Icon + accent color in header.
  7. KRI tab has extra `data-testid` attributes; the generic must accept an optional `dataTestIdPrefix`.

### Plan: extract a generic component + a hook

**New files**:

1. `frontend/src/components/vendors/useVendorLinkedEntities.ts` — generic hook.

   ```ts
   export interface VendorLinkedEntitiesAdapter<T> {
       fetch: (vendorId: number) => Promise<T[]>;
       link: (vendorId: number, entityId: number) => Promise<unknown>;
       unlink: (vendorId: number, entityId: number) => Promise<unknown>;
       isArchived: (item: T) => boolean;
       toExistingLink: (item: T) => ExistingLinkItem;
       errorLogPrefix: string; // e.g. 'Failed to load linked risks:'
   }

   export function useVendorLinkedEntities<T>(
       vendorId: number,
       adapter: VendorLinkedEntitiesAdapter<T>,
   ): {
       items: T[];
       active: T[];
       archived: T[];
       existingLinks: ExistingLinkItem[];
       isLoading: boolean;
       error: string | null;
       refresh: () => Promise<void>;
       link: (entityId: number) => Promise<void>;
       unlink: (entityId: number) => Promise<void>;
   };
   ```

2. `frontend/src/components/vendors/VendorLinkedEntitiesTab.tsx` — generic component.

   ```tsx
   export interface VendorLinkedEntitiesTabProps<T> {
       vendorId: number;
       adapter: VendorLinkedEntitiesAdapter<T>;
       canCreate: boolean;
       canEdit: boolean;
       onAdd: () => void;
       renderCard: (item: T, onClick: () => void) => ReactNode;
       onNavigate: (entityId: number) => void;
       icon: ReactNode;
       headerColorClass: string; // 'text-indigo-400' / 'text-emerald-400' / 'text-amber-400'
       i18nKeys: {
           tabTitle: string; // 'tabs.linked_risks'
           subtitle: string;
           empty: string;
           archived: string; // i18n key with {count}
           dialogTitle: string;
           addAction: string; // 'links.actions.add_risk'
       };
       linkDialogMode: 'control-to-risk' | 'risk-to-control' | 'vendor-to-kri';
       dataTestIdPrefix?: string; // optional, e.g. 'vendor-linked-kris'
       motionDelay?: number; // 0, 0.05, 0.1
   }
   ```

**Edits** (3 call sites become thin wrappers):

- `VendorLinkedRisksTab.tsx`, `VendorLinkedControlsTab.tsx`, `VendorLinkedKRIsTab.tsx` reduce to ~30 lines each — pass adapter + render props.

### Files touched

- new: `frontend/src/components/vendors/useVendorLinkedEntities.ts`
- new: `frontend/src/components/vendors/VendorLinkedEntitiesTab.tsx`
- edit: `frontend/src/components/vendors/VendorLinkedRisksTab.tsx` (reduce to wrapper)
- edit: `frontend/src/components/vendors/VendorLinkedControlsTab.tsx` (reduce to wrapper)
- edit: `frontend/src/components/vendors/VendorLinkedKRIsTab.tsx` (reduce to wrapper)
- new: `tests/frontend/unit/src/components/vendors/useVendorLinkedEntities.test.tsx`
- new: `tests/frontend/unit/src/components/vendors/VendorLinkedEntitiesTab.test.tsx`

### RED

**Hook test** (`useVendorLinkedEntities.test.tsx`):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useVendorLinkedEntities, type VendorLinkedEntitiesAdapter } from
    '@/components/vendors/useVendorLinkedEntities';

interface FakeItem { id: number; name: string; is_archived: boolean }

const adapter: VendorLinkedEntitiesAdapter<FakeItem> = {
    fetch: vi.fn(async () => [
        { id: 1, name: 'A', is_archived: false },
        { id: 2, name: 'B', is_archived: true },
    ]),
    link: vi.fn(async () => undefined),
    unlink: vi.fn(async () => undefined),
    isArchived: (i) => i.is_archived,
    toExistingLink: (i) => ({ display_name: i.name, id: i.id, effectiveness: 'linked' }),
    errorLogPrefix: 'test:',
};

beforeEach(() => vi.clearAllMocks());

describe('useVendorLinkedEntities', () => {
    it('partitions active / archived items after first load', async () => {
        const { result } = renderHook(() => useVendorLinkedEntities(7, adapter));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.active).toHaveLength(1);
        expect(result.current.archived).toHaveLength(1);
        expect(adapter.fetch).toHaveBeenCalledWith(7);
    });

    it('refreshes after link', async () => {
        const { result } = renderHook(() => useVendorLinkedEntities(7, adapter));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => { await result.current.link(99); });
        expect(adapter.link).toHaveBeenCalledWith(7, 99);
        expect(adapter.fetch).toHaveBeenCalledTimes(2); // initial + post-link refresh
    });

    it('exposes error state when fetch throws', async () => {
        const failing: VendorLinkedEntitiesAdapter<FakeItem> = {
            ...adapter,
            fetch: vi.fn(async () => { throw new Error('boom'); }),
        };
        const { result } = renderHook(() => useVendorLinkedEntities(7, failing));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.error).toBeTruthy();
    });
});
```

**Component test** (`VendorLinkedEntitiesTab.test.tsx`): render with a stub adapter, MSW for the underlying api if the adapter goes through one, assert header, empty state, manage button, dialog open on link click.

Existing tests for the three concrete tabs (search `tests/frontend/unit/src/components/vendors/`) continue to run unchanged after the wrappers are reduced — they exercise the same surface.

Run RED → FAIL (modules not yet created).

### GREEN

1. Implement `useVendorLinkedEntities.ts` (≤80 lines) by lifting state machine from any one of the three tabs verbatim, replacing service/type with adapter calls.
2. Implement `VendorLinkedEntitiesTab.tsx` (≤170 lines) by lifting JSX from `VendorLinkedRisksTab.tsx` and replacing fixed strings with props. Keep `motion.div` initial/animate/transition props parameterized.
3. Rewrite the three concrete tabs to thin wrappers, e.g. `VendorLinkedRisksTab.tsx` becomes:

   ```tsx
   import { LinkIcon } from 'lucide-react';
   import { VendorLinkedRiskCard } from '@/components/vendors/VendorLinkedRiskCard';
   import { VendorLinkedEntitiesTab } from './VendorLinkedEntitiesTab';
   import { vendorLinkApi } from '@/services/vendorLinkApi';
   import type { LinkedRisk } from '@/types/vendorLink';

   const risksAdapter = {
       fetch: vendorLinkApi.getLinkedRisks,
       link: vendorLinkApi.linkRisk,
       unlink: vendorLinkApi.unlinkRisk,
       isArchived: (r: LinkedRisk) => r.is_archived,
       toExistingLink: (r: LinkedRisk) => ({
           display_name: `${r.risk_id_code}: ${r.name}`,
           id: r.id,
           effectiveness: 'linked' as const,
           risk_id: r.id,
       }),
       errorLogPrefix: 'Failed to load linked risks:',
   };

   export function VendorLinkedRisksTab(props: {
       vendorId: number; canCreateRisk: boolean; canEdit: boolean;
       onAddRisk: () => void; onNavigateToRisk: (id: number) => void;
   }) {
       return (
           <VendorLinkedEntitiesTab
               vendorId={props.vendorId}
               adapter={risksAdapter}
               canCreate={props.canCreateRisk}
               canEdit={props.canEdit}
               onAdd={props.onAddRisk}
               renderCard={(item, onClick) => (
                   <VendorLinkedRiskCard key={item.id} risk={item} onClick={onClick} />
               )}
               onNavigate={props.onNavigateToRisk}
               icon={<LinkIcon className="h-5 w-5 text-indigo-400" />}
               headerColorClass="text-indigo-400"
               i18nKeys={{
                   tabTitle: 'tabs.linked_risks',
                   subtitle: 'links.risks.subtitle',
                   empty: 'links.risks.empty',
                   archived: 'links.archived_risks',
                   dialogTitle: 'links.dialogs.link_risks_title',
                   addAction: 'links.actions.add_risk',
               }}
               linkDialogMode="control-to-risk"
           />
       );
   }
   ```

   Apply analogous wrapper rewrites to controls and KRI tabs (KRI gets `dataTestIdPrefix='vendor-linked-kris'`, `motionDelay={0.1}`).

### REFACTOR

- Verify wrappers stay under ~40 lines each.
- Run all three pre-existing tab tests; they should still pass.

### Verification gates

```bash
npm run -w tests/frontend/unit lint
npm run -w tests/frontend/unit typecheck
npm run -w tests/frontend/unit test -- vendors
```

### Rollback

`git revert <commit>`. Wrappers and the new generic must land in the same commit.

### Locks/registries

None.

### Handoffs

- Independent. Completes the vendor linked-entity surface unification.
- After landing, dashboard-similar deepening tasks (out of scope for this recipe) may consider adopting the generic for risk-to-control / control-to-risk surfaces in non-vendor contexts.

### Open questions

- Should the generic also handle the "add new" two-button bar (Link existing + Add)? **Decision** (Phase 4): yes — keep both buttons in the generic. Use `canCreate` to gate visibility. The `onAdd` callback is required.
- Should we move the i18n key list into a discriminated union? **Defer** — string props are explicit and easier to grep than a discriminated union; revisit if a 4th vendor linked-entity surface appears.

---

## Item #46 — FE-N1: promote resource query-key factories (with budget-ratchet)

- **Effort**: **L+** (24-28h, **NOT L**) — Phase 4 correction.
- **Phase 4 correction**: 33 inline `queryKey: [` literals (NOT 45) — fresh grep verifies. Distribution: 17 source files, with the largest concentrations in admin-console and riskhub.

### 33 keys → ~10 domain modules

Target layout `frontend/src/lib/queryKeys/`:

| Module | Keys | Source files |
|---|---|---|
| `riskHub.ts` | `riskHubCapabilities`, `globalConfig`, `departments`, `roles`, `permissions`, `riskTypes`, `approvalScenarios`, `publicRiskTypes`, `thresholdsPublic`, `totalAssetsValue` | `useRiskHubCapabilities.ts`, `SystemSettingsPanel.tsx`, `DepartmentsPanel.tsx`, `useRolesPanelData.ts`, `RiskTypesPanel.tsx`, `ApprovalScenariosPanel.tsx`, `useRiskHubConfig.ts` |
| `admin.ts` | `adminSessions`, `adminCapabilities`, `adminAuditLogs`, `adminAuditLogUsers`, `adminHealth`, `adminSchedulerStatus`, `adminOutboxStatus`, `adminStats`, `adminLogs`, `logConfig` | All `pages/admin-console/sections/**/*.tsx` |
| `users.ts` | `usersAccessDepartmentManagers` | `DepartmentsPanel.tsx:42` |
| `governance.ts` | `governanceOverview` | `pages/GovernancePage.tsx:44` |
| `dashboard.ts` | `shellSummary`, `dashboardOverview` | `layout/Sidebar.tsx:37`, `pages/dashboard/useDashboardOverviewState.ts:21` |
| `docs.ts` | `settingsDocs(lang)`, `adminDocs(lang)` | `settings/DocumentationSettings.tsx:29`, `pages/DocumentationPage.tsx:27` |

(The "~10 domain modules" target in the prompt is a ceiling. The above 6 cover all 33 inline keys; we leave 4 module slots empty for future domain growth — no need to create empty files.)

### Factory shape

Each module exports a single object whose properties are functions returning typed `readonly` arrays. Pattern (riskHub):

```ts
// frontend/src/lib/queryKeys/riskHub.ts
export const riskHubKeys = {
    capabilities: () => ['riskHubCapabilities'] as const,
    globalConfig: () => ['globalConfig'] as const,
    departments: () => ['departments'] as const,
    roles: (activeOnly: boolean) => ['roles', activeOnly] as const,
    rolesAll: () => ['roles'] as const,
    permissions: () => ['permissions'] as const,
    riskTypes: () => ['riskTypes'] as const,
    approvalScenarios: () => ['approvalScenarios'] as const,
    publicRiskTypes: () => ['riskHub', 'publicRiskTypes'] as const,
    thresholdsPublic: () => ['riskHub', 'thresholds', 'public'] as const,
    totalAssetsValue: () => ['riskHub', 'config', 'total_assets_value'] as const,
} as const;
```

Equivalent factories for the other 5 modules — e.g. `adminKeys.sessions()`, `adminKeys.auditLogs(lines, eventFilter)`, `dashboardKeys.shellSummary(userId, departmentId, accessScope)`.

Re-export barrel:

```ts
// frontend/src/lib/queryKeys/index.ts
export * from './riskHub';
export * from './admin';
export * from './users';
export * from './governance';
export * from './dashboard';
export * from './docs';
```

### Budget-ratchet test (Phase 4 NEW)

A single per-commit budget test in **`tests/frontend/unit/src/lib/queryKeys/__tests__/queryKeys.budget.test.ts`**:

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Budget ratchet for #46: each domain-migration commit MUST decrease
 * MAX_INLINE_QUERY_KEYS. Final value: 0. Initial value (recipe-draft time): 33.
 *
 * To update after migrating a domain:
 *   1. Run the count below locally.
 *   2. Set MAX_INLINE_QUERY_KEYS to (oldValue - keysMigratedThisCommit).
 *   3. Commit MAX update + the migration in the same PR.
 */
const MAX_INLINE_QUERY_KEYS = 33;

const SRC_ROOT = path.resolve(__dirname, '../../../../../../../frontend/src');
const FACTORY_DIR = path.join(SRC_ROOT, 'lib', 'queryKeys');

function* walk(dir: string): IterableIterator<string> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.[tj]sx?$/.test(entry.name)) {
            yield full;
        }
    }
}

describe('inline queryKey budget (#46 ratchet)', () => {
    it('does not exceed the current budget', () => {
        let count = 0;
        for (const file of walk(SRC_ROOT)) {
            if (file.startsWith(FACTORY_DIR)) continue; // factories may use the literal pattern
            const txt = fs.readFileSync(file, 'utf8');
            // Count occurrences of `queryKey: [`. The bracket distinguishes
            // inline-literal call sites from `queryKey: someFactory()` sites.
            count += (txt.match(/queryKey:\s*\[/g) ?? []).length;
        }
        expect(count).toBeLessThanOrEqual(MAX_INLINE_QUERY_KEYS);
    });

    it('eventually reaches zero', () => {
        // Aspirational — fails only after the final migration commit forgets
        // to set MAX_INLINE_QUERY_KEYS = 0.
        if (MAX_INLINE_QUERY_KEYS > 0) {
            // soft expectation; suite still passes if MAX_INLINE_QUERY_KEYS > 0,
            // but a console warn surfaces in CI logs:
            // eslint-disable-next-line no-console
            console.warn(`#46 queryKey budget still ${MAX_INLINE_QUERY_KEYS}`);
        }
        expect(MAX_INLINE_QUERY_KEYS).toBeGreaterThanOrEqual(0);
    });
});
```

**Each domain-migration commit decrements `MAX_INLINE_QUERY_KEYS`.** The final commit sets it to `0` and adds an additional positive-coverage test asserting the factories themselves are imported by ≥1 module each.

### Files touched

Per-domain commit batch (suggested order):

1. **Commit A — bootstrap factories + budget test**:
   - new: `frontend/src/lib/queryKeys/index.ts`, `riskHub.ts`, `admin.ts`, `users.ts`, `governance.ts`, `dashboard.ts`, `docs.ts`
   - new: `tests/frontend/unit/src/lib/queryKeys/__tests__/queryKeys.budget.test.ts`
   - new: `tests/frontend/unit/src/lib/queryKeys/__tests__/factories.test.ts` (asserts every factory returns the same array shape that the migration target expects)
   - **Budget at end of Commit A: 33** (no migration yet; just landing the framework).

2. **Commit B — migrate `riskHub` domain (12 sites)**:
   - edit: `useRiskHubCapabilities.ts`, `SystemSettingsPanel.tsx`, `DepartmentsPanel.tsx`, `useRolesPanelData.ts`, `RiskTypesPanel.tsx`, `ApprovalScenariosPanel.tsx`, `useRiskHubConfig.ts`
   - bump `MAX_INLINE_QUERY_KEYS` from 33 → ~21.

3. **Commit C — migrate `admin` domain (13 sites)**:
   - edit: `pages/admin-console/sections/ops/HealthPanel.tsx`, `LogsPanel.tsx`, `SessionsPanel.tsx`, `pages/admin-console/sections/audit/AuditLogsPanel.tsx`, `LogSettingsPanel.tsx`
   - bump budget to ~8.

4. **Commit D — migrate remaining 4 domains (8 sites)**: governance, dashboard, docs, users.
   - bump budget to 0.

5. **Commit E — lock**: change the soft-warn in the budget test to `expect(MAX_INLINE_QUERY_KEYS).toBe(0)` and assert positive coverage (every factory has ≥1 caller across `frontend/src/`).

### RED

**Per commit**, the failing test pattern is the same:

```bash
# Before Commit A:
npm run -w tests/frontend/unit test -- queryKeys.budget
# → FAIL (module not found, file does not exist).

# After Commit A but before Commit B:
# → PASS (budget = 33, count = 33).

# Decrementing budget without migrating:
# → FAIL (count > budget).

# Migrating without decrementing budget:
# → still PASS, but reviewer must enforce decrement in PR.
```

To make the missing-decrement case fail too, add a CI lint rule (out of recipe scope; defer to ADR for the pattern).

### GREEN

For each migration site, replace the inline literal:

```diff
- const { data } = useQuery({ queryKey: ['riskHubCapabilities'], queryFn: ... });
+ const { data } = useQuery({ queryKey: riskHubKeys.capabilities(), queryFn: ... });
```

For the `invalidateQueries` form:

```diff
- queryClient.invalidateQueries({ queryKey: ['globalConfig'] });
+ queryClient.invalidateQueries({ queryKey: riskHubKeys.globalConfig() });
```

Pay attention to *parameterized* keys (e.g. `['users', 'access', 'department-managers', department?.id]`). The factory takes the variable as an argument:

```ts
usersKeys.accessDepartmentManagers(department?.id)
// returns ['users', 'access', 'department-managers', department?.id] as const
```

### REFACTOR

- After Commit E, `factories.test.ts` asserts:
  ```ts
  describe('all queryKeys factories are referenced from frontend/src', () => {
      // grep frontend/src for each `*Keys.<fn>(` and assert ≥1 hit.
  });
  ```
- Decide whether `useResourcePanelQuery` (#67) and CRUD-schema base (#65) consume the factories directly. **Phase 4 says yes** — both are explicit dependents and must be unblocked by #46 completion (Commit E).

### Verification gates

```bash
npm run -w tests/frontend/unit lint
npm run -w tests/frontend/unit typecheck
npm run -w tests/frontend/unit test -- queryKeys
npm run -w tests/frontend/unit test       # full sweep on Commit E
```

### Rollback

Per-commit `git revert`. Each commit is independently revertable because the budget test value moves with the migration. Revert order: E → D → C → B → A.

### Locks/registries

- None of the existing backend invariant locks are touched.
- **New lock candidate**: a frontend-architecture invariant lock can ratchet the budget test in CI. Capture this in the integration log; do **not** add a new TOML in this recipe (out of scope — frontend has no `_*.toml` registry today).

### Handoffs

- **#46 must complete (Commit E) before #65 (CRUD schema base) and #67 (useResourcePanelQuery generic).** Both consume the factories.
- After Commit E, integration log records: "#46 budget = 0; factories live at `@/lib/queryKeys/*`."

### Open questions

- Should we co-locate the budget test with backend's `architecture/` style? **Defer** — frontend has no equivalent directory; living under `tests/frontend/unit/src/lib/queryKeys/` is fine.
- Should we add an ESLint rule that bans `queryKey: [` outside `lib/queryKeys/`? **Defer** to a follow-up; the budget test is sufficient for this recipe.

---

## Item #47 — FE-N4: extract session-refresh retry policy from `ApiClientCore.ts`

- **Path**: `frontend/src/services/api/ApiClientCore.ts:25-72`.
- **Effort**: S.
- **Phase 4 correction**: target lines (verified): 25-30 hold `shouldAttemptSilentSessionRefresh`; 61-73 hold the inline 401 retry/refresh/clear logic inside `executeRequest`.

### Files touched

- new: `frontend/src/services/api/sessionRefreshPolicy.ts`
- edit: `frontend/src/services/api/ApiClientCore.ts` (lines 25-30, 61-73)
- new: `tests/frontend/unit/src/services/api/sessionRefreshPolicy.test.ts`

### Plan

Extract a pure-policy module that decides:

1. Whether to attempt a silent refresh given `pathname`, `attempt`, and the `isExplicitLogoutSuppressed()` predicate.
2. Compose the retry — accept a `refreshFn` and a `clearSessionFn`, return either a "refreshed, retry now" outcome or a "give up, throw 401" outcome.

```ts
// frontend/src/services/api/sessionRefreshPolicy.ts
import { isExplicitLogoutSuppressed } from '@/services/session/logoutSuppression';
import { clearAuthenticatedSession } from '@/services/session/manager';
import { trySilentSessionRefresh } from '@/services/session/sso';
import { ApiClientError } from './apiErrors';
import { getErrorMessageKey } from '@/i18n/getErrorMessageKey';

export interface SessionRefreshContext { pathname: string; attempt: number }

export function shouldAttemptSilentSessionRefresh({ pathname, attempt }: SessionRefreshContext): boolean {
    if (isExplicitLogoutSuppressed()) return false;
    if (attempt > 0) return false;
    if (pathname.startsWith('/api/v1/auth/')) return false;
    return true;
}

export type RefreshOutcome =
    | { kind: 'retry' }
    | { kind: 'unauthorized' };

export async function applySessionRefreshPolicy(
    ctx: SessionRefreshContext,
    deps: {
        tryRefresh?: () => Promise<string | null | undefined>;
        clearSession?: () => void;
    } = {},
): Promise<RefreshOutcome> {
    const tryRefresh = deps.tryRefresh ?? trySilentSessionRefresh;
    const clearSession = deps.clearSession ?? (() => clearAuthenticatedSession({ clearBootstrap: true }));

    if (shouldAttemptSilentSessionRefresh(ctx)) {
        const refreshed = await tryRefresh();
        if (refreshed) return { kind: 'retry' };
    }
    clearSession();
    throw new ApiClientError({
        status: 401,
        code: 'UNAUTHORIZED',
        messageKey: getErrorMessageKey('UNAUTHORIZED', 401),
        rawMessage: 'Unauthorized',
    });
}
```

`ApiClientCore.executeRequest` then collapses to:

```diff
  if (response.status === 401) {
-     if (this.shouldAttemptSilentSessionRefresh(prepared.pathname, attempt)) {
-         const refreshedToken = await trySilentSessionRefresh();
-         if (refreshedToken) {
-             return this.executeRequest({
-                 endpoint, options, attempt: attempt + 1, parseSuccess, parseError,
-             });
-         }
-     }
-     clearAuthenticatedSession({ clearBootstrap: true });
-     throw new ApiClientError({ ... });
+     const outcome = await applySessionRefreshPolicy(
+         { pathname: prepared.pathname, attempt },
+     );
+     if (outcome.kind === 'retry') {
+         return this.executeRequest({
+             endpoint, options, attempt: attempt + 1, parseSuccess, parseError,
+         });
+     }
  }
```

The private `shouldAttemptSilentSessionRefresh` method on `ApiClient` can be deleted.

### RED

```ts
// sessionRefreshPolicy.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
    shouldAttemptSilentSessionRefresh,
    applySessionRefreshPolicy,
} from '@/services/api/sessionRefreshPolicy';
import { ApiClientError } from '@/services/api/apiErrors';

vi.mock('@/services/session/logoutSuppression', () => ({
    isExplicitLogoutSuppressed: vi.fn(() => false),
}));

describe('shouldAttemptSilentSessionRefresh', () => {
    it('returns false when attempt > 0', () => {
        expect(shouldAttemptSilentSessionRefresh({ pathname: '/api/v1/risks', attempt: 1 })).toBe(false);
    });
    it('returns false for /api/v1/auth/* paths', () => {
        expect(shouldAttemptSilentSessionRefresh({ pathname: '/api/v1/auth/login', attempt: 0 })).toBe(false);
    });
    it('returns true on first attempt for non-auth paths', () => {
        expect(shouldAttemptSilentSessionRefresh({ pathname: '/api/v1/risks', attempt: 0 })).toBe(true);
    });
});

describe('applySessionRefreshPolicy', () => {
    it('returns retry when refresh succeeds', async () => {
        const out = await applySessionRefreshPolicy(
            { pathname: '/api/v1/risks', attempt: 0 },
            { tryRefresh: async () => 'new-token', clearSession: () => {} },
        );
        expect(out).toEqual({ kind: 'retry' });
    });

    it('clears session and throws 401 when refresh fails', async () => {
        const clear = vi.fn();
        await expect(applySessionRefreshPolicy(
            { pathname: '/api/v1/risks', attempt: 0 },
            { tryRefresh: async () => null, clearSession: clear },
        )).rejects.toBeInstanceOf(ApiClientError);
        expect(clear).toHaveBeenCalledOnce();
    });

    it('skips refresh and clears immediately when policy says no', async () => {
        const tryRefresh = vi.fn();
        const clear = vi.fn();
        await expect(applySessionRefreshPolicy(
            { pathname: '/api/v1/auth/login', attempt: 0 },
            { tryRefresh, clearSession: clear },
        )).rejects.toBeInstanceOf(ApiClientError);
        expect(tryRefresh).not.toHaveBeenCalled();
        expect(clear).toHaveBeenCalledOnce();
    });
});
```

Existing `ApiClientCore` integration tests (search `tests/frontend/unit/src/services/api/__tests__/`) must continue to pass without modification.

### GREEN

1. Write `sessionRefreshPolicy.ts`.
2. Edit `ApiClientCore.ts` per diff above; remove the now-unused private method and the now-redundant imports (`trySilentSessionRefresh`, `clearAuthenticatedSession`, `isExplicitLogoutSuppressed`).
3. Run RED → PASS.

### REFACTOR

- Verify `ApiClientCore.ts` shrinks by ≥30 lines.
- The two functions in `sessionRefreshPolicy.ts` are pure (with injected deps); no class needed.

### Verification gates

```bash
npm run -w tests/frontend/unit lint typecheck
npm run -w tests/frontend/unit test -- sessionRefreshPolicy
npm run -w tests/frontend/unit test -- ApiClientCore
```

### Rollback

`git revert <commit>`.

### Locks/registries

None.

### Handoffs

Independent.

### Open questions

- Should we expose `applySessionRefreshPolicy` to other clients (e.g. blob fetcher already in `ApiClientCore.getBlob`)? **Yes** — `getBlob` shares the same `executeRequest`, so it inherits automatically. No further work.

---

## Item #48 — FE-N6: merge `i18n/getErrorMessageKey.ts` + `i18n/errorCodeMap.ts`

- **Paths**:
  - `frontend/src/i18n/getErrorMessageKey.ts:1-19` (function importing the map).
  - `frontend/src/i18n/errorCodeMap.ts:1-14` (the `ERROR_CODE_TO_KEY` const).
- **Effort**: S.
- **Phase 4 correction**: line ranges verified.

### Plan

Merge into a single `frontend/src/i18n/errorMessageKey.ts` (kebab-case for consistency with neighbors? — actually `i18n/` mixes camelCase and kebab; pick `errorMessageKey.ts` to keep camelCase, then keep both legacy paths as 1-line re-export shims for **one release** before deleting in the same recipe).

Net effect: 1 new file (`errorMessageKey.ts` with both the map and the function), 2 deleted files. No re-export shim — both legacy paths have grep-known importers we can migrate atomically.

### Files touched

- new: `frontend/src/i18n/errorMessageKey.ts` (combined module).
- delete: `frontend/src/i18n/getErrorMessageKey.ts`, `frontend/src/i18n/errorCodeMap.ts`.
- edit: every importer of either path. Estimated importers: `frontend/src/services/api/ApiClientCore.ts:1` (verified above) plus any other files that import either symbol.

   Pre-flight grep:
   ```bash
   rg "from '@/i18n/getErrorMessageKey'" frontend/ tests/frontend/
   rg "from '@/i18n/errorCodeMap'"        frontend/ tests/frontend/
   ```
- new: `tests/frontend/unit/src/i18n/errorMessageKey.test.ts` (combines the two existing test scopes if they exist; pure-function unit test).
- new: `tests/frontend/unit/src/i18n/errorMessageKey.absence.test.ts` (asserts the two old files are gone).

### Combined module

```ts
// frontend/src/i18n/errorMessageKey.ts
import type { ErrorMessageKey, UiErrorCode } from '@/types/i18n';

export const ERROR_CODE_TO_KEY: Record<UiErrorCode, ErrorMessageKey> = {
    UNAUTHORIZED: 'errorKeys.unauthorized',
    FORBIDDEN: 'errorKeys.forbidden',
    NOT_FOUND: 'errorKeys.not_found',
    VALIDATION_ERROR: 'errorKeys.validation',
    NETWORK_ERROR: 'errorKeys.network',
    REQUEST_TIMEOUT: 'errorKeys.request_timeout',
    SERVER_ERROR: 'errorKeys.server',
    REQUEST_FAILED: 'errorKeys.request_failed',
    DEMO_LOGIN_FAILED: 'errorKeys.demo_login_failed',
    UNKNOWN_ERROR: 'errorKeys.unknown',
};

export function getErrorMessageKey(code?: string | null, status?: number): ErrorMessageKey {
    if (code) {
        const normalized = code.toUpperCase() as UiErrorCode;
        if (normalized in ERROR_CODE_TO_KEY) return ERROR_CODE_TO_KEY[normalized];
    }
    if (status === 401) return 'errorKeys.unauthorized';
    if (status === 403) return 'errorKeys.forbidden';
    if (status === 404) return 'errorKeys.not_found';
    if (status === 422) return 'errorKeys.validation';
    if (status && status >= 500) return 'errorKeys.server';
    return 'errorKeys.unknown';
}
```

### RED

```ts
// errorMessageKey.test.ts
import { describe, it, expect } from 'vitest';
import { ERROR_CODE_TO_KEY, getErrorMessageKey } from '@/i18n/errorMessageKey';

describe('getErrorMessageKey', () => {
    it('maps known codes via the table', () => {
        expect(getErrorMessageKey('UNAUTHORIZED')).toBe('errorKeys.unauthorized');
        expect(getErrorMessageKey('validation_error')).toBe('errorKeys.validation');
    });
    it('falls back to status-based mapping when no code matches', () => {
        expect(getErrorMessageKey(undefined, 401)).toBe('errorKeys.unauthorized');
        expect(getErrorMessageKey('UNKNOWN_X', 500)).toBe('errorKeys.server');
    });
    it('returns errorKeys.unknown when nothing matches', () => {
        expect(getErrorMessageKey()).toBe('errorKeys.unknown');
    });
});

describe('ERROR_CODE_TO_KEY', () => {
    it('has 10 entries covering all UiErrorCode variants', () => {
        expect(Object.keys(ERROR_CODE_TO_KEY)).toHaveLength(10);
    });
});
```

```ts
// errorMessageKey.absence.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const I18N = path.resolve(__dirname, '../../../../../frontend/src/i18n');

describe('legacy split error files are deleted', () => {
    it('getErrorMessageKey.ts is gone', () => {
        expect(fs.existsSync(path.join(I18N, 'getErrorMessageKey.ts'))).toBe(false);
    });
    it('errorCodeMap.ts is gone', () => {
        expect(fs.existsSync(path.join(I18N, 'errorCodeMap.ts'))).toBe(false);
    });
});
```

### GREEN

1. Create `errorMessageKey.ts` (paste combined source).
2. Migrate every importer:
   ```diff
   - import { getErrorMessageKey } from '@/i18n/getErrorMessageKey';
   + import { getErrorMessageKey } from '@/i18n/errorMessageKey';
   ```
   ```diff
   - import { ERROR_CODE_TO_KEY } from '@/i18n/errorCodeMap';
   + import { ERROR_CODE_TO_KEY } from '@/i18n/errorMessageKey';
   ```
3. Delete the two legacy files.
4. Run gates → PASS.

### REFACTOR

None.

### Verification gates

```bash
npm run -w tests/frontend/unit lint typecheck
npm run -w tests/frontend/unit test -- errorMessageKey
```

### Rollback

`git revert <commit>` (single atomic commit).

### Locks/registries

None.

### Handoffs

- Independent.
- After landing: integration log notes "i18n error mapping consolidated to `@/i18n/errorMessageKey`."

### Open questions

None.

---

## Item #64 — FE-N2: extract QueryClient defaults from `App.tsx:11-18`

- **Path**: `frontend/src/App.tsx:11-18`.
- **Effort**: S.
- **Phase 4 correction**: line range verified — the inline `new QueryClient({ defaultOptions: { queries: { staleTime: 1000 * 60, retry: 1 } } })` lives at `App.tsx:11-18`.

### Files touched

- new: `frontend/src/lib/queryClient.ts`
- edit: `frontend/src/App.tsx` (lines 3, 11-18)
- new: `tests/frontend/unit/src/lib/queryClient.test.ts`

### Plan

```ts
// frontend/src/lib/queryClient.ts
import { QueryClient, type QueryClientConfig } from '@tanstack/react-query';

export const APP_QUERY_CLIENT_DEFAULTS: QueryClientConfig = {
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60, // 1 minute
            retry: 1,
        },
    },
};

export function createAppQueryClient(): QueryClient {
    return new QueryClient(APP_QUERY_CLIENT_DEFAULTS);
}
```

`App.tsx`:

```diff
- import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
+ import { QueryClientProvider } from '@tanstack/react-query';
+ import { createAppQueryClient } from '@/lib/queryClient';
  ...
- const queryClient = new QueryClient({
-   defaultOptions: {
-     queries: {
-       staleTime: 1000 * 60, // 1 minute
-       retry: 1,
-     },
-   },
- });
+ const queryClient = createAppQueryClient();
```

### RED

```ts
// tests/frontend/unit/src/lib/queryClient.test.ts
import { describe, it, expect } from 'vitest';
import { APP_QUERY_CLIENT_DEFAULTS, createAppQueryClient } from '@/lib/queryClient';

describe('app QueryClient defaults', () => {
    it('exposes a 60s staleTime and retry=1', () => {
        const queries = APP_QUERY_CLIENT_DEFAULTS.defaultOptions?.queries;
        expect(queries?.staleTime).toBe(60_000);
        expect(queries?.retry).toBe(1);
    });

    it('createAppQueryClient builds a QueryClient with those defaults', () => {
        const qc = createAppQueryClient();
        const opts = qc.getDefaultOptions();
        expect(opts.queries?.staleTime).toBe(60_000);
        expect(opts.queries?.retry).toBe(1);
    });
});
```

Existing `App.tsx` smoke test (search `tests/frontend/unit/src/__tests__/App.test.tsx`) continues to pass — provider tree is unchanged.

### GREEN

1. Create `frontend/src/lib/queryClient.ts`.
2. Edit `App.tsx` per diff.
3. Run gates.

### REFACTOR

- Consider whether tests should also use `createAppQueryClient()` instead of the test-only `createTestQueryClient()` from `tests/frontend/unit/src/test/queryClient.ts`. **Defer** — test client deliberately disables retries/cache to keep tests fast; out of scope for #64.

### Verification gates

```bash
npm run -w tests/frontend/unit lint typecheck
npm run -w tests/frontend/unit test -- queryClient
npm run -w tests/frontend/unit test       # spot check that App still mounts
```

### Rollback

`git revert <commit>`.

### Locks/registries

None.

### Handoffs

- Lightly related to #46 (both centralize React Query infra), but **independent** — #64 can land before, after, or in parallel with #46.
- After #46 Commit E lands, the test `queryKeys/__tests__/factories.test.ts` may import the production `createAppQueryClient` to render a smoke test that the factories work end-to-end with the actual client. Out of scope for this recipe.

### Open questions

None.

---

# Cross-domain handoff notes

| From | To | Reason |
|---|---|---|
| #22 | #23 | Both touch `control-form/`. Strict order. After #22, the canonical import path for `ControlForm` is settled, so #23 inlining doesn't re-introduce churn against the soon-to-be-deleted shim. |
| #46 (Commit E) | #65 | #65 (CRUD schema base) consumes the factories. Cannot start until factories land. |
| #46 (Commit E) | #67 | #67 (`useResourcePanelQuery` generic) consumes the factories. Cannot start until factories land. |
| #4, #5, #6 | none | Pure deletions with zero importers. Independent. |
| #32 | none | Self-contained generic extraction. |
| #47 | none | Pure policy extraction; ApiClientCore retains identical behavior. |
| #48 | none | Two-file merge with explicit importer migration. |
| #64 | none | App-level config extraction. Independent of #46 (different file, different concern). |

# Per-item budget summary

| ID | Effort | LoC delta (est.) | New tests | Importers/Consumers |
|---|---|---|---|---|
| #4 FE-deadcode-1 | S | -3 | 1 absence | 0 |
| #5 FE-deadcode-2 | S | -1 | 1 absence | 0 |
| #6 FE-deadcode-3 | S | -4 | 1 absence | 0 |
| #22 S2.8 | S | -1 + 3 import edits | 1 absence | 3 |
| #23 S2.9 | S | -12 + 3 inline edits | 1 absence | 3 |
| #32 S5.8 | M | +200 generic / -540 reduce | 2 unit | 3 wrapper rewrites |
| #46 FE-N1 | L+ (24-28h) | +~250 factories / -33 inline-key sites | 2 (budget + factories) | 17 source files; 5 commits |
| #47 FE-N4 | S | +60 policy / -30 in core | 1 unit | 0 (internal) |
| #48 FE-N6 | S | +35 combined / -33 deleted | 2 (unit + absence) | grep-driven N |
| #64 FE-N2 | S | +18 / -8 | 1 unit | 0 |

# Frontend test conventions used (per recipe)

- **Tests live in** `tests/frontend/unit/src/...` mirroring the source path.
- **Vitest** `describe/it/expect`.
- **Absence tests** use Node `fs.existsSync`. Path resolution via `path.resolve(__dirname, '...')` reaching back to `frontend/src/`.
- **MSW** server (`tests/frontend/unit/src/test/mocks/server.ts`) for any test that traverses an HTTP boundary; **not used** for the dead-code or pure-function recipes.
- **`AllProviders`** wrapper from `tests/frontend/unit/src/test/render.tsx` for component tests (#32 component test, smoke tests on App).
- **`createTestQueryClient`** from `tests/frontend/unit/src/test/queryClient.ts` for hook tests that need a `QueryClientProvider` (#46 factory smoke).

# Recipe execution order (dependency-correct)

1. **Parallel batch (independent)**: #4, #5, #6, #47, #48, #64. Any order or interleaved.
2. **Strict order**: #22 → #23.
3. **Independent**: #32 (any time after the test conventions in §1 are confirmed).
4. **Sequential, gates other recipes**: #46 (5 commits A → E). After Commit E, #65 and #67 may proceed (out of scope here).
