---
title: Managing Assets
version: "2.6"
last_updated: "2026-07-16"
audience: user
source_of_truth: "frontend/src/pages/AssetsPage.tsx + frontend/src/pages/assets/ + backend/app/services/_register_listings/assets.py + backend/app/services/_ict_register_lifecycle/asset_lifecycle.py"
summary: "User guide for the shared Asset register, responsibility, canonical values, derived results, links, export, and governed reassignment."
tags:
  - workflow
  - governance
  - audit
  - troubleshooting
  - departments
---
# Managing Assets

## What This Page Helps You Do

Use `/assets` for the ICT Asset register. Every new Asset requires an active **Business Owner**, active **ICT Owner**, and active **Owning Department**. These are directory relationships, not text. The same person may hold both roles, and either person may belong to a different Department from the Asset.

## Before You Start

Prepare the Asset name, both responsible people, the organizational Owning Department, classification, ratings, lifecycle evidence, and applicable Process, Asset, and Vendor links. Confirm the directory entries are active.

Business Owner expresses accountability for business use, value, data, and continuity requirements. ICT Owner expresses accountability for technical operation, support, security coordination, and lifecycle execution. Owning Department states where the Asset sits organizationally. Keeping these three facts separate is important even when one person currently performs both roles. Agree the intended assignments with the relevant teams before entering them.

Collect confidentiality, integrity, availability, and authenticity ratings on the 1–5 scale. Also prepare client and regulatory impact, substitutability, vendor dependency, internet exposure, preliminary criticality, deployment model, support-end dates, and review state when applicable. These are entered signals; the register engine calculates the resulting outputs from the current graph and parameter set.

## Where To Find It

Open **Assets** in the sidebar. The register opens in **All** with active Assets. Search by name, alternative name, type, either owner, Owning Department, or physical location. Select a row for details. Actions follow backend capabilities.

Use **All** for the ordinary paginated table. The other six views group the same visible result set as **By Department**, **By Business Owner**, **By Type**, **By Criticality**, **By Process**, or **By Vendor**. Select a group card to drill into its Assets and return to the summary when finished. An Asset can appear in more than one Process or Vendor group when it has multiple visible relationships. Unassigned, unclassified, and unlinked records use safe named buckets instead of raw identifiers.

## What You Can See and Change

The detail shows both owner names and safe role/Department context, but hides their email addresses and internal numeric IDs. The Owning Department appears independently by name and code. Asset value, resulting criticality, CIF, SPOF, completeness, and graph summaries are derived and read-only.

The register starts with active Assets. Select the archived lifecycle population when history is needed. Search and filters narrow only records already visible to your account; they never expand scope. Links to Processes, other Assets, Vendors, and Risks also apply the counterpart domain’s permissions. Owning or maintaining an Asset does not automatically reveal a restricted Vendor or Risk.

The backend declares whether **New Asset**, **Export**, and each row action are available. A Business Owner, ICT Owner, or manager of the Owning Department may receive record-specific access without gaining general Asset administration. Export requires the reporting capability. Archive and restore remain separate privileged actions. A pending ownership-governance state is shown independently from active/archived lifecycle and can lock ordinary changes without changing the operational record.

Controlled values are stable language-neutral codes. English and Czech screens localize them. Czech workbook labels are accepted only by the import mapping and are rejected by normal API writes.

## How To Complete Common Tasks

### Create an Asset

Search both owner pickers by name or email. Selecting Business Owner fills Department only when it is empty. Selecting ICT Owner never changes Department. Review or change Department independently. The same active user can be selected twice and cross-Department responsibility is supported.

The picker may show email, home Department, and RiskHub role to distinguish similar names. This metadata is for assignment only and is not copied into the Asset record. Before saving, verify all four required fields: name, Business Owner, ICT Owner, and Owning Department. After saving, confirm the localized type and lifecycle labels and both safe owner summaries on the detail.

### Edit responsibility

Risk Manager/CRO users can update within their authority. For an assigned active record, either Asset owner and the manager of the Owning Department receive record-specific read/update authority, but not archive/restore or general Asset administration.

If either responsibility becomes orphaned, ordinary edits and link changes are locked. Use the Asset item in **Governance**. Its row identifies `Business Owner` or `ICT Owner`; select an active replacement and an active Department. Both are applied atomically.

Choosing a replacement in Governance does not silently resolve the other responsibility role. If one deactivated person held both roles, two role-specific orphan rows can exist. Resolve each row deliberately. The Department selected during each resolution is submitted with the replacement so the Asset never passes through a half-assigned state. A stale resolution is rejected if another administrator already changed the target.

### Archive or restore

Archive/restore remain privileged actions. Being an owner or Department Head is not lifecycle authority. Restore the original record instead of creating a duplicate.

## Approvals and Notifications

Responsibility and lifecycle changes are audited. Asset accountability and
explicit Governance reassignment use the fixed accountability approval
scenario when enabled. The former relationship remains approved and auditable
until independent approval applies the complete change.

Use Activity Log when you need to establish who created, updated, archived, restored, linked, or reassigned an Asset. Governance resolution is a controlled corrective workflow, not a shortcut around normal permissions. If you can view the warning but cannot open Governance, ask an authorized Risk Manager or CRO to complete the reassignment.

## Finding, Filtering, and Evidence

Add filters for lifecycle, Owning Department, Business Owner, ICT Owner, Asset type, Asset level, deployment model, resulting criticality, CIF support, lifecycle state, legacy state, SPOF, external dependency, GDPR relevance, AI relevance, internet exposure, data classification, completeness, Linked Process, Linked Asset, Linked Vendor, and Linked Risk. The existing Process-link presence quick filter remains compatible.

Different fields are combined with **AND**. Multiple choices inside one field are combined with **OR**. Yes/No fields also support **Any**. Search is additionally combined with the selected filters. Facets and remote owner/entity lookups are permission scoped; valid controlled codes with no current results remain visible but disabled, while hidden entity labels and counts are never disclosed.

Search, view, sort, filters, and the selected group are stored in the URL, so a copied link or browser Back/Forward restores the same register state. Changing a filter, search, view, sort, or group returns pagination to page one; page number itself is not persisted. Unrelated navigation parameters may remain in the browser URL, but they are not Asset filters and are not forwarded to the Asset API or export.

**Clear all** removes user-added filters without broadening authorization. Loading, empty, retryable-error, and access-denied states are distinct. View and filter controls are labelled and keyboard operable. A denied or failed request does not leave stale Asset rows or group counts visible.

When **Export** is available, it uses the same visible search, filters, sort, view, and selected group as the register. It includes every matching visible Asset independently of the current page and contains canonical codes with localized labels. The formal DORA Register of Information export is a separate governed report.

For evidence, record the Asset name, localized type/lifecycle, both owner names and safe context, Owning Department name/code, active filters or selected group, entered ratings, derived result, and relevant links. Email is picker metadata only, not detail evidence. State whether evidence came from the active or archived population.

When investigating derived criticality, capture the engine’s explanation inputs, primary Process, linked Process count, score bands, and reference date. When investigating completeness, use the displayed list of missing inputs instead of inferring blanks from screenshots.

## Tips and Common Mistakes

Do not type owner names into notes, assume owners must share a Department, or overwrite Department when changing ICT Owner. Do not store translated labels or manually enter derived fields.

## Troubleshooting

Missing picker choices usually mean an inactive User or Department. If save fails, verify name, both owners, Department, canonical controlled values, and rating ranges. If Governance is pending, resolve the role-specific orphan instead of retrying ordinary edits.

If a label looks incorrect after changing language, report the language, field, stored code if available to support, and the displayed label; do not replace the code with a Czech workbook phrase. If a link action is absent, check the Asset state, Governance warning, counterpart visibility, and per-row capability. If an Asset seems missing, clear search, verify the active/archived population, and ask whether your owner or Department relationship is current.

## Accountability reassignment

Changing the Business Owner, ICT Owner, or Owning Department requires a reason
and queues one approval while the fixed scenario is enabled. The approved Asset
and orphan state remain unchanged until an independent Risk Manager or CRO
approves. Cancellation, rejection, or stale expiry preserves the prior values.

## Related Manuals

See [Processes](./processes.md), [Departments](./departments.md), [Governance](./governance.md), [Vendors](./vendors.md), and [Activity Log](./activity-log.md).
