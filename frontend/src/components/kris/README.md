# frontend/src/components/kris

## Purpose

UI components for `kris` area.

## Contents

- `KRIDetailHistoryTab.tsx`
- `KRIDetailOverviewTab.tsx`

## Notes

`KRIDetailOverviewTab.tsx` consumes backend-derived KRI monitoring fields such
as `monitoring_status`, `required_due_date`, and `days_overdue` for consistent
detail rendering.

KRI list/detail rendering now also assumes vendor linkage can exist alongside
the parent risk relationship. Vendor-linked KRIs must use the same monitoring
field contract as the `/kris` register and vendor detail linked-KRI section.

Keep this README updated when responsibilities or structure in this folder change.
