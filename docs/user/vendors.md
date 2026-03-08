---
title: Managing Vendors
version: "2.3"
last_updated: "2026-03-08"
audience: user
source_of_truth: "frontend/src/pages/VendorsPage.tsx + frontend/src/pages/VendorDetailPage.tsx + frontend/src/pages/vendors/* + vendor assessment workflows"
summary: "Full manual for third-party risk operations: vendor onboarding, ownership, assessments, reassessments, incidents, SLAs, exports, and notifications."
tags:
  - vendors
  - workflow
  - approvals
  - notifications
  - exports
  - troubleshooting
---

# Managing Vendors

**On this page**
- [Overview](#overview)
- [Where To Find It](#where-to-find-it)
- [Roles, Scope, and Visibility](#roles-scope-and-visibility)
- [Data Model and Key Fields](#data-model-and-key-fields)
- [Core Workflows](#core-workflows)
- [Approvals and Notifications Behavior](#approvals-and-notifications-behavior)
- [Filters, Views, and Exports](#filters-views-and-exports)
- [Common Mistakes](#common-mistakes)
- [Troubleshooting](#troubleshooting)
- [Related Documentation](#related-documentation)

## Overview

Vendor management in RiskHub is designed for third-party risk governance. The goal is to answer:

- Which vendors matter, and why?
- Who owns the relationship and the risk?
- What is the current risk posture?
- When is the next reassessment due?
- What incidents, dependencies, and SLAs exist that could change posture?

Primary route: `/vendors`

A vendor record becomes a hub that connects:

- business context (process/subprocess, department)
- relationship ownership
- risk scoring and materiality signals
- assessments and decisions
- ongoing monitoring (signals, SLAs, incidents)

## Where To Find It

- Vendor list: `/vendors` (requires `vendors:read`)
- Vendor detail: click a vendor row
- Create vendor: `/vendors/new` (requires `vendors:write`)

If you do not see **Vendors** in the sidebar:

- you likely lack `vendors:read`

## Roles, Scope, and Visibility

Vendor visibility is usually stricter than risks/controls because vendor data often contains sensitive commercial details.

Access is controlled by:

- permissions (`vendors:read`, `vendors:write`, `vendors:delete`)
- scope and department
- ownership: the outsourcing owner can often edit even without broad write permissions
- linked risk visibility: risk-linked grouping context is only shown if you can also read those risks

Practical rule:

- If you are the outsourcing owner, you may be allowed to maintain the vendor record.
- If you are not, treat vendors as governance objects and avoid “drive-by edits”.
- You can still see a vendor record even when its linked risk context is hidden; in that case risk grouping falls back instead of exposing unreadable risk names.

## Data Model and Key Fields

Vendor records include both identity and governance metadata.

| Field | Meaning | Pitfalls / notes |
|---|---|---|
| Name / legal name | Primary identity | Keep legal name for contracts; keep name for operational use. |
| Registration / country / website | Basic due diligence fields | Missing basics make audits painful. |
| Process / subprocess | Business context | Use consistent vocabulary to enable reporting. |
| Department | Routing/reporting context | Align with where the relationship is managed. |
| Outsourcing owner | Accountable relationship owner | This is the key routing field. |
| Vendor type | ICT / outsourcing / partner / other | Type influences what assessments are expected. |
| Risk score (1–5) | Quick risk posture signal | Score should be explainable; don’t treat as a “feeling”. |
| Supports important function | Governance classification | Don’t change casually; it drives review expectations. |
| DORA relevant | Regulatory relevance flag | If your org uses DORA workflows, keep this accurate. |
| Significant vendor | Materiality classification | Use consistently; it drives cadence and governance. |
| Replaceability / alternatives | Resilience signal | Keep it honest; “easy” when it’s not is a risk. |
| Reassessment cadence / next due | Scheduling metadata | Drives notifications and overdue pressure. |
| Status | `active` / `inactive` | Inactive behaves like archived; restore is permission-gated. |

Vendor detail uses 5 merged tabs:

- Overview: hero metrics, summary cards, risk factors, linked risks, linked controls
- Assessments: assessments and reassessment schedule
- Assurance: contract controls and resilience
- Operations: SLA, incidents, remediation
- Ecosystem: dependencies and signals

Deep links are canonicalized as `tab + section`. If you need to route someone directly to a subsection, use a URL like `/vendors/<id>?tab=operations&section=sla`.

The vendor route family now behaves as one coherent surface:

- `/vendors/:id` for view
- `/vendors/:id/edit` for edit
- `/vendors/new` for create

The detail header centralizes the main actions:

- create issue
- edit vendor
- archive active vendor
- restore inactive vendor

Create and edit use the same section structure as the detail page:

- Identity
- Ownership & Scope
- Classification
- Resilience & Monitoring

## Core Workflows

### 1) Onboard a vendor (clean baseline)

1. Create vendor (or open existing).
2. Fill identity fields (name, legal info, website).
3. Set business context:
   - process/subprocess
   - department
4. Assign outsourcing owner.
5. Set governance flags:
   - vendor type
   - significant / important function / DORA relevance
6. Set initial risk score and rationale (in notes/assessment).
7. Save.

A vendor without an outsourcing owner is an orphan waiting to happen.

### 2) Run an assessment (decision-ready posture)

Vendor assessments are structured so your decision is auditable.

Typical workflow:

1. Open vendor detail → **Assessments**.
2. Start a new assessment.
3. Complete sections with evidence.
4. Save as draft while gathering inputs.
5. Submit when complete.
6. Review and record a decision (depending on your governance model).

Treat assessment status as real:

- draft: incomplete, not decisionable
- submitted: ready for review
- in review / committee recommended: under governance review
- approved/rejected: decision recorded

### 3) Link vendors to risks and controls

Linking is how you connect third-party posture to enterprise posture.

Use linking when:

- a vendor is a dependency for a critical process
- a vendor incident could move risk net scoring
- a control is specifically designed to manage vendor risk

Keep linkage meaningful: linking everything to everything destroys signal.

### 4) Maintain schedule and reassessment discipline

Vendors have reassessment cadence. Use it like a control:

- set cadence based on significance and risk score
- track next due
- respond to reminders early

If reassessments are always overdue, your governance model is under-resourced (fix capacity, not the reminders).

### 5) Respond to incidents, SLAs, and signals

Vendor monitoring surfaces exist so you can respond before posture collapses.

Operational pattern:

- incidents: log, assess impact, start remediation, and connect to Issues
- SLAs: treat breaches as posture changes, not just vendor management noise
- signals: use as early warnings (but validate before escalating)

When an incident is material:

- create an Issue (`/issues`) and route remediation
- consider whether linked enterprise risks need score/status changes

### 6) Archive/restore vendors

Vendors can be marked inactive (archived-like).

Archive when:

- relationship ended
- vendor is no longer used

Restore only when:

- relationship resumes
- vendor was archived incorrectly

## Approvals and Notifications Behavior

Vendor work generates notifications in multiple categories:

- assessment submitted / committee recommended / decided
- reassessment due soon / overdue
- SLA due / overdue / breach detected

Depending on policy, some vendor edits or decisions can be approval-gated.

Practical checks:

- if a decision/action didn’t apply, check `/approvals`
- if reminders are unexpected, check cadence and due dates

Use `./notifications.md` for queue discipline.

## Filters, Views, and Exports

### List filters

The vendor list supports operational filtering:

- status (active vs inactive)
- vendor type
- department
- search

### List views

The vendor list now has two operating modes:

- `All`: the standard paginated table
- grouped drill-down tabs: `By Department`, `By Process`, `By Type`, `By Risk`

Grouped views reuse the same active list filters, then reorganize the matching vendor set into drill-down cards.

`By Risk` is special:

- it only appears if you can read risks
- one vendor can appear in more than one risk group when it is linked to multiple readable risks
- card counts are overlapping membership counts, not unique-vendor totals
- `Unlinked Risk` means the vendor has no readable linked risks for your current access

### Exports

Export vendors for:

- periodic oversight packs
- audit evidence

Export discipline:

- export with an as-of date
- filter to the smallest necessary scope
- keep raw exports unchanged
- exports continue to follow the active list filters, not the currently opened grouped bucket

## Common Mistakes

- Missing outsourcing owner assignment.
- Risk score without rationale or evidence.
- Marking vendors “significant” inconsistently across the organization.
- Letting reassessment drift into constant overdue.
- Treating SLAs and incidents as separate from enterprise risk posture.

## Troubleshooting

### I don’t see `/vendors`

- Confirm `vendors:read`.

### I don’t see the `By Risk` tab

- Confirm you can read risks in addition to vendors.
- If you can open vendors but not risks, the vendor remains visible but the risk-grouped tab is intentionally hidden.

### I can view vendors but can’t edit

- You may not have `vendors:write` and you may not be the outsourcing owner.

### Assessments don’t progress

- Ensure the assessment is submitted (drafts do not trigger review).
- Confirm reviewers are aware of the pending work.

### Reassessment reminders feel wrong

- Validate reassessment cadence and next due.
- Confirm whether the vendor was recently assessed/decided.

### Export failed

- Retry with fewer filters.
- Capture the error message if it persists.

## Related Documentation

- `./issues.md`
- `./notifications.md`
- `./risks.md`
- `./controls.md`
- `./departments.md`
- `./activity-log.md`
