# frontend/src/components/vendors

## Purpose

UI components for `vendors` area.

## Contents

- `VendorLinkedControlCard.tsx`
- `VendorLinkedKRIsTab.tsx`
- `VendorLinkedRiskCard.tsx`
- `VendorLinkedControlsTab.tsx`
- `VendorLinkedRisksTab.tsx`
- `VendorLinkedEntitiesTab.tsx`
- `useVendorLinkedEntities.ts`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

Vendor detail now uses a single core page that embeds `VendorLinkedRisksTab`,
`VendorLinkedControlsTab`, and `VendorLinkedKRIsTab` directly on the main view. Those sections are
deliberately aligned with the individual risk page:

- a `Card` section with a `CardHeader` (`h2` title, decorative Lucide `icon`)
  and `Button` actions for `Link Existing` plus `Add Risk` / `Add Control`
- card-grid rendering for active linked entities
- archived groups rendered separately under their own heading, each card with
  an Archived badge instead of whole-group opacity (audit 2026-09-30 GAP-D-14)
- full-width dashed `Manage Existing Links` button

`VendorLinkedRiskCard.tsx` is the vendor-side risk summary card used by the
linked-risks grid (gross/net scores as D1 `SeverityBadge`s).
`VendorLinkedControlCard.tsx` mirrors the control gauge card visual treatment
used on the risk detail page so vendor-linked controls do not degrade into a
separate list-only UI. Both are `Card as="article" interactive` whose title
button stretches over the card, so each card is one named, keyboard-reachable
control.

`VendorLinkedKRIsTab.tsx` provides the vendor-side KRI grid and routed create
entrypoint. It consumes the
same backend-derived monitoring fields used by the KRI register/detail views so
vendor-linked KRIs stay visually and semantically consistent with KRI pages.
Its action bar now mirrors linked controls: `Link Existing` + `Add KRI`.

`Add KRI` no longer relies on a best-effort follow-up vendor-link step. The
vendor-context KRI form persists vendor assignment in the same save transaction,
and failed vendor/risk-link validation keeps the form open instead of returning
to vendor detail with a partial-success warning.

Vendor link management intentionally hides effectiveness badges in existing-link
lists because vendor-risk and vendor-control links do not carry effectiveness
metadata.

`VendorLinkedEntitiesTab.tsx` and `useVendorLinkedEntities.ts` provide the
shared vendor linked-entity shell. Concrete tabs supply a
`VendorLinkedEntitiesAdapter<T>` with `fetch`, `link`, `unlink`, `isArchived`,
and `toExistingLink` functions while keeping their domain-specific cards and
dialog modes.

The former vendor-route design system (`vendorRoute.css`, `vendorRouteUi.tsx`:
`VendorSurface`, `VendorSectionHeader`, `VendorBadge`, `.vendor-*` classes) was
folded into the shared primitives and deleted (audit 2026-09-30 D13, SM-09):
use `Card` / `CardHeader`, `Badge`, `InlineMessage`, `Field` and
`PageContainer` from `components/ui` and `components/layout` instead.
