# Summary: 04-04 Single Export Button + Shared Export Modal

**Status:** Complete  
**Executed:** 2026-02-10

## Deliverables

### Shared Export Modal
- Added reusable modal component: `/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/components/reports/ExportDialog.tsx`
- Component API:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `onSubmit: (payload: { format: 'xlsx' | 'pdf' | 'csv'; asOfDate: string }) => Promise<void>`
  - `isSubmitting?: boolean`
  - `title?: string`
  - `dataTestId?: string`
- UX behavior:
  - Glass/backdrop popup styling aligned with existing dialogs.
  - `role="dialog"` + `aria-modal="true"` for accessibility/test stability.
  - Default date is current local date on open.
  - Format options: Excel, PDF, CSV.
  - Submit disabled while export is in progress.

### Unified Frontend Report API Wiring
- Extended `/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/services/reportApi.ts` with:
  - `exportRisks(...)`
  - `exportControls(...)`
  - `exportKRIs(...)`
  - `exportVendors(...)`
- All methods call unified backend endpoints:
  - `/reports/{entity}/export?format=...&as_of_date=...`
- Existing legacy methods were preserved for compatibility.

### Page Integrations (One Export Button Per Page)
- Updated:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/pages/RisksPage.tsx`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/pages/ControlsPage.tsx`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/pages/KRIsPage.tsx`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/pages/VendorsPage.tsx`
- Risks/Controls:
  - Removed split PDF/Excel header buttons.
  - Added one export button that opens `ExportDialog`.
- KRIs/Vendors:
  - Added export button + `ExportDialog` flow.

## Per-Page Filter Mapping Used for Export
- Risks:
  - `status`, `search`, `risk_type`, `is_priority`
- Controls:
  - `status`, `search`
- KRIs:
  - `status` (`all|within|breach|overdue|archived`), `search`
- Vendors:
  - `status`, `search`, `vendor_type`

## Localization
- Added shared export modal keys in:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/i18n/locales/en/common.json`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/i18n/locales/cs/common.json`
- Added `actions.export` labels in EN/CS page namespaces:
  - Risks, Controls, KRIs, Vendors locale files.

## Verification
- `cd /Users/stefanlesnak/Antigravity/Risk App 2/frontend && npx tsc --noEmit`  
  Result: `passed`
- `cd /Users/stefanlesnak/Antigravity/Risk App 2/frontend && npm run test:run -- src/pages/__tests__`  
  Result: `3 files passed, 34 tests passed`

## Visual Verification Notes
- Header action rows now expose exactly one export trigger on Risks/Controls/KRIs/Vendors pages.
- Export modal uses the same motion/backdrop + glass-card language as existing app popups.
- Existing refresh/create buttons and list/filter layouts remain intact.
