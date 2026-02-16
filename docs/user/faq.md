---
title: User FAQ and Operational Support
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md and user workflow docs"
summary: "Fast answers for common user-side issues in visibility, approvals, edits, notifications, and documentation navigation."
tags:
  - faq
  - support
  - troubleshooting
---

# User FAQ and Operational Support

## Why can I not see some records my colleague can see?

RiskHub visibility is role/scope-driven. Two users in different departments or ownership chains can see different data by design.

Check:

- your role
- your department scope
- ownership assignment on the entity

## Why did an edit create an approval request instead of saving directly?

You likely changed a sensitive or policy-governed field. This is expected behavior for governance control.

Open `/notifications` or `/approvals` to track the request.

## Why does my dashboard look different from yesterday?

Typical causes:

- changed filters
- changed scope assignments
- archived/restored entities
- newly linked controls/KRIs

Always validate active filters first.

## I clicked a documentation link and expected a different page

Documentation links follow three behaviors:

- `./file.md`: opens another manual in the documentation reader
- `/path`: navigates to the app route
- `https://...`: opens external resource in a new tab

## I submitted a KRI value but still see overdue warnings

Check whether:

- value was saved for correct period
- threshold and period configuration match expectations
- notification queue has stale entries awaiting refresh

## I cannot log control execution

Validate that you have control execution rights and that ownership/assignment context includes your account.

## I need urgent help - what should I provide?

When escalating, include:

- entity ID or request ID
- your role and department context
- exact timestamp
- action attempted
- observed error/message

This reduces triage time significantly.

## Related Documentation

- `./getting-started.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./notifications.md`
