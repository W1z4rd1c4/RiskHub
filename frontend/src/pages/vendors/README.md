# frontend/src/pages/vendors

## Purpose

Page-local modules for vendor routes, covering both
`frontend/src/pages/VendorDetailPage.tsx`
and `frontend/src/pages/VendorsPage.tsx`.

## Contents

- `VendorDetailHeader.tsx`
- `VendorFormView.tsx`
- `VendorOverviewTab.tsx`
- `VendorSectionStack.tsx`
- `VendorSummaryCards.tsx`
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
