# backend/app/services/_vendor_links

## Purpose

Shared vendor link workflow across risk, control, and KRI target types.

## Contents

- `workflow.py` - target adapters plus list, link, and unlink operations.
- `kri_assignment.py` - KRI vendor assignment reconciliation through the canonical per-row vendor link workflow.

## Notes

Keep public vendor link endpoints stable. Link visibility, active-vendor validation, duplicate prevention, and archive metadata should flow through this package.
