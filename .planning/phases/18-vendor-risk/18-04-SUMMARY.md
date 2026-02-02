# 18-04 — Reassessment scheduling + reminders — Summary

## What Shipped

- Added vendor scheduling fields to support reassessment cadence and reminders.
- Added a daily scheduler job to generate due-soon / overdue notifications (idempotent).
- Added an out-of-cycle trigger endpoint to force immediate reassessment (auditable).

## Cadence Rules (Deterministic)

- If `vendor.supports_important_core_insurance_function = true` → cadence `12` months
- Else cadence `36` months

Initialization:

- On vendor creation: `next_reassessment_due_at = now + cadence`

After final assessment decision:

- `next_reassessment_due_at = decision_at + cadence`

## Data Model (Vendor)

- `reassessment_cadence_months`
- `next_reassessment_due_at`
- `last_assessed_at`
- `last_decided_at`
- `last_reassessment_reminded_at`
- `reassessment_triggered_reason`, `reassessment_triggered_at`

## API

- `POST /vendors/{id}/trigger-reassessment` (outsourcing owner OR `vendors:write`)

## Notifications

- `vendor_reassessment_due_soon`
- `vendor_reassessment_overdue`

All reassessment notifications store:

- `resource_type = "vendor"`
- `resource_id = <vendor_id>`

