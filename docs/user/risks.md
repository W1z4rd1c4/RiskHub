---
title: Managing Risks
version: "2.0"
last_updated: "2026-03-07"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §2.1, §6, §7 + frontend/src/pages/RisksPage.tsx"
summary: "Full manual for building and operating a high-quality risk register: scoring, ownership, scope rules, control linkage, exports, and approval-aware edits."
tags:
  - risks
  - workflow
  - approvals
  - exports
  - troubleshooting
---

# Managing Risks

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

The risk register is the central operating surface for identifying, scoring, and governing organizational exposure.

A good risk register is not a list of scary statements. It is a set of *actionable* records that drive:

- ownership accountability
- control design and execution
- KRI monitoring
- workflow approvals for sensitive changes
- audit-ready exports

Primary route: `/risks`

RiskHub supports a "gross" vs "net" model:

- **gross**: inherent risk before controls
- **net**: residual risk after controls

Scoring is expressed through probability and impact, which are then combined into scores.

## Where To Find It

- Risk register: `/risks`
- Risk detail: click any row
- Create risk: from `/risks` (requires `risks:write`)

On the Risk detail page, the top overview row summarizes the record through:

- Classification
- Ownership
- Connections

The **Connections** card shows:

- active linked mitigating controls
- total linked risk appetite indicators (KRIs)
- total linked vendors

If you do not see **Risks** in the sidebar:

- you likely lack `risks:read`
- or your scope is misconfigured

Start with `./getting-started.md` and `./access-management.md` to validate access.

## Roles, Scope, and Visibility

Risk visibility is driven by three ideas:

1. **Scope** (global vs department vs manager)
2. **Department assignment** (routing + reporting context)
3. **Ownership exceptions** (owner may see and act outside department scope)

Practical consequences:

- Don’t assume that “department = can see”. Ownership can change visibility.
- If a risk moves departments or changes owner, it can appear/disappear for different users.
- Backend enforcement is authoritative; the UI is guidance.

Write and delete/archive actions are permission-gated:

- `risks:write` for create/edit
- `risks:delete` for archive/restore actions (depending on your policy)

## Data Model and Key Fields

RiskHub uses a structured risk record. These fields are the ones that drive operations.

| Field | Meaning | Pitfalls / notes |
|---|---|---|
| Risk ID code | Stable identifier (generated) | Use this in communication and audit packs. |
| Name | Short statement of the risk | Avoid generic names. Include the “failure mode”. |
| Process / Subprocess | Business area classification | Be consistent; this is used in grouping and reporting. |
| Risk type | Taxonomy label (configured in Risk Hub) | Don’t invent new types casually; taxonomy should be stable. |
| Category | Secondary grouping | Keep category vocabulary controlled to avoid fragmentation. |
| Description | What can happen + impact + context | If it can’t be understood in 60 seconds, it’s too vague. |
| Status | `active`, `emerging`, `archived` | Status influences visibility and reporting. |
| Priority flag | Operational “must watch” marker | Use sparingly; otherwise it loses meaning. |
| Owner | Accountable person | Without a clear owner, nothing else scales. |
| Department | Routing/reporting context | Do not use department as a substitute for owner. |
| Gross probability/impact | Inherent scoring inputs | Choose values consistently; use descriptions, not vibes. |
| Net probability/impact | Residual scoring inputs | Should reflect control effectiveness, not optimism. |
| Linked controls | Controls that mitigate this risk | Links should be meaningful and maintained. |
| KRIs | Indicators that monitor this risk | KRIs are how you detect drift early. |

Detail view note:

- The **Connections** card uses the active linked controls count, not draft or archived controls.
- KRI and vendor counts reflect all currently linked records visible on the detail page.

Notes on scoring quality:

- Scoring is only useful if changes are explainable.
- If net score improves, you should be able to point to controls and evidence.

## Core Workflows

### 1) Create a new risk (high signal, low noise)

1. Go to `/risks` and click **New risk**.
2. Fill identity fields first:
   - name
   - process/subprocess
   - risk type
   - category
   - description
3. Set ownership:
   - choose owner
   - confirm department (often auto-filled from owner, but verify)
4. Set scoring:
   - gross probability/impact
   - net probability/impact
5. Save.

Recipe: *create with minimal approval friction*

- avoid changing many governance-sensitive fields in one go
- write a clear description and choose a realistic owner
- if your environment approval-gates some fields, you’ll get a cleaner request when your change is focused

### 2) Keep risks actionable (maintenance discipline)

A risk record should be maintained when:

- scoring changes (gross or net)
- ownership changes
- control set changes materially
- a KRI breaches or goes overdue
- a risk assessment questionnaire requires clarification

Good maintenance update:

- states what changed
- states why it changed
- references evidence (if applicable)

### 3) Link controls to risks (mitigation integrity)

Control linkage is where the register becomes operational.

In a risk detail view you can typically:

- link existing controls with an effectiveness rating (high/medium/low)
- add notes explaining the mitigation mechanism
- unlink controls when they no longer mitigate

Link quality rules:

- do not link controls that only “feel related”
- do not leave high-risk items without linked controls unless explicitly accepted
- when you unlink, document why (control retired, scope changed, replaced)

### 4) Use KRIs to monitor risk drift

KRIs are the monitoring layer.

Operational pattern:

- define KRIs for the risks you care about most
- set thresholds so “breach” is meaningful
- treat overdue KRIs as a governance failure (you lost your early warning)

### 5) Archive and restore

Archiving is a governance action. Do it when the risk is no longer relevant (process retired, risk eliminated, merged).

Safe archive procedure:

1. Confirm there are no active remediation actions depending on the risk.
2. Ensure linked controls and KRIs are handled appropriately.
3. Archive.
4. Verify the risk moves out of active reporting.

If the backend requires approval for archiving, the action will be queued and appear in `/approvals`.

Restoring is appropriate when:

- the risk becomes relevant again
- the risk was archived incorrectly

## Approvals and Notifications Behavior

RiskHub often treats certain edits as governance-sensitive.

Common approval-triggering patterns:

- ownership changes
- department changes
- category/type changes
- archiving actions

You can detect queued changes in the UI:

- the save succeeds but the value remains unchanged
- the list row shows a “pending changes” indicator

When this happens:

1. Open `/approvals` and find the request.
2. Track status and resolution notes.
3. Watch `/notifications` for outcomes.

Use `./notifications.md` as the canonical workflow manual.

## Filters, Views, and Exports

The risks list is designed to support operational views.

### Filters

Common filters include:

- status (`active`, `emerging`, `archived`)
- risk type
- priority
- breached (has KRI breach)
- critical (net score above a threshold)

### Views

RiskHub supports view modes that change how you interpret the list:

- all risks (paged)
- grouped views (requires fetching more data for accurate counts)

Use grouped views for:

- committee prep
- “where is exposure concentrated?” analysis

### Sorting

Sorting is useful when you are preparing a pack:

- sort by score to isolate top drivers
- sort by process/category to align to organizational reporting

### Exports

Exports should be treated like evidence.

Export discipline:

- export with an explicit as-of date
- keep filters consistent with the narrative (department, status)
- keep the raw export file unchanged and attach derived analysis separately

## Common Mistakes

- Writing risks as generic statements without impact context.
- Treating scoring as a “heatmap decoration” rather than a governance control.
- Changing multiple sensitive fields without documenting rationale.
- Linking controls without verifying they actually mitigate the described failure mode.
- Ignoring overdue KRIs (losing monitoring discipline).

## Troubleshooting

### I can’t see a risk I expect

- Check the risk’s department and owner.
- Confirm your scope.
- If ownership changed recently, check `/activity-log` if you have access.

### My edit didn’t apply

- Check `/approvals` for a queued request.
- Check `/notifications` for the outcome.

### “Critical” filter doesn’t match my expectations

- Critical is threshold-based (net score).
- If thresholds were changed in Risk Hub, your view may shift.

### Export failed

- Retry with fewer filters.
- Confirm you have stable connectivity.
- If it persists, capture the error and escalate.

## Related Documentation

- `./getting-started.md`
- `./notifications.md`
- `./controls.md`
- `./kris.md`
- `./issues.md`
- `./vendors.md`
- `./departments.md`
- `./activity-log.md`
