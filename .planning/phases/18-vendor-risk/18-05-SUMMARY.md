# 18-05 — Concentration risk + dependency/supply-chain modeling — Summary

## What Shipped

- Added vendor-to-vendor relationships to capture fourth parties (`VendorRelationship`).
- Added vendor services and “supported function” dependencies (`VendorService`, `VendorDependency`).
- Added concentration scoring (0–10) with deterministic flags (replaceability, multi-department reliance, etc.).
- Added a “Dependencies” tab on Vendor detail with table + simple tree visualization.

## API

- `GET /vendors/{id}/dependencies` (relationships, services+dependencies, relationship tree, concentration summary)
- `POST /vendors/{id}/relationships`, `DELETE /vendor-relationships/{id}`
- `POST /vendors/{id}/services`, `PATCH /vendor-services/{id}`, `DELETE /vendor-services/{id}`
- `POST /vendor-services/{id}/dependencies`, `DELETE /vendor-dependencies/{id}`

## Rules

- Self-relationships are rejected (`vendor_id == related_vendor_id` → 400).
- Relationship graph rendering is depth-limited (2) and cycle-safe (no infinite recursion).
- Concentration score is capped to 0–10.

## Tests

- Added backend coverage for self-relationship blocking, cycle-safe tree depth, and concentration flags.

