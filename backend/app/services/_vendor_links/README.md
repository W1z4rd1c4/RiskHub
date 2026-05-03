# backend/app/services/_vendor_links

## Purpose

Shared vendor link workflow across risk, control, and KRI target types.

## Contents

- `workflow.py` - target adapters plus list, link, and unlink operations.

## Notes

Keep public vendor link endpoints stable. Link visibility, active-vendor validation, duplicate prevention, and archive metadata should flow through this package.
