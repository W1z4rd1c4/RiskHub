# tests/frontend/unit/src/services/fixtures/vendorLinkApprovals

## Purpose

Six approvals list/detail payload fixtures (`vendor-link-{risk,control,kri}-{add,remove}.json`)
that mirror the payload shapes asserted at the backend HTTP seam by
`tests/backend/pytest/test_governed_vendor_link_approvals_seam.py`.

## Contents

- `vendor-link-control-add.json`
- `vendor-link-control-remove.json`
- `vendor-link-kri-add.json`
- `vendor-link-kri-remove.json`
- `vendor-link-risk-add.json`
- `vendor-link-risk-remove.json`

## Notes

Consumed by `protectedVendorLinkSchemas.test.ts` and
`ApprovalList.vendorLinkGoverned.test.tsx`. Keep this README updated when
responsibilities or structure in this folder change.
