# backend/app/services/_vendor_links

## Purpose

Shared vendor link workflow across risk, control, and KRI target types.

## Contents

- `workflow.py` - target adapters plus list, link, and unlink operations.
- `kri_bridge.py` - KRI vendor assignment reconciliation through the canonical per-row vendor link workflow.

## Notes

Keep public vendor link endpoints stable. Link visibility, active-vendor validation, duplicate prevention, and archive metadata should flow through this package. Vendor link cleanup is enforced at the database layer with `ON DELETE CASCADE` on `vendor_id` and the target FK.
