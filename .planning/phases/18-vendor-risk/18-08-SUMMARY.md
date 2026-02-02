# 18-08 — Monitoring + incidents + remediation + SLA tracking — Summary

## What Shipped

- Incidents and remediation work as auditable vendor monitoring records:
  - `VendorIncident` (typed, severity, major flag)
  - `VendorRemediationAction` (status, owner, optional incident link)
- Vendor SLA tracking as a KRI-shaped entity with value historization:
  - `VendorSLA` + `VendorSLAValueHistory`
  - breach status calculation, due/overdue logic, notifications
- Automatic escalation:
  - Creating a **major** incident triggers vendor reassessment due “now” (idempotent cooldown) and sends notifications.
- Frontend tabs on vendor detail:
  - Incidents, Remediation, SLA (create/edit SLA + record value)

## API

- Incidents:
  - `GET /vendors/{id}/incidents`, `POST /vendors/{id}/incidents`
  - `PATCH /vendor-incidents/{id}`, `DELETE /vendor-incidents/{id}`
- Remediation:
  - `GET /vendors/{id}/remediation`, `POST /vendors/{id}/remediation`
  - `PATCH /vendor-remediation/{id}`, `DELETE /vendor-remediation/{id}`
- SLA:
  - `GET /vendor-slas`, `POST /vendor-slas`, `GET /vendor-slas/{id}`, `PUT /vendor-slas/{id}`, `DELETE /vendor-slas/{id}`
  - `POST /vendor-slas/{id}/values`, `GET /vendor-slas/{id}/history`

## Scheduler

- Added daily vendor SLA checks alongside existing reassessment reminders.

## Tests

- Backend tests cover incident escalation + SLA notifications/breach behavior.

