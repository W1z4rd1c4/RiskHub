---
title: Process Register Support (Admin Runbook)
version: "1.0"
last_updated: "2026-07-31"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md + docs/security/authorization-capability-contract.md + frontend/src/pages/ProcessesPage.tsx"
summary: "Operational support for Process access, accountability, governed changes, and evidence without bypassing business authorization."
tags:
  - workflow
  - approvals
  - notifications
  - troubleshooting
  - governance
  - processes
  - departments
  - audit
---

# Process Register Support (Admin Runbook)

## Overview

Use this runbook when a user reports that a Process is missing, cannot be edited, shows a pending change, or has an invalid accountability state. A Process has two canonical responsibility relationships: an active Process Owner and an active Owning Department. The two relationships are independent. The Process Owner may belong to a different Department, and selecting an owner may fill an empty Department but must never replace a Department that the requester already selected.

Platform administration does not grant Process business authority. An administrator may inspect identity, role, session, health, and audit evidence, but must not approve a request, change Process data, or use a database edit to bypass the governed workflow. Escalate policy or content decisions to the accountable business role.

## When To Use This

Use the procedure for access-denied reports, empty search results, unresolved owner labels, orphan indicators, disabled edit actions, an unexpected pending change, or a Process that is absent from a Department workspace. It also applies when a notification did not arrive but the request remains visible in Approvals or My Requests.

Do not use this procedure to decide whether a Process should be CIF, to choose its owner, to change its Owning Department, or to approve a protected mutation. Those decisions belong to the Process governance workflow.

## Preconditions and Safety

Record the environment, time, user email, selected locale, Process F-code, Process name, expected Department, expected action, and visible error. Confirm that the user is active and that the Process is active or intentionally archived. Avoid screenshots containing unrelated personal data.

Preserve approved operational truth. A protected request can leave the live Process unchanged while a proposal is pending. Do not interpret that as a failed save. Never delete an approval row, clear an orphan marker, or edit owner fields directly. Do not give an administrator a business role merely to make a support case pass.

## Step-by-Step Procedure

### 1) Establish the expected record and route

Open the Process register through the normal navigation. Confirm the selected locale and reproduce the same URL-backed search, filters, view, sort, group, and page state reported by the user. Clear filters only after recording them. A Department workspace applies a locked Department filter; an owner assigned from another Department does not move the Process out of its Owning Department.

### 2) Distinguish collection scope from row accountability

Confirm whether the user has ordinary Process read access, is the assigned Process Owner, or is the active head of the Owning Department. Owner assignment grants record-specific access to the active Process; it does not grant broad register administration, archive/restore, or unrestricted access to linked records. A platform administrator has no implicit business access.

### 3) Inspect the accountability state

Verify that the Process displays a human-readable Process Owner and Owning Department, never a raw numeric identifier. If the former owner was deactivated, the relationship remains as evidence and the Process enters orphan governance. Reassignment must be explicit. An unresolved historical identity can be shown as unavailable, but support must not silently substitute another person.

### 4) Classify the pending state

An active Process can show a pending change separately from its Active or Archived lifecycle. While a governed business mutation is pending, ordinary business edits are locked, but approved values remain operational. The requester and eligible approvers may see a permission-scoped proposal. Other readers must not receive hidden field, link, or identity details.

A CIF Process is protected when either current or proposed state is CIF. Protected creation, business updates, relationship changes, and archive require a reason and independent configured Risk Manager or CRO approval when the fixed scenario is enabled. Restore remains a privileged direct action. Any actual change of Process Owner or Owning Department is governed by the separate accountability-reassignment scenario.

### 5) Gather evidence without changing state

Capture the request identifier, status, requester, created time, resource label, scenario label, and the safe before/after projection visible to the reporting user. Check activity and notification evidence by correlation identifier where available. A suppressed notification preference affects event delivery only; it does not remove an item from Approvals or My Requests.

### 6) Hand off to the correct owner

Send business-content questions to the Process Owner or governance team. Send approval eligibility or scenario configuration questions to the CRO. Send identity activation and role problems to platform administration. Send a reproducible API, UI, localization, or projection defect to engineering with the smallest evidence bundle.

## Verification Checklist

- The user is active and is using the expected locale and environment.
- Search and filters reproduce the reported Process result.
- The displayed Process Owner and Owning Department match canonical relationships.
- A cross-Department Process Owner does not alter the Owning Department.
- The pending change is distinct from lifecycle state.
- Approved Process values remain unchanged while a request is pending.
- Approvals or My Requests contains the request for an authorized viewer.
- No raw identifier or hidden linked-record label is exposed.
- Notification suppression is not mistaken for a missing workflow item.
- No administrative bypass or business-role escalation was used.

## Rollback Strategy

This support procedure makes no business-data change, so its normal rollback is to close diagnostic tabs and remove any temporary support-only access granted through an approved administrative process. If an administrator changed identity or session state during a separately authorized recovery, reverse only that specific administrative change and record the reason.

Never “roll back” a Process by editing database rows or deleting a proposal. The requester may cancel an eligible pending request. A rejected or stale request remains evidence. An approved change requires a new governed proposal if the business needs another value.

## Troubleshooting

### Process is visible at top level but not under a Department

Compare the canonical Owning Department with the Department workspace. The workspace is selected by organizational ownership, not by the Process Owner’s home Department. Confirm that the locked filter was not confused with an ordinary removable filter.

### Edit is disabled for the assigned owner

Confirm that the Process is active, the assignment is current, no orphan is unresolved, and no pending change locks business edits. Then verify the backend-projected row capability. Do not infer permission from a visible button alone.

### Save returns a request instead of changed data

Check whether the Process is protected, the mutation changes accountability, or a protected linked consequence is included. Confirm that a reason was supplied and locate the new request in My Requests. This is successful governed intake, not a direct update.

### No notification arrived

Check the user’s two governed-request notification preferences and delivery evidence. Then confirm queue visibility independently. Preferences never hide required work counts or approval state.

## Escalation and Handoff

Provide the environment, user, role, Process F-code and name, Owning Department, expected action, exact filters, URL, request identifier, status, scenario, timestamp, correlation identifier, and a redacted screenshot. State whether the problem is access scope, accountability, protected mutation intake, approval resolution, notification delivery, localization, or display.

Escalate immediately if approved truth changes before approval, self-approval succeeds, a pending creation appears in operational exports or counts, hidden identities leak, or an administrator can mutate Process business data solely because of the platform role.

## Related Documentation

- [Approvals support](./approvals.md)
- [Department support](./departments.md)
- [Risk Hub configuration](./riskhub-config.md)
- [Admin onboarding](./getting-started.md)
- [Admin documentation index](./README.md)
