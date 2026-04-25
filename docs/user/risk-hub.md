---
title: Risk Hub (CRO Configuration Workspace)
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/RiskHubPage.tsx + frontend/src/components/riskhub/*"
summary: "CRO manual for configuring RiskHub taxonomy, thresholds, approval scenarios, roles, departments, and sending risk questionnaires safely."
tags:
  - riskhub
  - settings
  - workflow
  - approvals
  - notifications
  - troubleshooting
---
# Risk Hub (CRO Configuration Workspace)

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

Use this manual when you need to manage the business settings that shape risk classification, questionnaires, roles, departments, and operating expectations. It is written for CRO users configuring business risk management settings, so it focuses on what to do in the app, what to check before you act, and what result to expect after the work is done.

The page is not a technical reference. It explains the everyday operating pattern: start from the right Risk Hub tab, confirm the configuration or questionnaire item, make the smallest useful change, and then verify the saved state in the panel.

You will use this area most often for:

- risk types
- questionnaires
- roles
- departments
- configuration panels
- send questionnaire flow

## Before You Start

Before working in this area, confirm three things. First, make sure you are signed in with the role you normally use for business work. Second, clear any old filters if the list looks incomplete. Third, check whether the record already has pending work in Approvals or Notifications.

If a button or tab is missing, treat that as a normal access signal, not as an error. RiskHub only shows actions that fit your role, scope, record ownership, and the current record state. When an action is unavailable, ask the record owner or your access contact to review it instead of trying to work around the screen.

Have the record name, code, owner, and department ready before asking for help. Those details make support and audit conversations much faster.

## Where To Find It

Primary route: `/risk-hub`

You can usually reach this area from the left sidebar. Risk Hub is a tabbed workspace for configuration panels and questionnaire workflows. Work stays inside the active tab, row, modal, or questionnaire action.

Common navigation pattern:

1. Open Risk Hub.
2. Choose the relevant tab: risk types, settings, approval rules, roles, departments, or questionnaires.
3. Clear filters or search fields where the panel provides them.
4. Open the row, modal, or questionnaire action offered by that panel.
5. Verify the saved state before leaving the tab.

## What You Can See and Change

What you can see depends on your role, department scope, and record ownership. A user with broad review responsibility may see more records than a user responsible for one department. A record owner may be able to act on a record even when it is outside the owner’s usual department view.

Typical information in this area includes:

- Risk type labels
- Questionnaire templates
- Assignees
- Reviewers
- Role names
- Department names
- Status and due dates

Changes should be practical and easy to explain. If the change affects ownership, scoring, closure, archive state, or other governance-sensitive information, expect a review step in some environments. Read-only users can still use the page for investigation, filtering, and evidence gathering.

## How To Complete Common Tasks

Follow this basic workflow unless your team has a stricter local procedure:

1. Review risk taxonomy.
2. Send questionnaires to owners.
3. Monitor questionnaire status.
4. Review clarifications.
5. Maintain role intent.
6. Keep department ownership clean.

After saving or submitting, verify the result in the same Risk Hub panel and any expected notification or questionnaire status. If the page reports that the item changed while you were working, refresh and review the current row before trying again.

When linking records, choose only relationships that are useful to another reviewer. A link should explain a real business relationship: a control reduces a risk, a KRI monitors a risk, a vendor contributes to an exposure, or an issue tracks remediation for a specific problem.

## Approvals and Notifications

Risk Hub changes can affect many users. Use focused changes, review the visible impact, and check approval or notification queues when configuration changes are sensitive.

Use approval notes to explain the business reason, not just the button you clicked. A good note says what changed, why it is appropriate, and what evidence supports the decision. Notifications are reminders and pointers; Risk Hub panels and Activity Log entries show the current context.

If you receive a stale or rejected approval, do not immediately resubmit the same change. Reopen the relevant Risk Hub panel, compare the current state with your intended update, and submit a new focused change only if it is still needed.

## Finding, Filtering, and Evidence

Use Risk Hub summaries, status tables, and linked questionnaire views for operating reviews. Risk Hub is a configuration workspace and does not provide a general export button.

For reliable results, work in this order:

1. Open the relevant configuration panel or questionnaire view.
2. Filter or scan to the role, department, risk type, or questionnaire batch you need.
3. Open the relevant row, modal, or questionnaire action before changing settings.
4. Verify the saved state and any notifications created by the workflow.

For formal evidence, use questionnaire history, the saved panel state, or Activity Log rather than expecting a Risk Hub export from this page.

## Tips and Common Mistakes

- Keep role names understandable to business users.
- Do not send questionnaires until owners and due dates are clear.
- Use clarification requests when an answer is incomplete instead of rejecting the whole assessment too early.

Common mistakes are usually caused by stale panel data, unclear ownership, duplicate-looking names, or trying to make a broad change when a focused change would be easier to review. If something looks wrong, first refresh the page and confirm the same result in the active panel.

## Troubleshooting

If the page is empty, clear filters and search by a known record name. If the page is missing from the sidebar, your role may not include that work area. If a save fails, read the message, refresh the record, and check whether another user changed it first.

If a linked record is missing, you may not have access to that related item. Ask for the business name or code rather than a technical identifier. For support, include your role, the route you were using, the record name, the action you attempted, and the exact message shown on screen.

## Related Manuals

Start with [Risks](./risks.md), [Notifications](./notifications.md), [Governance](./governance.md), [Access Management](./access-management.md), [Departments](./departments.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
