# frontend/src/components/vendors

## Purpose

UI components for `vendors` area.

## Contents

- `VendorLinkedControlCard.tsx`
- `VendorLinkedRiskCard.tsx`
- `VendorLinkedControlsTab.tsx`
- `VendorLinkedRisksTab.tsx`
- `vendorRoute.css`
- `vendorRouteUi.tsx`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

Vendor detail now uses a single core page that embeds `VendorLinkedRisksTab`
and `VendorLinkedControlsTab` directly on the main view. Those sections are
deliberately aligned with the individual risk page:

- split action bars for `Link Existing` plus `Add Risk` / `Add Control`
- card-grid rendering for active linked entities
- subdued archived groups rendered separately
- full-width dashed `Manage Existing Links` affordance

`VendorLinkedRiskCard.tsx` is the vendor-side risk summary card used by the
linked-risks grid. `VendorLinkedControlCard.tsx` mirrors the control gauge card
visual treatment used on the risk detail page so vendor-linked controls do not
degrade into a separate list-only UI.

Vendor link management intentionally hides effectiveness badges in existing-link
lists because vendor-risk and vendor-control links do not carry effectiveness
metadata.

`vendorRoute.css` and `vendorRouteUi.tsx` are the vendor-route-family surface
system. They provide the shared glass-stack primitives used by the core detail
view and the new/edit form without changing vendor business logic.
