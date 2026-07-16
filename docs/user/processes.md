---
title: Managing Processes
version: "2.6"
last_updated: "2026-07-16"
audience: user
source_of_truth: "frontend/src/pages/ProcessesPage.tsx + frontend/src/pages/processes/processRegisterConfig.ts + backend/app/services/_register_listings/processes.py + backend/app/services/_ict_register_lifecycle/lifecycle.py"
summary: "User guide for the shared Process register, ownership, canonical values, derived criticality, lifecycle, links, export, and governance reassignment."
tags:
  - workflow
  - governance
  - audit
  - troubleshooting
  - departments
---
# Managing Processes

## What This Page Helps You Do

Use `/processes` to maintain the ICT Register of business functions in the L0, L1, and optional L2 hierarchy. A Process records what the organization does, who is personally accountable, which Department owns the function, the entered impact and continuity inputs, and the criticality results calculated by RiskHub.

Every new active Process has one **Process Owner** and one **Owning Department**. These are directory relationships, not text fields. The owner can be any active RiskHub User and may belong to a different Department from the Process. This separation is intentional: personal accountability and organizational ownership answer different questions.

The Process detail provides direct Vendor links plus permission-filtered derived/transitive Vendor summaries and counts. It does not provide Asset or Risk link sections. These Vendor relationships do not grant access to a Vendor that is outside your separate Vendor permissions and row visibility.

## Before You Start

Prepare the L0 area, L1 Process name, optional L2 sub-process, proposed Process Owner, and Owning Department. Confirm both directory entries are active. Discuss cross-Department ownership with the relevant Department Head before saving it; RiskHub allows the arrangement but does not treat the owner’s home Department as the Process’s organizational owner.

Collect impact values, MTPD, RTO, RPO, BCM evidence, DR test information, and the assessment date when available. Entered impact dimensions use the 1–5 scale. RiskHub calculates the criticality score, resulting class, CIF flag, continuity checks, next review date, linked-record counts, and completeness. Do not calculate or type those derived values yourself.

Actions are controlled by backend capabilities. A missing action can mean that the record is outside your scope, archived, or awaiting Governance resolution. Do not borrow another User’s session or paste internal IDs to work around a missing picker result.

## Where To Find It

Open **Processes** from the sidebar. With no saved state in the URL, the register opens in **All** view with active records and the server's deterministic F-code order. Search by F-code, L0/L1/L2 name, Process Owner, or Owning Department. Select a row to open its detail. Authorized users see **New Process**, **Edit Process**, archive, restore, or export actions according to the capabilities returned by the server.

## What You Can See and Change

The detail shows the stable F-code, hierarchy, safe Process Owner identity, Owning Department, entered impact and continuity fields, lifecycle state, links, and a separate derived section. It displays the owner’s name separately from owner context (home Department and RiskHub role); it does not display the owner’s email on the detail page. The Owning Department is displayed separately by name and code. The UI never replaces a missing name with a raw database number.

Controlled Process values are stored as language-neutral codes. English and Czech screens render localized labels for preliminary criticality, CIF override, licensed activity, BCM linkage, DR result, and interruption impact. Changing language changes presentation only. Free-text names and notes are never translated.

The F-code is assigned once by the server and survives edits, archive, and restore. Derived criticality can differ from the preliminary class because live impacts and thresholds take precedence. Use the “Why” inputs in the derived section when explaining the result.

## How To Complete Common Tasks

### Create a Process

Select **New Process** and enter L0 and L1. Search the owner picker by name or email. Results include the owner’s email, home Department, and role so that you can distinguish people with similar names. Selecting an owner fills the Owning Department only when that field is empty. Review the proposed Department and change it if organizational ownership differs. The owner selection must not overwrite a Department you already chose.

Complete the available impact, criticality, continuity, and assessment inputs, then save. The server verifies that the owner and Department are active. After creation, confirm the safe owner summary, Department, stable F-code, localized values, and derived result.

### Edit accountability

Open **Edit Process** and select an active replacement owner or Department. Ordinary field updates are available to Risk Manager/CRO users and, for the assigned record, the Process Owner or the manager of the Owning Department when backend capabilities permit them. Ownership does not grant general Process-register administration or access to linked objects.

Changing the owner never silently changes a populated Owning Department. Review both fields before saving. If the current owner is inactive and an orphan warning is present, ordinary business edits are locked. An authorized Governance user must resolve the pending item explicitly so the former relationship remains auditable until reassignment succeeds.

### Archive or restore

Archive only when the Process should leave active operational views. Archive and restore remain privileged actions; being the Process Owner or Department Head does not grant lifecycle authority. Inspect links and evidence before archiving. Restore the same record rather than creating a duplicate so the F-code and history remain intact.

## Approvals and Notifications

Process accountability is audited. Creation, update, archive, restore, link changes, and orphan resolution record attributable business events.

This Process ownership release does not add a Process-specific approval queue or notification workflow. When an owner becomes inactive, the shipped path is Governance: RiskHub preserves the former relationship and creates a pending Governance item. The Process detail shows the governance state and blocks ordinary edits and Process-Vendor link mutations. A Governance user with the required authority opens the Process orphan in Governance and explicitly reassigns the Process to an active owner and active Owning Department. The resolution is atomic: the Process cannot finish with only one side of accountability assigned.

## Finding, Filtering, and Evidence

Use **All** for the ordinary paginated table. The other five views group the same visible result set as **By Department**, **By Owner**, **By L0 Area**, **By Criticality**, or **By Vendor**. Select a group card to drill into its Processes and return to the group summary when finished. A Process can appear in more than one Vendor group when it has multiple visible direct or derived Vendor relationships. Unassigned, unclassified, and no-linked-Vendor groups are shown as safe named buckets rather than raw identifiers.

Search covers F-code, L0/L1/L2 names, Process Owner name, and Owning Department name. Add filters for lifecycle, Owning Department, Process Owner, L0 Area, criticality class, CIF, completeness, licensed activity, BCM linkage, DR test result, inclusive MTPD range, Linked Asset, Linked Vendor, or Linked Risk. Multiple fields are combined with **AND**; multiple choices inside one field use **OR**; search is additionally combined with the filters. Boolean filters offer Yes, No, or Any. Active chips show every applied condition; remove one chip or use **Clear all** to return to the default active-only result.

Filter and search choices never expand access. Facet counts and remote Department, owner, Asset, Vendor, and Risk lookups are calculated from records and relationships you may read. Valid controlled codes with no current matches remain visible but disabled. Selected lookup entries can still be resolved after paging, and the interface shows safe names and context rather than numeric database IDs.

The URL preserves search, selected view, sort, filters, selected group, and unrelated navigation parameters. Reloading the URL or using browser Back/Forward restores that state. The current page is deliberately not stored; changing search, a filter, the view, sort, or group selection returns pagination to page 1. Unrelated parameters remain browser navigation context only: they are not sent as Process filters and cannot change lifecycle or broaden an export.

When export is available, **Export** downloads a standard CSV for every matching Process you are allowed to read, not just the current page. It uses the current search, filters, sort, and selected group; its rows include canonical codes and labels in the active English or Czech locale. The formal DORA Register of Information export remains a separate regulatory output.

While the register is loading, keep the browser open and wait for the progress state to finish. A failed refresh keeps already loaded results visible with an error and retry action when safe. Empty-register and no-match states explain whether to create a record, clear conditions, or change search. If Process read access is denied, the register shows an access state and does not reveal rows, group labels, facet counts, or lookup values. View controls, filters, group cards, table sorting, pagination, and retry actions are keyboard operable and labelled for assistive technology.

For evidence, record the F-code, L0/L1/L2 name, displayed Process Owner name and owner context, Owning Department name/code, lifecycle state, localized displayed values, and derived result. Use Activity Log for who changed accountability or lifecycle state and when. Email is picker metadata for identity disambiguation, not part of the Process detail evidence display.

## Tips and Common Mistakes

Do not type a person’s name into notes as a substitute for the owner picker. Do not choose the owner’s Department automatically without considering the Process’s organizational ownership. Do not assume a cross-Department assignment is invalid: it is supported deliberately.

Do not edit stored values to compensate for a translation problem. Report the wrong label and keep the canonical value unchanged. Do not treat the preliminary class as the final result; inspect the derived score and its inputs. Do not archive a Process merely to remove one obsolete link.

## Troubleshooting

If an owner is missing from the picker, confirm that the User is active. Retry the lookup and search by exact email. If a Department is absent, confirm that it is active and use its name or code. Inactive directory entries cannot be selected for new accountability.

If saving fails, check all required fields first: L0, L1, Process Owner, and Owning Department. Then check controlled values and numeric ranges. If an orphan warning is displayed, use Governance rather than repeated ordinary edits. If a linked record is unavailable, verify your permission for that record type; Process ownership does not expand linked-record scope.

If the list looks unexpectedly narrow, inspect the active filter chips, selected group, and lifecycle before clearing state. A disabled zero-count option is a valid value with no result in the current readable universe, not a broken lookup. If an export contains fewer rows than expected, compare it with the total matching count rather than the current page and confirm that the same filters and group are active.

If a localized label looks wrong, note the active language, field, and displayed value. If a derived value looks wrong, capture the entered impacts, MTPD, preliminary class, and the explanation inputs shown in the derived section.

## Related Manuals

See [Departments](./departments.md), [Governance](./governance.md), [Risks](./risks.md), [Vendors](./vendors.md), and [Activity Log](./activity-log.md).
