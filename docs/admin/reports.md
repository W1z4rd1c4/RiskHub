---
title: Reports and Evidence Exports (Admin Runbook)
version: "2.0"
last_updated: "2026-03-05"
audience: admin
source_of_truth: "frontend/src/pages/AdminConsolePage.tsx + backend/app/api/v1/endpoints/admin/*"
summary: "Admin runbook for producing audit-ready evidence exports: what to export, how to scope it, how to preserve provenance, and how to hand off safely."
tags:
  - exports
  - audit
  - troubleshooting
  - workflow
  - settings
---

# Reports and Evidence Exports (Admin Runbook)

## Overview

“Reporting” for platform admins is not business dashboards. It is **evidence production**: creating traceable exports that answer a specific question during an incident, audit, or support investigation.

Admins do not use business `/activity-log` or `/governance` as evidence surfaces. Those routes are business-facing and intentionally blocked for `admin`; the supported evidence path is `/admin`.

Admin evidence must be:

- scoped (minimum required data)
- reproducible (clear filters/time window)
- auditable (provenance preserved)
- safe (no accidental leakage of secrets or unnecessary PII)

RiskHub provides export surfaces primarily through the Admin Console audit feed (CSV/JSON). Application logs are also useful evidence but may require careful handling to avoid leaking sensitive payloads.

## When To Use This

Use this runbook when you need to:

- reconstruct an incident timeline (“what happened and when?”)
- prove an access change (“what changed for user X?”)
- support workflow/approvals anomalies with evidence (“request created but never resolved”)
- hand off a reproducible defect report to engineering
- provide audit artifacts with provenance (exports + explanatory note)

Do not use this runbook as a replacement for business exports (risks/controls/vendors). If a business owner needs business data, coordinate with them and use the user-facing export flows.

## Preconditions and Safety

Before exporting:

1. Define the exact question the export must answer.
   - Good: “Show all audit events for user 123 between 10:00 and 11:00 UTC.”
   - Bad: “Export everything just in case.”
2. Identify the minimum source:
   - audit logs for “who changed what”
   - application logs for “why did this request fail”
   - sessions view for “who is currently logged in / revoke actions”
3. Decide on the minimum time window.
4. Confirm where you are allowed to store/share evidence (approved channel).

Safety rules:

- Assume exports may contain sensitive details. Do not paste raw logs into uncontrolled chat tools.
- Preserve the original export file. If you transform it, keep the raw export unchanged and add a manifest.
- Prefer JSON when you need structured detail; prefer CSV when you need a quick review or spreadsheet handling.

## Step-by-Step Procedure

### 1) Choose evidence type and collection window

Start with a short “evidence header” you will attach to the ticket:

- incident/ticket id
- environment
- question being answered
- time window (include timezone)
- source surface (`/admin` → Audit Logs, etc.)

Then choose:

- **Audit logs** when you need a trace of actions (who/what/when).
- **Application logs** when you need failure context (errors, validation, stack traces).
- **Sessions** when you need to prove session state or revocation actions.

### 2) Collect audit log evidence (CSV/JSON)

1. Open `/admin` → Audit Logs.
2. Set the line limit (start small: 50–200).
3. Use event filtering if available to narrow the dataset.
4. Export:
   - CSV for quick review
   - JSON for structured investigation and engineering handoff

Immediately after export:

- verify the file name timestamp matches the moment you exported
- open the file and spot-check:
  - timestamps present
  - event field present
  - user_id present (where applicable)
  - request_id present (critical for correlation)

### 3) Collect application log evidence (carefully)

Application logs are valuable, but they can include payload-like details.

Recommended approach:

1. Filter to the smallest time window possible around the failure.
2. Capture only the lines necessary to show:
   - the error class/message
   - the request id (if present)
   - the endpoint/route context
3. If you must include log snippets in a ticket:
   - paste only the relevant lines
   - avoid including secrets or raw tokens
   - note the time window and filter applied

### 4) Assemble the evidence package (provenance)

Your evidence package should include:

- raw export file(s) (CSV/JSON)
- a one-paragraph cover note:
  - “as of” timestamp
  - filters applied (event type, line count)
  - what the export proves (one sentence)

If you combine multiple exports:

- add a manifest table:
  - filename
  - generated_at
  - source surface
  - filter/time window

This is what keeps evidence usable weeks later.

### 5) Hand off safely

When handing off to engineering or business owners:

- do not attach “everything”
- attach the smallest evidence that proves the claim
- include reproduction steps if this is a defect
- include request IDs so engineers can correlate with backend traces

## Verification Checklist

Before you close a reporting/evidence task:

- export files exist and can be opened
- timestamps and filter context are recorded (cover note or manifest)
- request IDs (if relevant) are present and match the incident window
- no unnecessary sensitive information is included
- a reader can understand what the evidence proves without asking you follow-up questions

## Rollback Strategy

Evidence exports cannot be “un-sent”, so rollback is about containment:

- If you exported too broad a dataset:
  - stop distribution immediately
  - delete the file from any shared location (if permitted)
  - re-export with correct scope and replace in the ticket
- If you changed any admin settings while investigating (for example log rotation):
  - revert to prior values recorded before the change
  - record why you changed and why you reverted

If the mistake involves a potential data leak, escalate to security immediately.

## Troubleshooting

### Export succeeded but it’s missing expected records

Checks:

- time window too narrow
- wrong event filter applied
- the action never occurred (user report mismatch)

Actions:

- expand time window slightly (for example ±10 minutes)
- remove filters and re-export a small sample
- corroborate using application logs or additional audit entries

### Export actions fail or files download empty

Checks:

- browser download restrictions
- API failures in admin console

Actions:

- capture the error and timestamp
- retry with fewer lines
- if persistent, escalate as an observability outage (it blocks incident response)

### Evidence contains sensitive information

Actions:

- stop sharing immediately
- move evidence to an approved secure channel
- regenerate a redacted/minimal export if required
- document what was exposed and to whom (for incident response)

## Escalation and Handoff

Escalate to engineering when:

- admin exports fail (audit feed unavailable)
- request IDs cannot be correlated due to missing log context

Escalate to security when:

- evidence contains secrets/PII beyond what is permitted
- exports were distributed incorrectly

Handoff package (minimum):

- what you exported and why (one paragraph)
- filenames + generated_at
- filters/time window
- request IDs and key events

## Related Documentation

- Admin Console operations: [Admin Console](./console.md)
- Approvals incident support: [Approvals Support](./approvals.md)
- Access change evidence: [User and Access Management](./user-management.md)
