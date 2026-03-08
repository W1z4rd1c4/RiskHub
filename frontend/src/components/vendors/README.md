# frontend/src/components/vendors

## Purpose

UI components for `vendors` area.

## Contents

- `vendorAssessmentQuestions.ts`
- `VendorAssessmentsTab.tsx`
- `VendorContractControlsTab.tsx`
- `VendorDependenciesTab.tsx`
- `VendorDependencyGraph.tsx`
- `VendorIncidentsTab.tsx`
- `VendorLinkedControlsTab.tsx`
- `VendorLinkedRisksTab.tsx`
- `VendorRemediationTab.tsx`
- `VendorResilienceTab.tsx`
- `VendorRiskFactorsTab.tsx`
- `VendorScheduleTab.tsx`
- `VendorSignalsTab.tsx`
- `VendorSLAModal.tsx`
- `VendorSLATab.tsx`
- `vendorRoute.css`
- `vendorRouteUi.tsx`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

Vendor overview now embeds `VendorRiskFactorsTab`, `VendorLinkedRisksTab`, and
`VendorLinkedControlsTab` directly on the main page. These components still own
their respective data loading and mutations even when rendered on the merged
overview surface.

Vendor link management intentionally hides effectiveness badges in existing-link
lists because vendor-risk and vendor-control links do not carry effectiveness
metadata.

`vendorRoute.css` and `vendorRouteUi.tsx` are the vendor-route-family surface
system. They provide the shared glass-stack primitives used by detail tabs,
the new/edit form, and the SLA portal modal without changing vendor business
logic.

Portal surfaces such as `VendorSLAModal.tsx` must opt into the `vendor-route`
scope explicitly so the same theme variables apply outside the normal route
DOM subtree.
