---
title: Asset Register Support (Admin Runbook)
version: "1.0"
last_updated: "2026-07-31"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md + docs/security/authorization-capability-contract.md + frontend/src/pages/AssetsPage.tsx"
summary: "Operational support for Asset ownership, governed mutations, Composite impact, and permission-safe evidence."
tags:
  - workflow
  - approvals
  - notifications
  - troubleshooting
  - governance
  - assets
  - departments
  - audit
---

# Asset Register Support (Admin Runbook)

## Overview

Use this runbook to diagnose Asset visibility, ownership, pending-change, relationship, and approval reports. Every active Asset requires an active Business Owner, an active ICT Owner, and an active Owning Department. The same user may hold both owner roles, either owner may belong to another Department, and selecting the Business Owner may fill only an empty Department. These rules preserve business and technical accountability without confusing personal assignment with organizational ownership.

Administrators support identity, sessions, platform health, audit evidence, and safe routing. They do not receive Asset business authority from the platform role and must not resolve approvals or edit Asset data outside the public workflow.

## When To Use This

Use the runbook when an Asset is missing from a register or Department tab, an owner cannot read or edit it, an owner label is unresolved, a relationship action is disabled, a pending banner is unexpected, a Composite proposal is unclear, or an approval notification was not delivered.

Do not use it to decide criticality, choose owners, change an Owning Department, approve a mutation, or force a cascade result. Those are business-governance decisions.

## Preconditions and Safety

Collect the environment, time, active locale, user email, Asset name, expected Department, both expected owners, source route, selected filters, and exact error. Note whether the Asset is Active, Archived, orphaned, or has a pending change.

Preserve live approved truth and relationship evidence. Do not directly change Business Owner, ICT Owner, Department, criticality, CIF, links, or approval rows. A pending Composite proposal can cover several impacted resources; partial repair would violate atomic approval.

## Step-by-Step Procedure

### 1) Reproduce the user’s view

Open the Asset register using the reported URL-backed search, view, filters, grouping, sorting, and page. Record state before clearing anything. When reproducing from Department detail, retain the locked Department filter. The Asset belongs to its Owning Department even when one or both owners work elsewhere.

### 2) Verify row access and owner projections

Determine whether the user has ordinary Asset read authority, is the Business Owner, is the ICT Owner, or heads the Owning Department. Either assigned owner receives record-specific active-row access without broad register, report, archive, or linked-register access. Confirm that owner labels are human-readable and that hidden counterpart records are omitted instead of exposed as raw IDs.

### 3) Check lifecycle, orphan, and pending state separately

Active or Archived is the lifecycle state. Pending change is a proposal state and must appear separately. Deactivation of either owner preserves the historical relationship and creates orphan governance; it does not silently clear or replace the person. Until explicit reassignment succeeds, ordinary mutations that depend on valid accountability can remain locked.

### 4) Identify why approval applies

An Asset is protected when current or proposed CIF is Yes or resulting criticality is Critical. With the fixed protected-Asset scenario enabled, protected creation, business edits, relationship changes, and archive require a non-blank reason and an independent configured Risk Manager or CRO. Restore remains direct for an authorized governance actor.

Any actual change to Business Owner, ICT Owner, or Owning Department uses the fixed accountability-reassignment scenario, even if the Asset is otherwise non-protected. Current and proposed state are evaluated so lowering a classification cannot bypass review.

### 5) Interpret Composite impact

A Process-to-Asset or other cascade-affecting change can create one Composite approval when the Process or downstream Asset consequence is protected. The proposal presents safe Process and Asset impact, locks every governed resource deterministically, and applies all approved consequences atomically. No live relationship or derived Asset value should change while the proposal is pending.

Support must not split a Composite request, directly repair only one resource, or disclose hidden counterpart identities. Authorized viewers receive permission-scoped labels and diffs; redacted resources remain redacted.

### 6) Trace queue and notification evidence

Capture the request identifier, scenario, resource label, requester, status, time, correlation identifier, and safe before/after values. Check Approvals or My Requests separately from event delivery. The two default-on preferences govern actionable requests and outcomes of a user’s own requests; disabling delivery never removes queue visibility or unread work.

### 7) Route the result

Send content and relationship choices to the Asset owners or governance team. Send scenario configuration to the CRO. Send inactive identity or platform session faults to administration. Send reproducible capability, localization, atomicity, or redaction defects to engineering.

## Verification Checklist

- Business Owner, ICT Owner, and Owning Department resolve to canonical labels.
- The same user can hold both owner roles without duplicate-person workarounds.
- Cross-Department owners do not change the Owning Department.
- Row access is record-specific and does not broaden report or linked-register scope.
- Lifecycle, orphan, and pending states are not conflated.
- Live Asset values and links remain unchanged while approval is pending.
- A Composite proposal is represented as one atomic governed request.
- Requester and eligible approver projections do not leak hidden resources.
- Queue visibility is checked independently from notifications.
- Platform administration was not used as Asset business authority.

## Rollback Strategy

Diagnostics are read-only. Remove only temporary support access created through an authorized administrative procedure. If a business proposal is wrong, the requester may cancel it while cancellation is allowed, or an independent resolver may reject it with a reason. Do not delete the request.

An approved Asset mutation is operational truth. Reversing it requires the appropriate new direct action or governed proposal based on the resulting protection and accountability rules. Never reconstruct a previous Composite result with manual database changes.

## Troubleshooting

### Owner can see the Asset but not linked records

This can be correct. Record-specific Asset access does not grant general visibility into Vendors, Processes, Risks, or other linked registers. Confirm each counterpart’s independent visibility.

### Asset remains unchanged after Save

Locate a typed queued response and My Requests item. Protection, accountability reassignment, or protected cascade impact can convert Save into governed intake. The approved live Asset remains unchanged until resolution.

### Composite request contains redacted items

Redaction is expected when the viewer may resolve the proposal but lacks read scope for a counterpart. Use request identifiers and safe labels; do not seek raw IDs or broaden roles for convenience.

### Orphan cannot be cleared

Confirm that the replacement users are active and that explicit reassignment completed through governance. Deactivation evidence must remain preserved until approved reassignment succeeds.

## Escalation and Handoff

Include environment, user and role, Asset name, Business Owner, ICT Owner, Owning Department, lifecycle, orphan state, filters, request identifier, scenario, status, impact resources, correlation identifier, and redacted evidence. State whether this is visibility, ownership, relationship, protected intake, Composite resolution, notification, localization, or projection behavior.

Escalate immediately if pending data affects exports or Department counts, a Composite request partially applies, a requester self-approves, an admin-only identity gains Asset writes, or a hidden counterpart name or numeric ID leaks.

## Related Documentation

- [Approvals support](./approvals.md)
- [Process support](./processes.md)
- [Department support](./departments.md)
- [Risk Hub configuration](./riskhub-config.md)
- [Admin documentation index](./README.md)
