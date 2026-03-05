# frontend/src/pages/vendors

## Purpose

Page-local modules for `frontend/src/pages/VendorDetailPage.tsx`.

## Contents

- `VendorDetailHeader.tsx`
- `VendorFormView.tsx`
- `VendorSummaryCards.tsx`
- `VendorTabPanel.tsx`
- `VendorTabs.tsx`
- `useVendorDetailState.ts`
- `vendorDetailPresentation.ts`

## Notes

Keep route orchestration in `VendorDetailPage.tsx` and move tab metadata, local
state, and leaf rendering into this folder.
