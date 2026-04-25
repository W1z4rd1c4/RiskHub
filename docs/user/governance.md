---
title: Governance: Orphaned Items and Ownership Hygiene
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/GovernancePage.tsx + frontend/src/components/governance/*"
summary: "How to use Governance to detect and resolve orphaned Risks, Controls, and KRIs so ownership, scope, and reporting stay correct."
tags:
  - governance
  - workflow
  - audit
  - troubleshooting
  - access
---
# Governance: Orphaned Items and Ownership Hygiene

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

Use this manual when you need to find records that need an owner, department, or risk link, resolve them safely, and avoid overwriting newer work from another user. It is written for CRO and governance users resolving missing ownership or context, so it focuses on what to do in the app, what to check before you act, and what result to expect after the work is done.

The page is not a technical reference. It explains the everyday operating pattern: start from the governance queue, confirm the orphaned item in quick view, make the smallest safe resolution, and then verify the item leaves the queue.

You will use this area most often for:

- governance overview
- pending orphaned items
- quick view
- resolution modal
- owner and department selection

## Before You Start

Before working in this area, confirm three things. First, make sure you are signed in with the role you normally use for business work. Second, clear any old filters if the list looks incomplete. Third, check whether the record already has pending work in Approvals or Notifications.

If a button or tab is missing, treat that as a normal access signal, not as an error. RiskHub only shows actions that fit your role, scope, record ownership, and the current record state. When an action is unavailable, ask the record owner or your access contact to review it instead of trying to work around the screen.

Have the record name, code, owner, and department ready before asking for help. Those details make support and audit conversations much faster.

## Where To Find It

Primary route: `/governance`

You can usually reach this area from the left sidebar. The Governance page is a queue with summary cards, tabs, a quick-view modal, refresh, and a resolution dialog. Work stays in the queue, quick view, and resolver.

Common navigation pattern:

1. Open Governance.
2. Choose the risk, control, or KRI queue.
3. Review the summary counts and pending rows.
4. Open quick view when you need more context.
5. Use Resolve only after confirming the missing owner, department, or risk link.

## What You Can See and Change

What you can see depends on your role, department scope, and record ownership. A user with broad review responsibility may see more records than a user responsible for one department. A record owner may be able to act on a record even when it is outside the owner’s usual department view.

Typical information in this area includes:

- Orphan type
- Current owner
- Current department
- Missing field
- Candidate risks
- Candidate owners
- Resolution notes

Changes should be practical and easy to explain. If the change affects ownership, scoring, closure, archive state, or other governance-sensitive information, expect a review step in some environments. Read-only users can still use the page for investigation, filtering, and evidence gathering.

## How To Complete Common Tasks

Follow this basic workflow unless your team has a stricter local procedure:

1. Review the current governance queue.
2. Open quick view or Resolve for an orphaned item.
3. Select the right owner or department.
4. Link a kri or control to a risk when required.
5. Submit the resolution and verify it disappears from the queue.

After submitting, verify that the item disappears from the current queue and the summary counts update. If the page reports that the item changed while you were working, refresh and review the current row before trying again.

When linking records, choose only relationships that are useful to another reviewer. A link should explain a real business relationship: a control reduces a risk, a KRI monitors a risk, a vendor contributes to an exposure, or an issue tracks remediation for a specific problem.

## Approvals and Notifications

Governance resolutions are applied only when the record is still in the state you reviewed. If someone else fixed or changed it first, refresh and review the current state before submitting again.

Use resolution notes to explain the business reason, not just the button you clicked. A good note says what changed, why it is appropriate, and what evidence supports the decision. Quick view and Activity Log entries help explain the current context.

If a resolution is stale or rejected, do not immediately resubmit the same change. Refresh the queue, compare the current row with your intended update, and submit a new focused resolution only if it is still needed.

## Finding, Filtering, and Evidence

Use the governance list, quick view, and resolution dialog for cleanup work. The Governance page does not provide an export button; it is designed to help you resolve ownership and linkage gaps safely.

For reliable results, work in this order:

1. Review the pending item type and missing information.
2. Narrow the queue by the visible category or owner context.
3. Open the quick view and confirm the target record still needs action.
4. Resolve the item, refresh the queue, and verify it is gone.

For formal evidence, cite the Activity Log entry that records the change or the governance queue state after refresh.

## Tips and Common Mistakes

- Do not assign ownership to a placeholder person.
- When linking a KRI or control, choose the risk it actually monitors or mitigates.
- Refresh before resolving older queue items.

Common mistakes are usually caused by stale queue data, unclear ownership, duplicate-looking names, or trying to make a broad change when a focused resolution would be easier to review. If something looks wrong, first refresh the queue and confirm the same result in quick view.

## Troubleshooting

If the page is empty, switch tabs and refresh the queue. If the page is missing from the sidebar, your role may not include that work area. If a save fails, read the message, refresh the queue, and check whether another user resolved the item first.

If a related item is missing from the resolver, you may not have access to it or it may no longer be eligible. Ask for the business name or code rather than a technical identifier. For support, include your role, the route you were using, the item name, the action you attempted, and the exact message shown on screen.

## Related Manuals

Start with [Departments](./departments.md), [Risks](./risks.md), [Controls](./controls.md), [Kris](./kris.md), [Activity Log](./activity-log.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
