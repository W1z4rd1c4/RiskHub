# frontend/src/pages/vendors

## Purpose

Page-local modules for vendor routes, covering both
`/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/pages/VendorDetailPage.tsx`
and `/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/pages/VendorsPage.tsx`.

## Contents

- `VendorDetailHeader.tsx`
- `VendorFormView.tsx`
- `VendorOverviewTab.tsx`
- `VendorSectionStack.tsx`
- `VendorTabPanel.tsx`
- `VendorTabs.tsx`
- `VendorsTableSection.tsx`
- `useVendorDetailState.ts`
- `vendorDetailPresentation.ts`
- `vendorsPagePresentation.ts`

## Notes

Keep route orchestration in the page entrypoints and move local rendering,
grouping helpers, and tab metadata into this folder.

Vendor detail now uses a canonical 5-tab IA:

- `overview`
- `assessments`
- `assurance`
- `operations`
- `ecosystem`

Legacy vendor detail deep links are still accepted and canonicalized into
`tab + section` pairs so older URLs, alerts, and dashboard links continue to
land on the correct merged surface.

`VendorOverviewTab.tsx` owns the new overview surface: KPI strip, summary
cards, timestamps, and the embedded `Risk Factors` / `Linked Risks` /
`Linked Controls` sections.

Vendor detail also owns lifecycle parity at the route shell level: active
vendors can be archived from the hero, while inactive vendors expose restore
in the same action cluster.

The individual vendor route family (`view`, `edit`, `new`) now shares a
vendor-local glass-stack design layer. Shell concerns stay here, while shared
surface primitives live in
`/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/components/vendors/vendorRouteUi.tsx`
and
`/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/components/vendors/vendorRoute.css`.

Create and edit flows are intentionally aligned with detail-page structure:

- consistent back/header/action framing
- sectioned form layout
- theme-safe presentation in `light`, `dark`, and `riskhub`
