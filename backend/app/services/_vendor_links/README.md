# backend/app/services/_vendor_links

## Purpose

Shared vendor link workflow across risk, control, and KRI target types.

## Contents

- `workflow.py` - target adapters plus list, link, and unlink operations.
- `kri_bridge.py` - KRI vendor assignment reconciliation through the canonical per-row vendor link workflow.

## Notes

The declared `apply_vendor_target_relationship_no_commit` adapter replays an
approved Vendor relationship through the existing state owner while retaining
the entry point's transaction boundary. `kri_bridge.py` keeps its existing raw
reconciliation adapters. The canonical version rules live in the
[governed application contract](../_governed_mutations/README.md#operational-application-and-versions).

Keep public vendor link endpoints stable. Link visibility, active-vendor validation, duplicate prevention, and archive metadata should flow through this package. Vendor link cleanup is enforced at the database layer with `ON DELETE CASCADE` on `vendor_id` and the target FK.
