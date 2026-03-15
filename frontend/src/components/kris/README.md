# frontend/src/components/kris

## Purpose

UI components for `kris` area.

## Contents

- `KRIDetailHistoryTab.tsx`
- `KRIDetailOverviewTab.tsx`
- `KRIModal.tsx`
- `KRIVendorSelector.tsx`

## Notes

`KRIDetailOverviewTab.tsx` consumes backend-derived KRI monitoring fields such
as `monitoring_status`, `required_due_date`, and `days_overdue` for consistent
detail rendering.

KRI list/detail rendering now also assumes vendor linkage can exist alongside
the parent risk relationship. Vendor-linked KRIs must use the same monitoring
field contract as the `/kris` register and vendor detail linked-KRI section.

`KRIVendorSelector.tsx` is the shared vendor-assignment field used by the routed
KRI create form and the KRI edit modal. It keeps KRI vendor assignment aligned
between generic KRI create/edit and vendor-context create-from-vendor flow.

Vendor assignment is now server-backed and transactional:

- vendor search is remote and preserves selected vendors outside the current result set
- routed KRI create and modal KRI edit both submit `linked_vendor_ids` directly in the KRI payload
- vendor-context create can request parent vendor-risk linking in the same save
- the frontend no longer treats post-save vendor-link reconciliation as authoritative

Keep this README updated when responsibilities or structure in this folder change.
