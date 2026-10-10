# Frontend Dialog Interaction Inventory (FR-P2c-1)

Back to folder index: [`docs/dora-ict-register/README.md`](./README.md) ·
Back to tree: [`docs/DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

## Purpose and source of truth

The dialog inventory is machine-readable. Its canonical source is
`tests/frontend/contracts/dialog-surfaces.json`; this document explains that
contract but does not duplicate its rows. This avoids a hand-maintained count
drifting away from the application.

The current validated tree contains:

| Level | Meaning | Current validated count |
|---|---|---:|
| `implementation_surface` | A component that implements `DialogShell`, including inline owners and the transparent `RiskHubModalFrame` wrapper | 27 |
| `application_render_site` | A concrete production consumer of an implementation surface | 56 |
| `non_dialog_surface` | An overlay-like surface with a different interaction contract | 5 |
| executable unit contract case | A unique implementation or consumer-specific variant, plus the production loading overlay | 30 |

The 56 render sites include all shared-dialog call sites and the three concrete
`RiskHubModalFrame` consumers. The generic frame is not counted as a substitute
for those consumers. This current decomposition includes `DestinationLauncher`
as an implementation surface and `Sidebar` as its component-owned render site.

## Classification contract

- **Dialog / alert dialog:** uses `DialogShell`; exposes `role="dialog"` or
  `role="alertdialog"`, `aria-modal="true"`, an accessible name, initial focus,
  Tab and Shift+Tab containment, Escape close, and opener-focus restoration.
- **Loading / status overlay:** exposes status and busy semantics without a
  dialog role or focus transfer. `ControlRiskLoadingOverlay`, used by
  `ControlDetailPage`, is the production component verified for this class.
- **Popover / listbox / menu:** follows its own ARIA pattern and does not migrate
  to `DialogShell`. The Radix `ThemedSelect` listbox is tested as a portalled
  active interaction layer inside a real open dialog.

## Drift prevention

Run from `frontend/`:

```sh
npm run lint:dialog-inventory
```

`frontend/scripts/a11y/validate-dialog-inventory.mjs` parses application TSX and
fails if either of these sets diverges from the manifest:

1. every component that directly owns a `DialogShell` implementation;
2. every concrete render site of a registered semantic component.

It also requires unique IDs, registered owners, a browser verification case for
every application render site, and an exact match between the manifest's unit
case IDs and `dialogInteractionMatrix.test.tsx`. The successful command reports
the four counts above plus the deprecated class-prop ratchet total (below).

DialogShell v2 (audit 2026-09-30 §4.11) adds three checks:

- **Primitive location.** `primitive.file` (`frontend/src/components/ui/dialog.tsx`)
  is the only definition of `DialogShell`. The legacy
  `frontend/src/components/DialogShell.tsx` re-export was deleted once every
  owner imported `@/components/ui/dialog` (W6); an optional
  `primitive.legacyShim`, if declared again, may only re-export the primitive.
- **Delegates.** An implementation with `kind: "delegate"` renders another
  semantic owner (`delegatesTo`) instead of `DialogShell`. Its own render sites
  stay tracked; its internal render of the target is not a separate site. (The
  former `ArchiveConfirmDialog` delegate was deleted in Phase 4, roadmap 4.3:
  archive call sites render `ConfirmDialog intent="archive"` directly.)
- **Deprecated class props removed.** `containerClassName`, `backdropClassName`
  and `contentClassName` were deleted from the `DialogShell` API in Phase 4
  (roadmap 4.3), so TypeScript rejects them; the former `legacyClassProps`
  manifest ratchet is retired and the validator fails if an entry still
  declares it.

## Verification layers

### Unit interaction matrix

`tests/frontend/unit/src/components/dialogInteractionMatrix.test.tsx` executes
all 30 manifest case IDs with no skips. It mounts production components, waits
for deterministic loaded-state sentinels, uses exact MSW handlers for
network-backed surfaces, and treats unexpected requests, uncaught errors,
React `act` warnings, and relevant console warnings/errors as failures. Each
dialog case runs axe with the pinned WCAG tags and no disabled rules.

The non-dialog loading case mounts `ControlRiskLoadingOverlay` itself. There is
no copied test-only overlay markup.

### Browser render-site matrix

`tests/frontend/e2e/dialog-render-sites.spec.ts` reads the same manifest and
creates one Playwright test for each of the 56 `application_render_site` rows,
plus a registry-integrity assertion that proves exact driver/manifest equality.
The 25 component-owned render sites open through owner harnesses that mount the
production source parents; the 31 page-owned sites drive real authenticated
application routes. No driver mounts a leaf dialog directly. Every render-site
case verifies semantic role/name, initial focus, forward and reverse focus
containment, Escape close, focus restoration, and zero unexpected network or
console output. Live-route monitoring starts after authentication but before
owner navigation, retains owner-load output through close/restoration, and
fails request failures or HTTP error responses except for exact documented
`net::ERR_ABORTED` handoffs: the login shell summary, dashboard overview route
transitions, the mocked governance overview refresh, and the admin
health/jobs/outbox queries cancelled when switching sections. Network-backed
owners wait for deterministic ready sentinels.

`tests/frontend/e2e/dora-ux-stateful-a11y.spec.ts` adds representative
three-theme state scans and the real dialog + portalled `ThemedSelect` contract:
the first Escape closes only the listbox; the second closes the dialog and
restores its opener. Axe runs with no exclusions.

## Change rule

Add, remove, or move a dialog only by updating production code, the canonical
JSON descriptor, and the required unit/browser driver in the same change. Do
not update counts in prose independently; the validator output is authoritative.
