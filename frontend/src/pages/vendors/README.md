# frontend/src/pages/vendors

## Purpose

Page-local modules for vendor routes, covering both
`frontend/src/pages/VendorDetailPage.tsx`
and `frontend/src/pages/VendorsPage.tsx`.

## Contents

- `VendorContractsSection.tsx`
- `VendorDerivedSection.tsx`
- `VendorDetailHeader.tsx`
- `VendorDetailStates.tsx`
- `VendorFormView.tsx`
- `VendorOverviewTab.tsx`
- `VendorRegisterFilterBar.tsx`
- `VendorRegisterLinksSection.tsx`
- `VendorSubOutsourcingChainTable.tsx`
- `VendorSubOutsourcingSection.tsx`
- `useVendorContextOutcome.ts`
- `useVendorDetailPageEffects.ts`
- `useVendorDetailState.ts`
- `useVendorsPageState.ts`
- `vendorColumns.tsx`
- `vendorContractsPresentation.tsx`
- `vendorDetailPresentation.ts`
- `vendorRegisterConfig.ts`
- `vendorRegisterLinksPresentation.ts`
- `vendorSubOutsourcingPresentation.tsx`
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

The individual vendor route family (`view`, `edit`, `new`) is built on the
shared primitives (audit 2026-09-30 D13, SM-09; the vendor-route design system
and its exemption are retired): `PageContainer` (1520px detail, 960px forms,
D11), `PageHeader` / `EntityDetailHeader`, `Card` + `CardHeader` sections
(`DetailSection` / `DetailField` for read-only fields), `Badge` /
`SeverityBadge`, `InlineMessage`, `Field` with the `components/ui` controls,
`RegisterFilterCard` in the register filter bar, `RowActionButton` row
actions, `LinkedItemList` link rows, the shared `PendingChangePanel`
(`namespace="vendors"`, `testIdPrefix="vendor"`) and `OwnershipGovernanceAlert`.

Workbook closed-list codes (`AnoNe`, `TypUjednani`, `TypOsoby`,
`RoleDodavatele`, `Reliance`, ...) are stored and sent verbatim; only their
display labels are translated through `lib/closedListLabels.ts`
(`common:values.closed_lists.*`, GAP-C-09 / PM-4).

Create and edit flows are intentionally aligned with detail-page structure:

- consistent back/header/action framing
- sectioned form layout
- theme-safe presentation in `light`, `dark`, and `riskhub`

Routed create-from-vendor flow is shared with risk/control forms via query params:

- `/risks/new?vendor_id=:id&return_to=/vendors/:id`
- `/controls/new?vendor_id=:id&return_to=/vendors/:id`
- `/kris/new?vendor_id=:id&return_to=/vendors/:id`

After successful create, the originating form returns to vendor detail with the
new entity already linked to the vendor and an outcome toast
(`useVendorContextOutcome.ts`, D9 — the former `vendorFlash` router state is
gone); an approval-routed link returns with the pending notice (D12). For KRI create,
vendor assignment and optional parent vendor-risk linking are transactional; on
failure the form stays open and vendor detail does not receive a partial-success
warning state.
