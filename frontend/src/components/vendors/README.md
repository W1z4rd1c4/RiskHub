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
- `vendorRoute.css`
- `vendorRouteUi.tsx`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

Vendor detail now uses a single core page that embeds `VendorLinkedRisksTab`,
`VendorLinkedControlsTab`, and `VendorLinkedKRIsTab` directly on the main view. Those sections are
deliberately aligned with the individual risk page:

- split action bars for `Link Existing` plus `Add Risk` / `Add Control`
- card-grid rendering for active linked entities
- subdued archived groups rendered separately
- full-width dashed `Manage Existing Links` affordance

`VendorLinkedRiskCard.tsx` is the vendor-side risk summary card used by the
linked-risks grid. `VendorLinkedControlCard.tsx` mirrors the control gauge card
visual treatment used on the risk detail page so vendor-linked controls do not
degrade into a separate list-only UI.

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

`vendorRoute.css` and `vendorRouteUi.tsx` are the vendor-route-family surface
system. They provide the shared glass-stack primitives used by the core detail
view and the new/edit form without changing vendor business logic.
