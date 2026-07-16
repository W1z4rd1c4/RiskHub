---
title: Managing Vendors
version: "2.6"
last_updated: "2026-07-16"
audience: user
source_of_truth: "frontend/src/pages/VendorsPage.tsx + frontend/src/pages/VendorDetailPage.tsx + frontend/src/pages/vendors/*"
summary: "User guide for the shared Vendor register: six views, server-side filters, Outsourcing Owner accountability, linked-register context, contracts and sub-outsourcing, filtered export, lifecycle, pending state, and evidence."
tags:
  - vendors
  - workflow
  - exports
  - troubleshooting
  - controls
  - issues
---
# Managing Vendors

**On this page**
- [What This Page Helps You Do](#what-this-page-helps-you-do)
- [Before You Start](#before-you-start)
- [Where To Find It](#where-to-find-it)
- [What You Can See and Change](#what-you-can-see-and-change)
- [How To Complete Common Tasks](#how-to-complete-common-tasks)
- [Approvals and Notifications](#approvals-and-notifications)
- [Finding, Filtering, and Evidence](#finding-filtering-and-evidence)
- [Tips and Common Mistakes](#tips-and-common-mistakes)
- [Troubleshooting](#troubleshooting)
- [Related Manuals](#related-manuals)

## What This Page Helps You Do

Use this manual when you need to maintain the shared Vendor register, understand Vendor flags and derived tier, connect Vendors to Processes, Assets, Risks, Controls, KRIs, Contracts, Sub-outsourcing, and Issues, or prepare third-party evidence. It is written for users reviewing third-party risk and Vendor-linked work, so it focuses on what to do in the app, what to check before you act, and what result to expect after the work is done.

The page is not a technical reference. It explains the everyday operating pattern: start from the right screen, confirm the record is the one you intend to update, make the smallest useful change, and then verify the result in the list, detail page, notifications, or activity history.

You will use this area most often for:

- Vendor list views and filters
- Vendor detail and Outsourcing Owner accountability
- linked Processes, Assets, Risks, Controls, and KRIs
- Contracts and Sub-outsourcing chains
- Issues, standard Vendor exports, and the separate DORA RoI export

## Before You Start

Before working in this area, confirm three things. First, make sure you are signed in with the role you normally use for business work. Second, check the active-filter chips and clear old filters if the list looks incomplete. Third, check whether the record already has a pending change in the list, Approvals, My Requests, or Notifications.

If a button or tab is missing, treat that as a normal access signal, not as an error. RiskHub only shows actions that fit your role, scope, record ownership, and the current record state. When an action is unavailable, ask the record owner or your access contact to review it instead of trying to work around the screen.

Have the record name, code, owner, and department ready before asking for help. Those details make support and audit conversations much faster.

## Where To Find It

Primary route: `/vendors`

You can usually reach this area from the left sidebar. Detail pages open by selecting a row or a linked card. If you arrive from another record, use the back button or the related-record links to return to the broader context.

Common navigation pattern:

1. Open the list page.
2. Clear filters if you are not sure what should be visible.
3. Search by trading or legal name, registration identifier, owner, Department, or Process.
4. Open the record.
5. Review linked records and recent activity before changing anything.

## What You Can See and Change

What you can see depends on your role, department scope, and record ownership. A user with broad review responsibility may see more records than a user responsible for one department. A record owner may be able to act on a record even when it is outside the owner’s usual department view.

Typical information in this area includes:

- trading and legal name, registration identifier, country, and service description
- Outsourcing Owner and Owning Department
- Vendor type, risk score, derived tier, and DORA/CIF/significant flags
- substitutability, geography, completeness, and derived Vendor context
- linked Processes, Assets, Risks, Controls, and KRIs
- Contracts, Sub-outsourcing chains, and open Issues
- lifecycle state, pending-change state, and backend-provided row actions

Changes should be practical and easy to explain. Lifecycle and approval state are separate: an existing Vendor can remain Active while a proposed change is Pending. The list and detail use backend capabilities as the authority for Create, Export, Edit, Archive, Restore, and link actions. Read-only users can still use the page for investigation, filtering, and evidence gathering.

## How To Complete Common Tasks

Follow this basic workflow unless your team has a stricter local procedure:

1. Find the Vendor in the All view and confirm its lifecycle and pending state.
2. Create or update the Vendor and set the Outsourcing Owner and classification.
3. Review the risk score, derived tier, flags, substitutability, Contracts, and Sub-outsourcing.
4. Link only the Processes, Assets, Risks, Controls, or KRIs that represent a real relationship.
5. Create a permitted linked record from Vendor context when one does not already exist.
6. Return to the list, reproduce the intended filtered working set, and export evidence.

### Assign an Outsourcing Owner

The owner picker searches active users by name or email. It is purpose-scoped to Vendor ownership, so an eligible active user from another Department can be selected. Results show the safe business context—name, email, Department, and role. The application never uses a numeric user ID as a display fallback.

The selected owner receives record-specific Vendor read/update access according to the capabilities returned for that row. This does not grant create, archive, Governance, or linked-record access. Linked risks, controls, KRIs, contracts, Assets, Processes, and sub-outsourcing remain independently protected.

If an owner is deactivated, the Vendor becomes pending in Governance. The detail preserves the former-owner evidence, disables Vendor and link mutations, and directs an authorized Governance user to assign an active replacement. If you cannot open Governance, ask a CRO or Governance administrator to complete the reassignment.

### Controlled values and language

Vendor form choices are stored as stable codes and displayed in the active English or Czech language. Do not paste workbook labels into API payloads. An old or unknown value is shown as an unknown value, never as an untranslated database label.

After saving or submitting, verify the result. The list should show the new state, the detail page should match your intent, and any expected notification or approval item should be visible. If the page reports that the record changed while you were working, refresh and review the current record before trying again.

When linking records, choose only relationships that are useful to another reviewer. A link should explain a real business relationship: a control reduces a risk, a KRI monitors a risk, a vendor contributes to an exposure, or an issue tracks remediation for a specific problem.

## Approvals and Notifications

Vendor edits may be reviewed when they affect accountability, a protected Critical or Significant Vendor, archive state, or linked governance work. Link actions appear only when your current access allows both the Vendor action and the target context. A Pending change badge is not an archive state: the approved Vendor remains the operational record until the governed change is resolved.

Use approval notes to explain the business reason, not just the button you clicked. A good note says what changed, why it is appropriate, and what evidence supports the decision. Notifications are reminders and pointers; the record detail remains the best place to understand the full context.

If you receive a stale or rejected approval, do not immediately resubmit the same change. Open the record, compare the current state with your intended update, and submit a new focused change only if it is still needed.

## Finding, Filtering, and Evidence

The Vendor register opens in **All** with active records and no user-selected sort when the URL contains no explicit state. The retained views are **All**, **By Department**, **By Process**, **By Type**, **By Risk**, and **By Flag**. A grouped view first shows group cards; select a card to drill down to its Vendor rows, then use the back action to return to the groups.

**By Risk is permission-scoped and multi-membership.** One Vendor appears in every linked-Risk group that you are independently allowed to read. A hidden Risk cannot contribute its identifier, name, count, lookup option, group, or export content. If Risk context is not available to your role, the By Risk view is not offered.

Search covers trading name, legal name, registration identifier, Outsourcing Owner, Owning Department, and Process. Add the filters relevant to the review:

- lifecycle state, Owning Department, and Outsourcing Owner;
- Vendor type, risk score, and derived tier;
- DORA relevance, CIF support, and significant-Vendor flags;
- substitutability, country, and country category;
- presence of a RoI-scope Contract, Sub-outsourcing, or a direct Process link;
- Linked Process, Asset, Risk, Control, or KRI.

Different filter fields use **AND**. Selecting several values inside one field uses **OR**, and search is additionally ANDed with the filters. Boolean fields offer Any, Yes, and No. Options and counts are calculated by the backend from the Vendor and linked-record universe you may read. Controlled values use stable codes and localized labels; linked-record and owner choices use searchable directories, and a selected authorized value remains readable across lookup pages. Zero-result controlled choices stay visible but disabled.

Every active filter has a chip and contributes to the active-filter count. Remove one chip to clear one dimension or use **Clear all** to remove the added filters while preserving the search term. Changing search, view, filter, sort, or selected group resets pagination to page 1. Search, view, sort, filters, and group are restored by browser Back/Forward, reload, and a copied URL; page numbers deliberately are not persisted.

The standard Vendor export uses the current search, filters, sort, and selected group, includes all matching rows independently of the current page, and follows the active UI locale. Controlled fields retain stable codes and localized labels. The formal DORA Register of Information export is a separate regulatory action with mandated structure and terminology. Use the Vendor detail or the related register for evidence that is not part of the standard list export.

For reliable evidence, start broad enough to confirm the Vendor exists, narrow to the intended population, open a sample row to verify the meaning, and then export. Record the time and purpose of the snapshot and avoid sharing unrelated personal or sensitive information.

## Tips and Common Mistakes

- Avoid duplicate vendors with slightly different names.
- Do not treat By Risk as an exclusive category; a Vendor may legitimately appear in several readable Risk groups.
- Link a Vendor to the specific Process, Asset, Risk, Control, or KRI, not only to the Department.
- Do not confuse the standard filtered Vendor export with the formal DORA RoI export.
- Use Vendor context when creating KRIs so the third-party relationship stays visible.

Common mistakes are usually caused by stale filters, unclear ownership, duplicate records, or trying to make a broad change when a focused change would be easier to review. If something looks wrong, first refresh the page and confirm the same result in the detail view.

## Troubleshooting

If the page is empty, inspect the lifecycle selection, remove filter chips, and search by a known trading name or registration identifier. Use **Retry** after a temporary load failure. If the backend denies access, RiskHub removes stale rows and shows Access denied; filters cannot broaden authority. If the page is missing from the sidebar, your role may not include that work area. If a save fails, read the message, refresh the record, and check whether another user changed it first.

If a linked record is missing, you may not have access to that related item. Ask for the business name or code rather than a technical identifier. For support, include your role, the route you were using, the record name, the action you attempted, and the exact message shown on screen.

If owner or linked-record search fails, retry the protected lookup; do not substitute a numeric ID. If the Vendor says reassignment is pending, resolve it in Governance before editing or changing links. If the By Risk view is absent, confirm that your role has Risk read access. If export labels use the wrong language, switch the UI language and start a new standard export.

All view buttons, filter controls, chips, group cards, sortable headers, pagination, retry actions, and export-dialog controls are keyboard-operable and labelled. If focus disappears or a control has no accessible name, record the route, active filters, browser, and language when reporting the problem.

## Related Manuals

Start with [Risks](./risks.md), [Controls](./controls.md), [Kris](./kris.md), [Issues](./issues.md), [Dashboard](./dashboard.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
