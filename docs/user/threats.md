---
title: Managing Threats
version: "2.6"
last_updated: "2026-07-16"
audience: user
source_of_truth: "frontend/src/pages/ThreatsPage.tsx + frontend/src/pages/threats/ThreatRegisterFilterBar.tsx + backend/app/services/_register_listings/threats.py + backend/app/services/_ict_register_lifecycle/threat_lifecycle.py"
summary: "User guide for the shared Threat register, CISO stewardship, scoped filters and Risk grouping, export, archive state, and orphan reassignment."
tags:
  - risks
  - governance
  - workflow
  - audit
  - troubleshooting
  - access
---
# Managing Threats

## What This Page Helps You Do

Use `/threats` to review the global Threat catalog, maintain Threat records, and connect Threats to the Risks they can cause. Threats are not owned by a Department: each active record has one accountable Threat Steward who must be an active CISO.

The catalog gives the organization one consistent description of recurring ICT threat scenarios. A Threat describes a source of potential harm, such as ransomware, loss of availability, unauthorized disclosure, or a third-party disruption. A Risk describes the business exposure created when a Threat affects a particular process or asset. Keeping those concepts separate lets one Threat be linked to several Risks without duplicating its description or stewardship evidence.

Use this page when you need to add a new scenario, improve its description, confirm who is accountable for it, or review the Risks that depend on it. Do not use it to record a specific incident or remediation action; use the relevant incident, Issue, Control, or Risk workflow for that purpose.

## Before You Start

Confirm that an active CISO is available for assignment and that you understand the Risk links affected by the change. CISO, Risk Manager, and CRO access can maintain Threats; other business roles receive contextual read access according to their permissions.

Before creating or materially changing a record, collect a short name, a plain-language description, the most suitable controlled category, typical weaknesses, and the systems or subjects that may be relevant. Agree the proposed stewardship with the CISO. The picker only returns active Users holding the CISO role, so a person cannot be made accountable through an informal text entry.

Your visible actions come from server-provided capabilities. If the create, edit, archive, restore, or link action is absent, do not infer that the page is broken. Your role may have read-only access, the record may be archived, or the linked Risk may fall outside your permitted scope. Ask a Risk Manager or CRO to confirm the intended access rather than sharing another person’s session.

## Where To Find It

Open **Threats** from the sidebar. Select a row for detail, use **New Threat** to create a record, or open **Edit Threat** to reassign its steward.

The register opens in **All** view with active records and no user-selected sort. The other views are **By Category**, **By Threat Steward**, **By Relevant Subject**, and **By Linked Risk**. A grouped view first shows group cards; select one to drill down to its Threat rows, then use the back control to return to the groups. Browser Back and Forward, a reload, and a copied URL restore the same search, filters, view, sort, and selected group. Page numbers are deliberately not persistent; changing the working set starts again on page 1.

Use the lifecycle filter when you need to inspect or restore a retired entry. The detail page contains the record overview and the Risk-link section. Governance users can also reach stewardship gaps from the orphaned-items area when a previously assigned CISO becomes inactive or loses the CISO role.

## What You Can See and Change

The detail shows the Threat name, localized category, description, typical weaknesses, relevant subject, notes, safe steward name/email context, lifecycle state, and linked Risks. Category values are stored as language-neutral codes and rendered in the active English or Czech locale; free text is never translated.

The controlled categories cover availability, integrity, confidentiality, authenticity, physical, personnel, and third-party Threats. Choose the best primary category and explain important secondary effects in the description. Switching the application language changes the displayed category label only; it does not rewrite the record or create a second translated copy.

The steward panel shows business-safe identity context such as name, email, role, and Department. Internal numeric identifiers are not used as a user-facing fallback. If the current relationship is no longer eligible, the detail displays an amber warning while retaining the historical assignment. While that gap is pending, ordinary Threat editing is locked because the API accepts reassignment only through the explicit Governance resolution. The warning is a governance signal, not proof that the underlying Threat was deleted or altered.

## How To Complete Common Tasks

### Create a governed Threat

Select **New Threat**, enter a concise unique name, and choose an active CISO in the searchable **Threat Steward** picker. Select the controlled category, then add enough description and typical-weakness context for another reviewer to understand the scenario without private background knowledge. Save the form and verify that the detail shows the intended steward and localized category. Missing or ineligible stewardship is rejected by the server even if a stale browser once displayed that User as an option.

### Reassign stewardship

For an eligible current steward, open **Edit Threat**, search for the replacement CISO by name or email, select the person, and save. If the amber orphan warning is present, do not use ordinary editing: a CRO opens the Threat queue in **Governance**, selects **Resolve**, chooses an active CISO, and submits the explicit resolution. Deactivating the former steward never silently transfers ownership. After either path succeeds, confirm the new name in the detail and use the Activity Log when evidence of the change is required.

### Link or unlink a Risk

From the Threat detail, search for a Risk you are allowed to read and select **Link**. The relation appears with the Risk’s business code and name. CISO can manage links from the Threat end because this is part of Threat stewardship, but cannot modify the Risk itself without separate Risk write authority. Remove a link when the relationship was incorrect or is no longer relevant; do not archive the Threat merely to hide one obsolete relation.

### Archive or restore

Archive a Threat only after confirming that it should leave the active catalog and that reviewers understand the impact on linked records. Archived Threats reject ordinary edits and new link mutations. Use the archived view and **Restore** when the same governed record becomes relevant again, preserving its history instead of creating a duplicate.

## Approvals and Notifications

Threat lifecycle and link actions do not grant approval authority. The CISO role cannot approve unrelated workflows or administer Users. Steward reassignment is an explicit audited update.

Creation, field changes, archive, restore, and Risk-link mutations create attributable audit facts. These actions do not start a general approval request merely because the actor is a CISO. If a connected Risk, Control, Issue, or Vendor has its own approval process, follow that domain’s workflow separately. The Threat Steward relationship records accountability for the Threat catalog; it does not make the steward an approver for every related object.

## Finding, Filtering, and Evidence

Search covers the Threat name, description, typical weaknesses, relevant subject, and Steward name. Search is combined with every selected filter. Different filter fields use **AND**; selecting several values inside one field uses **OR**. Any filter change starts again on page 1, so a narrow result is not hidden by an old page number.

The lifecycle control stays visible. Use **Filters** to add only the other controls needed for the current review:

- category;
- Threat Steward;
- relevant subject;
- whether the Threat has a linked Risk;
- a specific Linked Risk;
- Linked Risk type; and
- Linked Risk Department.

The active-filter count and chips show the complete selection. Remove one chip to clear one field, or use **Clear all** to remove all added filters without discarding the search term. Options, labels, and counts are calculated only from records and linked Risk context you are allowed to see. Controlled category and Risk-type values use stable codes with localized labels; the Steward and Linked Risk controls use permission-scoped searchable directories. A disabled zero-count option is informative, not an invitation to broaden access.

**By Linked Risk** is a multi-membership view: one Threat linked to three Risks appears in all three readable Risk groups. It is not assigned to only its first Risk. Risks outside your read scope do not produce a group, option, count, label, or indirect clue. The unlinked group means no readable linked Risk in your visible universe; it does not prove that no hidden relationship exists.

Sorting and pagination operate inside the current filtered universe and selected group. Use **Export** to download every matching Threat under the same permission scope, independent of the page currently displayed. The standard export keeps stable category codes and adds labels in the selected export locale. It also carries the current search, filters, view, and selected group; it does not export unrelated URL parameters or list pagination. If **Export** is absent, the server did not grant that collection capability.

Use the detail and Activity Log as evidence of stewardship, lifecycle changes, and Risk-link changes. The UI never substitutes a raw User ID for a missing name.

For an evidence review, capture the Threat’s name, category, current eligible steward, archive state, and linked Risk business identifiers. Then inspect the Activity Log for who created, edited, archived, restored, linked, or unlinked the record and when. A filtered list or standard export is a register snapshot, not a complete audit trail. Use the Activity Log or an authorized audit report when the evidence must show who changed a relationship or field and when.

An amber orphan warning means the relationship was preserved after the former steward became inactive or lost the CISO role. This is intentional evidence preservation. The Threat remains readable, and the prior foreign-key relationship is not overwritten with an invented replacement. The detail suppresses **Edit Threat** and directs an authorized CRO to the Threat queue in Governance; a CISO without Governance access is told to ask a CRO. Governance statistics count the gap until that operator explicitly resolves it to an active CISO.

## Tips and Common Mistakes

Do not enter a person’s name into free text instead of using the steward picker. Do not translate category codes in imports; workbook labels are mapped at the import boundary. Do not treat the Threat Steward as a generic owner or Department assignment.

Prefer one reusable Threat over several near-duplicates tied to individual Risks. Put Risk-specific likelihood, impact, owner, and mitigation information on the Risk. Keep the Threat description stable and recognizable across the organization. Before archiving, search for similar names and inspect links so you do not retire the shared catalog entry when only one relationship should be removed.

Never try to work around an empty picker by pasting an identifier or asking for broad User administration rights. Retry the lookup first, confirm the proposed steward is active, and ask an administrator to correct the User’s role only when that organizational decision has actually been approved.

## Troubleshooting

If saving an ordinary edit is rejected, confirm that the selected User is active and still has the CISO role. If an amber steward warning appears, the former assignment is preserved but ineligible and the edit form is intentionally unavailable; ask a CRO to use the Threat queue in Governance and resolve the gap to an active CISO.

If the steward list fails to load, use **Retry** and check whether other API-backed lists work. A continuing failure may be a connectivity or service issue; preserve the form text before refreshing and provide the time and page to support. If the list loads but a person is absent, confirm that the User is active and has the CISO role rather than a similar job title stored only as directory metadata.

If a Risk cannot be found in the link picker, verify that it is active and within your permitted visibility. The service deliberately does not reveal out-of-scope Risk records. If a link action is unavailable on an archived Threat, restore the Threat before making an authorized change. If category text appears in the wrong language, confirm the active language and report the displayed label; do not edit stored data to compensate for a localization problem.

If the register fails to load, use the keyboard-accessible **Retry** action. A server-declared access denial replaces the register rather than leaving stale rows, groups, filters, or counts on screen. If a grouped URL opens without its selected group, that group may no longer exist in your filtered and permission-scoped universe; return to the grouped view and choose a visible group. If an export fails, keep the URL and retry after connectivity is restored rather than weakening the filters.

## Related Manuals

See [Risks](./risks.md), [Governance](./governance.md), [Activity Log](./activity-log.md), and [Access Management](./access-management.md).
