---
title: Managing Vendors
version: "2.4"
last_updated: "2026-03-15"
audience: user
source_of_truth: "frontend/src/pages/VendorsPage.tsx + frontend/src/pages/VendorDetailPage.tsx + frontend/src/pages/vendors/*"
summary: "User guide for the core vendor register: ownership, classification, vendor flags, risk-detail-style linked sections, linked KRIs, routed create-from-vendor flows for risks/controls/KRIs, exports, and issue context."
tags:
  - vendors
  - workflow
  - exports
  - troubleshooting
  - controls
  - issues
---

# Managing Vendors

## Overview

The Vendors area is now a core third-party register. Use it to answer:

- Who owns the vendor relationship?
- Which process and department does the vendor support?
- What is the current vendor classification and risk score?
- Which enterprise risks, controls, and KRIs are linked to the vendor?

Primary route: `/vendors`

## Where To Find It

- Vendor list: `/vendors`
- Vendor detail: open a vendor row from the register
- Create vendor: `/vendors/new`

Required permissions:

- `vendors:read` to open the register and detail pages
- `vendors:write` to create or edit vendor records
- `vendors:delete` to archive or restore vendor records unless ownership rules grant access

### What A Vendor Record Contains

Core vendor data includes:

- identity: name, legal name, registration ID, country, website
- ownership: department, outsourcing owner, process, subprocess
- classification: vendor type, risk score, DORA relevance, significance, replaceability
- lifecycle: active/inactive status, archive/restore
- links: linked risks, linked controls, and linked KRIs

The vendor detail page is a single core view. It keeps:

- header and lifecycle actions
- a summary surface for risk score, status, exposure, and vendor flags
- summary cards for classification, ownership, and connections
- a linked KRIs section using the same card-grid and archived-group treatment as the linked risks and controls sections
- embedded linked risks section using the same section chrome and card-grid interaction model as the individual risk page
- embedded linked controls section using the same action bar, gauge-card style, and archived grouping pattern as the individual risk page
- contextual issue creation from the vendor page

## Roles, Scope, and Visibility

Vendor detail is intentionally simpler than Risks or Issues, but visibility still follows backend RBAC and scope rules.

- `vendors:read` is required to open the vendor register and the individual vendor page
- `vendors:write` allows full edit behavior for vendor records and vendor links
- vendor ownership rules can allow certain mutation actions even without broad vendor-admin privileges
- linked risks remain separately scope-filtered, so a user can still see the vendor even if some linked risks are omitted from the page
- linked controls are also filtered by normal control visibility rules before card grids are rendered
- linked KRIs follow the same read-scope and ownership rules as the KRI register, so unreadable KRIs are omitted from vendor detail and grouped views

This matters on the page because:

- `Link Existing` and `Manage Existing Links` only appear when the user can mutate vendor links
- `Add Risk` appears only when the user can both edit the vendor context and create risks
- `Add Control` appears only when the user can both edit the vendor context and create controls
- `Add KRI` appears only when the user can both edit the vendor context and create KRIs (`risks:write`)
- `Link Existing` for KRIs appears only when the user can mutate vendor links and can read the target KRIs
- the vendor page never leaks unreadable risk, control, or KRI names just to preserve counts or layout symmetry

## Data Model and Key Fields

The vendor record is now a core register entry, not a workflow container. Keep the following fields accurate:

- identity: vendor name, legal name, registration ID, country, website
- ownership: outsourcing owner, department, process, subprocess
- classification: vendor type, risk score, DORA relevance, significant-vendor flag, replaceability, alternative-provider flag
- lifecycle: active/inactive status with archive or restore actions
- links: enterprise risks, mitigating controls, and monitoring KRIs connected to the vendor

The linked sections now use richer summary data:

- linked risk cards show the risk code, risk type, gross score, net score, process, department, and priority marker
- linked control cards show the same gauge-style summary used on the individual risk page, including monitoring status, frequency, and risk level
- linked KRI cards show the monitoring status, latest due-date context, value, and related risk metadata used by the KRI register and vendor detail page
- archived linked items remain visible in separate secondary groups so historical context is not lost

## Core Workflows

### 1. Create or update a vendor

Use create/edit when you need to maintain vendor master data:

- assign the correct department and outsourcing owner
- set the vendor type and risk score
- mark DORA relevance and significance where applicable
- keep process and subprocess current

### 2. Link vendor exposure

Use linked risks, linked controls, and linked KRIs to connect the vendor to enterprise risk posture:

- use **Link Existing** to attach existing risks, controls, or KRIs
- use **Add Risk**, **Add Control**, or **Add KRI** to create a brand-new item from the vendor page
- review active and archived linked items in separate visual groups
- use **Manage Existing Links** to remove stale relationships when they are no longer valid

### 2a. Group vendors by flag

The vendor register also supports a grouped **By Flag** view for concentration review:

- `DORA relevant`
- `Supports core function`
- `Significant vendor`
- `Insignificant vendors` for vendors that have none of the three flags

This grouping is multi-membership:

- a vendor can appear in more than one flag bucket
- a vendor with no active flags appears only in `Insignificant vendors`

### 2b. Use grouped vendor views from other modules

Risks, Controls, Issues, and KRIs now support a grouped **By Vendor** view.

Use it when you want to answer questions like:

- which risks are concentrated around one vendor
- which controls mitigate exposure for a specific vendor
- which issues are currently open against one vendor context
- which KRIs monitor vendor-related exposure

### 3. Create a new risk, control, or KRI from vendor detail

The vendor page now supports routed create-from-vendor flows:

- **Add Risk** opens the full risk create form at `/risks/new?vendor_id=:id&return_to=/vendors/:id`
- **Add Control** opens the full control create form at `/controls/new?vendor_id=:id&return_to=/vendors/:id`
- **Add KRI** opens the full KRI create form at `/kris/new?vendor_id=:id&return_to=/vendors/:id`
- after save, the app returns to vendor detail with the new item already linked back to the vendor
- after create, you are returned to the vendor detail page with a confirmation banner and a direct link to the created item
- vendor-context KRI create keeps the parent risk mandatory and defaults the step-1 risk picker to risks already linked to that vendor
- if you choose a risk that is not linked to the vendor, the form prompts you to link the risk first or continue without linking it
- if you choose **Link risk and continue**, the backend creates the missing vendor-risk link and the KRI in one transaction
- if vendor assignment or requested risk-linking fails, the KRI is not partially created; the form stays open and shows the blocking error

Create buttons follow normal permissions:

- you must be able to edit the vendor link context
- and you must also have `risks:write` or `controls:write` for the corresponding create action

### 3a. Assign vendors directly inside the KRI form

KRI create and edit now also support vendor assignment outside vendor detail:

- the KRI form includes a **Linked Vendors** multi-select section
- a KRI still belongs to exactly one parent risk
- vendor linkage is secondary monitoring context and can include more than one vendor
- when opened from vendor detail, the current vendor is included automatically in the same save and the selector can be used for additional vendors
- non-privileged KRI edits that change linked vendors are approval-gated as part of the normal KRI edit request

### 4. Raise an issue from vendor context

Use **New Issue** on the vendor detail page when a vendor-related problem needs formal tracking.

The issue remains part of the Issues domain. Vendor context is only used to prefill linkage and navigation.

### 5. Archive or restore vendors

Archive vendors that should leave active operating views but must remain historically visible.

Typical reasons:

- the relationship ended
- the vendor is no longer in scope
- the record was replaced by another active vendor entry

## Approvals and Notifications Behavior

The vendor page itself does not run a separate approval workflow anymore. That is an intentional product boundary.

- vendor create/edit follows the standard vendor permission model
- create-from-vendor for risks, controls, and KRIs uses the normal routed forms
- if a newly created risk, control, or KRI would normally trigger approval behavior in its own domain, that behavior still applies there
- vendor detail only handles the post-create return path, confirmation banner, and link management for existing risks, controls, and KRIs

In practice this means:

- approvals belong to Risks, Controls, Issues, or Governance where those domains require them
- vendor detail remains a clean operating surface for ownership, classification, and exposure linkage
- vendor problems that need formal remediation should become Issues, not ad hoc vendor-only workflow records
- there are no vendor-specific workflow notifications in the core vendor model; use Issues, linked risks, and linked controls for follow-up context

## Filters, Views, and Exports

The vendor register supports:

- search
- status filtering
- vendor type filtering
- grouped views that respect linked-risk visibility
- grouped `By Flag` review for DORA, core-function, significant, and insignificant vendor buckets
- export from the vendor register

Exports now reflect only retained core vendor fields.

## Common Mistakes

- Treating the vendor record as a workflow engine instead of a clean register entry.
- Leaving owner, department, or process blank.
- Forgetting that **Add Risk**, **Add Control**, and **Add KRI** return to the vendor page after create.
- Keeping stale risk/control links after relationship changes.
- Creating duplicate vendor records instead of updating the existing one.

## Troubleshooting

### I cannot edit a vendor

Check:

- do you have `vendors:write`?
- are you the outsourcing owner?
- is the record in a department outside your scope?

### I cannot see linked risks

The vendor can remain visible even when linked risks are not. This usually means you can read vendors but not the linked risks in that scope.

### I need remediation tracking for a vendor problem

Create an Issue from vendor context. Do not expect vendor detail to hold a separate remediation workflow.

## Related Documentation

- [Getting Started](./getting-started.md)
- [Workflow, Approvals, Notifications](./notifications.md)
- [Managing Risks](./risks.md)
- [Managing Controls](./controls.md)
- [Managing Issues](./issues.md)
