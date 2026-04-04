# frontend/src/pages/vendors

## Purpose

Page-local modules for vendor routes, covering both
`frontend/src/pages/VendorDetailPage.tsx`
and `frontend/src/pages/VendorsPage.tsx`.

## Contents

- `VendorDetailHeader.tsx`
- `VendorFormView.tsx`
- `VendorOverviewTab.tsx`
- `VendorsTableSection.tsx`
- `useVendorDetailState.ts`
- `vendorDetailPresentation.ts`
- `vendorsPagePresentation.ts`

## Notes

Keep route orchestration in the page entrypoints and move local rendering,
grouping helpers, and vendor-detail presentation logic into this folder.

Vendor detail now uses a single canonical core view at `/vendors/:id`.
Legacy vendor detail URLs with old tab or section query params are normalized
back to the base vendor detail URL.

`VendorOverviewTab.tsx` owns the core vendor surface. It now mirrors the
individual risk page interaction language:

- top summary surface for risk score, status, exposure, and vendor flags
- 3-card classification / ownership / connections grid
- embedded `Linked Risks` section with split actions (`Link Existing`, `Add Risk`)
- embedded `Linked Controls` section with split actions (`Link Existing`, `Add Control`)
- embedded `Linked KRIs` section with split actions (`Link Existing`, `Add KRI`)
- archived linked-item groups and full-width `Manage Existing Links` affordances
- footer timestamps aligned with the risk detail page layout

`VendorsPage.tsx` and `vendorsPagePresentation.ts` also support grouped
`By Flag` review. Vendors are multi-member records in that mode:

- `DORA relevant`
- `Supports core function`
- `Significant vendor`
- `Insignificant vendors` when none of those flags are set

Vendor detail also owns lifecycle parity at the route shell level: active
vendors can be archived from the hero, while inactive vendors expose restore
in the same action cluster.

The individual vendor route family (`view`, `edit`, `new`) now shares a
vendor-local glass-stack design layer. Shell concerns stay here, while shared
surface primitives live in
`frontend/src/components/vendors/vendorRouteUi.tsx`
and
`frontend/src/components/vendors/vendorRoute.css`.

Create and edit flows are intentionally aligned with detail-page structure:

- consistent back/header/action framing
- sectioned form layout
- theme-safe presentation in `light`, `dark`, and `riskhub`

Routed create-from-vendor flow is shared with risk/control forms via query params:

- `/risks/new?vendor_id=:id&return_to=/vendors/:id`
- `/controls/new?vendor_id=:id&return_to=/vendors/:id`
- `/kris/new?vendor_id=:id&return_to=/vendors/:id`

After successful create, the originating form returns to vendor detail with the
new entity already linked to the vendor and a flash banner. For KRI create,
vendor assignment and optional parent vendor-risk linking are transactional; on
failure the form stays open and vendor detail does not receive a partial-success
warning state.
