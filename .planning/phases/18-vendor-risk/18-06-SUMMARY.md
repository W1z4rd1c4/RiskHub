# 18-06 — Contract controls + DORA clause tracking — Summary

## What Shipped

- Added per-vendor contract clause/controls checklist with stable keys and evidence references.
- Implemented deterministic applicability rules across ICT / DORA / significance flags.
- Ensured no silent data loss: items remain stored even if they become not applicable; UI shows `n_a` when not applicable.

## Template Sets (Stable)

- `ict_standard`
- `ict_dora_non_significant`
- `ict_dora_significant`

Applicability gates:

- Entire checklist is relevant only when `vendor.vendor_type == "ict"`.
- DORA sets apply when `vendor.dora_relevant == true`.
- Significant vs non-significant selects the DORA subset via `vendor.is_significant_vendor`.

## Status Model

- `met` / `partial` / `missing` / `n_a`

## API

- `GET /vendors/{vendor_id}/contract-controls`
- `PATCH /vendors/{vendor_id}/contract-controls` (bulk update)

## RBAC / Gating

- Read: any user authorized to read the Vendor.
- Write: outsourcing owner OR `vendor_contracts:write`.

