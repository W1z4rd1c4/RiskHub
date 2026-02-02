# 18-03 — Due diligence workflow (Vendor Assessments) — Summary

## What Shipped

- Added `VendorAssessment` workflow records with immutable “audit record” semantics after submit.
- Implemented end-to-end lifecycle: `draft → submitted → in_review → committee_recommended → approved|rejected`.
- Added standard vs DORA assessment scope using stable template keys/versions and storing answers as stable JSON keys.

## Templates

- `template_key`: `standard` or `dora`
- `template_version`: `v1`
- `scope` selection: `vendor.dora_relevant = true` → `dora`, else `standard`

## API

- `GET /vendors/{vendor_id}/assessments`
- `POST /vendors/{vendor_id}/assessments` (create draft)
- `GET /vendor-assessments/{id}`
- `PATCH /vendor-assessments/{id}/draft` (draft-only)
- `POST /vendor-assessments/{id}/submit`
- `POST /vendor-assessments/{id}/review`
- `POST /vendor-assessments/{id}/committee-recommend`
- `POST /vendor-assessments/{id}/decide`

## RBAC / Gating

- Draft create/edit/submit: outsourcing owner OR `vendors:write` (requires `vendors:read` for context).
- Review + committee recommendation: `risk_manager` or `compliance` role.
- Final decision: `cro` role.

## Notifications

Notification type keys (stable Phase 18 contract):

- `vendor_assessment_submitted`
- `vendor_assessment_committee_recommended`
- `vendor_assessment_decided`

All vendor assessment notifications store:

- `resource_type = "vendor"`
- `resource_id = <vendor_id>`

