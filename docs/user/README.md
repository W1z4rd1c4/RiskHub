---
title: RiskHub User Manual
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md"
summary: "Production-grade manuals for day-to-day RiskHub usage: navigation, permissions, risk/control/KRI workflows, approvals, exports, and troubleshooting."
tags:
  - overview
  - onboarding
  - workflow
  - approvals
  - notifications
  - troubleshooting
  - settings
---
# RiskHub User Manual

**On this page**
- [Who This Manual Is For](#who-this-manual-is-for)
- [Start Here](#start-here)
- [Manuals by Area](#manuals-by-area)
- [Manuals by Task](#manuals-by-task)
- [How Your Role Affects What You See](#how-your-role-affects-what-you-see)
- [How To Use This Reader](#how-to-use-this-reader)
- [How To Search and Filter Manuals](#how-to-search-and-filter-manuals)
- [How To Ask For Help](#how-to-ask-for-help)
- [What Changed Recently](#what-changed-recently)
- [Related Manuals](#related-manuals)

## Who This Manual Is For

This manual is for everyday RiskHub users: risk owners, control owners, KRI reporters, department leaders, CRO teams, reviewers, and read-only viewers. It explains how to use the product, not how the product is built.

Use it when you need to know where to go, what to click, what to check before acting, and how to explain the result to another person. Platform administrators have a separate admin manual for operational runbooks.

## Start Here

If you are new, read [Getting Started](./getting-started.md), then open [Dashboard](./dashboard.md), [Managing Risks](./risks.md), [Managing Controls](./controls.md), and [KRIs](./kris.md). After that, read [Notifications and Approvals](./notifications.md) so you understand why some changes wait for review.

A good first session is simple: confirm your profile, open the sidebar areas you expect to use, clear filters, open one known record, and check whether linked records and activity history make sense.

Use your first week to build habits rather than speed. When you open a record, read the owner, department, status, linked records, and latest activity before changing anything. When you save a change, stay on the page long enough to confirm whether it applied immediately or moved into a review step. These habits prevent most duplicate edits and support tickets.

## Manuals by Area

- [Dashboard](./dashboard.md): review current posture and reporting signals.
- [Risks](./risks.md): maintain the risk register and related evidence.
- [Controls](./controls.md): manage mitigation controls and execution results.
- [KRIs](./kris.md): define indicators, submit values, and review warnings.
- [Issues](./issues.md): track remediation, exceptions, and closure evidence.
- [Vendors](./vendors.md): manage third-party context and linked work.
- [Departments](./departments.md): review exposure by organizational area.
- [Governance](./governance.md): resolve missing ownership or context.
- [Access Management](./access-management.md): review users, directory status, and allowed lifecycle actions.
- [Activity Log](./activity-log.md): reconstruct who changed what and when.
- [Risk Hub](./risk-hub.md): configure business risk settings when your role allows it.

## Manuals by Task

If you cannot see a page, start with [Getting Started](./getting-started.md) and [Access Management](./access-management.md). If your change did not apply, read [Notifications and Approvals](./notifications.md). If you need evidence, use [Dashboard](./dashboard.md), [Activity Log](./activity-log.md), and the manual for the affected record type.

For third-party work, start with [Vendors](./vendors.md), then follow links to risks, controls, KRIs, or issues. For questionnaire work, start with [Risk Hub](./risk-hub.md) if you send or review questionnaires, and [Managing Risks](./risks.md) if you answer from a risk detail page.

## How Your Role Affects What You See

RiskHub shows pages, records, buttons, and tabs according to your role, department scope, record ownership, and the current state of the record. A missing button often means the action is not available to you right now. A missing record often means the filters or your scope need review.

Do not use another user’s screenshots as proof that your screen is wrong. Different users can legitimately see different data. When in doubt, compare the record name, owner, department, status, and filters.

Your role is not only about whether a page appears. It can also affect which rows are shown, which linked records are visible, whether archive or restore buttons appear, and whether a workflow action is available today. A record can also move in or out of your view when ownership, department, status, or linked context changes.

## How To Use This Reader

Open a manual card, use the section list at the top, and follow links to related manuals. App routes such as `/risks` are shown only when they help you navigate. The reader is designed for task flow: read the section, complete the action, then return to the related manual if the work crosses modules.

The manuals avoid implementation details on purpose. If you need operational or platform support, use the admin runbooks or contact a platform administrator.

Each manual follows the same shape so you can move quickly: what the page helps with, what to check first, where to find it, what you can see or change, common tasks, approval behavior, export guidance, mistakes, troubleshooting, and related manuals. Once you learn one page, the rest should feel familiar.

## How To Search and Filter Manuals

Use tags to narrow the library by topic. Start with All, then select a module tag such as risks, controls, vendors, or access. For audit work, combine module manuals with Activity Log and Notifications.

Search within the page for business words: owner, approval, export, vendor, questionnaire, break-glass, closure, or evidence. Avoid searching for technical identifiers unless a support person specifically asks for them.

## How To Ask For Help

A useful help request includes your role, the page route, the record name or code, the filters used, the action attempted, the exact message shown, and the time it happened. If the issue involves approvals, include whether you checked Approvals and Notifications.

Share only the minimum evidence required. If a screenshot contains personal data or sensitive business information, crop it to the relevant area before sending it through approved channels.

For repeat issues, write down the steps exactly as you performed them. Include whether the behavior happens after refresh, whether another user sees the same thing, and whether the record has pending approvals or notifications. This helps the support team separate a real product issue from a stale filter, missing access, or in-progress workflow.

## What Changed Recently

The manuals now reflect recent RiskHub behavior: directory-backed user lifecycle actions, temporary break-glass for eligible external users, linked risk/control/KRI/vendor workflows, questionnaire compare and clarification flows, governance resolution safety, quarterly comparison snapshot availability, and cleaner admin console log settings behavior.

The wording has also been changed from technical reference language to a user manual style. The goal is to help you complete work confidently without needing to understand internal implementation details.

## Related Manuals

Start with [Getting Started](./getting-started.md), then continue to [Dashboard](./dashboard.md), [Risks](./risks.md), [Controls](./controls.md), [KRIs](./kris.md), and [Notifications](./notifications.md). Use [FAQ](./faq.md) when something does not behave as expected.
