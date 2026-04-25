---
title: Getting Started with RiskHub
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md + frontend onboarding routes"
summary: "First-day onboarding manual for non-admin users: scope validation, navigation, workflow readiness, and how to avoid the most common early mistakes."
tags:
  - onboarding
  - overview
  - workflow
  - notifications
  - troubleshooting
---
# Getting Started with RiskHub

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

Use this manual when you need to get comfortable with the workspace, confirm what you can see, and learn the safest first steps before changing business records. It is written for new RiskHub users, so it focuses on what to do in the app, what to check before you act, and what result to expect after the work is done.

The page is not a technical reference. It explains the everyday operating pattern: start from the right screen, confirm the item you intend to review or update, make the smallest useful change, and then verify the result in the visible list, panel, modal, notification, or activity history.

You will use this area most often for:

- Dashboard
- Risks
- Controls
- KRIs
- Vendors
- Approvals
- Settings

## Before You Start

Before working in this area, confirm three things. First, make sure you are signed in with the role you normally use for business work. Second, clear any old filters if the list looks incomplete. Third, check whether the record already has pending work in Approvals or Notifications.

If a button or tab is missing, treat that as a normal access signal, not as an error. RiskHub only shows actions that fit your role, scope, record ownership, and the current record state. When an action is unavailable, ask the record owner or your access contact to review it instead of trying to work around the screen.

Have the record name, code, owner, and department ready before asking for help. Those details make support and audit conversations much faster.

## Where To Find It

Primary route: `/settings`

You can usually reach core areas from the left sidebar. Different modules use different patterns: tables, tabs, cards, modals, drilldowns, or separate pages. Use the controls that are visible on the page you are actually viewing.

Common navigation pattern:

1. Open the list page.
2. Clear filters if you are not sure what should be visible.
3. Search by name, owner, vendor, or department.
4. Open a row, card, modal, drilldown, or separate page only when the module offers one.
5. Review linked records and recent activity before changing anything.

## What You Can See and Change

What you can see depends on your role, department scope, and record ownership. A user with broad review responsibility may see more records than a user responsible for one department. A record owner may be able to act on a record even when it is outside the owner’s usual department view.

Typical information in this area includes:

- Your profile details
- Language and theme preferences
- The modules visible in the sidebar
- Documentation manuals for your role

Changes should be practical and easy to explain. If the change affects ownership, scoring, closure, archive state, or other governance-sensitive information, expect a review step in some environments. Read-only users can still use the page for investigation, filtering, and evidence gathering.

## How To Complete Common Tasks

Follow this basic workflow unless your team has a stricter local procedure:

1. Sign in and confirm your profile.
2. Open the main work areas.
3. Check whether a missing page is caused by your role or by filters.
4. Learn where approvals and notifications appear.

After saving or submitting, verify the result on the page you used: the list, table, panel, modal, notification, or activity history should show the expected state. If the page reports that the item changed while you were working, refresh and review the current state before trying again.

When linking records, choose only relationships that are useful to another reviewer. A link should explain a real business relationship: a control reduces a risk, a KRI monitors a risk, a vendor contributes to an exposure, or an issue tracks remediation for a specific problem.

## Approvals and Notifications

Most first-day actions are read-only. When you later edit risks, controls, KRIs, issues, or vendor records, some sensitive changes may wait for approval before they appear as final changes.

Use approval notes to explain the business reason, not just the button you clicked. A good note says what changed, why it is appropriate, and what evidence supports the decision. Notifications are reminders and pointers; the current page and Activity Log help reconstruct the context.

If you receive a stale or rejected approval, do not immediately resubmit the same change. Return to the page where the work started, compare the current state with your intended update, and submit a new focused change only if it is still needed.

## Finding, Filtering, and Evidence

Use this page to learn how to find information, clear filters, and confirm whether your role gives you the expected view. The onboarding and Settings surfaces do not provide export controls.

For reliable results, work in this order:

1. Open the module you need from the sidebar.
2. Clear filters before deciding that data is missing.
3. Narrow the view by owner, department, status, vendor, or date where those filters exist.
4. Confirm names, codes, owners, and status on the list, panel, modal, drilldown, or separate page that the module provides before you act.

For evidence during onboarding, record the route, visible role, filters used, and the record name or code you checked.

## Tips and Common Mistakes

- Use names, codes, and owners when asking for help.
- If a module is missing, check your role before changing filters.
- Keep the manuals open while learning a new workflow.

Common mistakes are usually caused by stale filters, unclear ownership, duplicate-looking names, or trying to make a broad change when a focused change would be easier to review. If something looks wrong, first refresh the page and confirm the same result in the visible list, panel, or modal.

## Troubleshooting

If the page is empty, clear filters and search by a known record name. If the page is missing from the sidebar, your role may not include that work area. If a save fails, read the message, refresh the record, and check whether another user changed it first.

If a linked record is missing, you may not have access to that related item. Ask for the business name or code rather than a technical identifier. For support, include your role, the route you were using, the record name, the action you attempted, and the exact message shown on screen.

## Related Manuals

Start with [Dashboard](./dashboard.md), [Risks](./risks.md), [Controls](./controls.md), [Notifications](./notifications.md), [Access Management](./access-management.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
