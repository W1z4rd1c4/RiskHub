---
title: Access Management and the Users Directory
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/UsersPage.tsx + frontend/src/authz/policy.ts + backend access APIs"
summary: "How to use /users in directory mode and access mode, understand roles and scopes, and request/verify permission changes safely."
tags:
  - access
  - audit
  - workflow
  - troubleshooting
  - settings
---
# Access Management and the Users Directory

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

Use this manual when you need to find users, understand their access scope, verify directory status, request or perform allowed lifecycle actions, and use break-glass only when justified. It is written for authorized users who review user access, directory status, and lifecycle state, so it focuses on what to do in the app, what to check before you act, and what result to expect after the work is done.

The page is not a technical reference. It explains the everyday operating pattern: start from the Users table, confirm the person and current access state, make the smallest useful change, and then verify the result in the row, status message, notifications, or activity history.

You will use this area most often for:

- users table
- directory mode
- access mode
- Add from AD
- Check AD
- status actions
- break-glass dialog

## Before You Start

Before working in this area, confirm three things. First, make sure you are signed in with the role you normally use for business work. Second, clear any old filters if the list looks incomplete. Third, check whether the record already has pending work in Approvals or Notifications.

If a button or tab is missing, treat that as a normal access signal, not as an error. RiskHub only shows actions that fit your role, scope, record ownership, and the current record state. When an action is unavailable, ask the record owner or your access contact to review it instead of trying to work around the screen.

Have the record name, code, owner, and department ready before asking for help. Those details make support and audit conversations much faster.

## Where To Find It

Primary route: `/users`

You can usually reach this area from the left sidebar. The Users page is a table and workflow surface: use filters, row actions, the access edit modal, Add from AD, Check AD, and break-glass dialogs. Work stays in the table, action buttons, and modals.

Common navigation pattern:

1. Open Users.
2. Clear filters if you are not sure what should be visible.
3. Search by name, email, role, department, directory status, or active state.
4. Review the row and available row actions for the right person.
5. Refresh after directory checks, access edits, lifecycle actions, or break-glass changes.

## What You Can See and Change

What you can see depends on your role, department scope, and record ownership. A user with broad review responsibility may see more records than a user responsible for one department. A record owner may be able to act on a record even when it is outside the owner’s usual department view.

Typical information in this area includes:

- Name
- Email
- Role
- Department
- Manager
- Access scope
- Directory status
- Active state
- Break-glass expiry

Changes should be practical and easy to explain. If the change affects ownership, scoring, closure, archive state, or other governance-sensitive information, expect a review step in some environments. Read-only users can still use the page for investigation, filtering, and evidence gathering.

## How To Complete Common Tasks

Follow this basic workflow unless your team has a stricter local procedure:

1. Search for a user.
2. Review role and scope.
3. Import a directory user.
4. Check directory status for one user or all users.
5. Activate or deactivate only when the action is offered.
6. Temporarily enable break-glass for an auto-disabled external user.

After saving or submitting, verify the result in the Users table and the directory/status message area. Any expected notification or approval item should also be visible. If the page reports that the user changed while you were working, refresh and review the current row before trying again.

When changing access, choose the smallest action that explains the business need. Broad role, scope, lifecycle, or break-glass changes should be easy for another reviewer to understand later.

## Approvals and Notifications

Access changes may be restricted to platform administrators or other authorized roles. If an action is not shown, do not work around it; ask the access owner to review the account.

Use approval notes to explain the business reason, not just the button you clicked. A good note says what changed, why it is appropriate, and what evidence supports the decision. Notifications are reminders and pointers; the Users row and activity history show the current account context.

If you receive a stale or rejected approval, do not immediately resubmit the same change. Find the user row again, compare the current state with your intended update, and submit a new focused change only if it is still needed.

## Finding, Filtering, and Evidence

Use search, role filters, directory status, pagination, and refresh to prepare access review evidence. The Users page does not provide an export button, so treat the filtered screen as a review surface and use approved reporting channels when a formal access-review file is required.

For reliable results, work in this order:

1. Start broad enough to confirm the user exists.
2. Narrow by name, email, role, department, directory status, or active state.
3. Open or review the row details to confirm you have the right person.
4. Refresh after directory checks, lifecycle actions, or break-glass changes before recording the result.

For evidence, record the review date, the user name or email, the visible role/scope, and the action taken. Avoid sharing full user lists unless the review process explicitly requires it.

## Tips and Common Mistakes

- Directory updates should not overwrite local ownership decisions such as department or manager assignments.
- Break-glass is temporary and needs a clear reason.
- After a directory check, refresh the list before reporting the result.

Common mistakes are usually caused by stale filters, unclear ownership, duplicate accounts, or trying to make a broad change when a focused change would be easier to review. If something looks wrong, first refresh the page and confirm the same result in the Users table.

## Troubleshooting

If the page is empty, clear filters and search by a known user name or email. If the page is missing from the sidebar, your role may not include that work area. If a save fails, read the message, refresh the table, and check whether another user changed the account first.

If a user is missing, you may be in the wrong mode, scope, or filter state. Ask for the business name or email rather than a technical identifier. For support, include your role, the route you were using, the user name or email, the action you attempted, and the exact message shown on screen.

## Related Manuals

Start with [Getting Started](./getting-started.md), [Activity Log](./activity-log.md), [Governance](./governance.md), [Notifications](./notifications.md), [Risk Hub](./risk-hub.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
