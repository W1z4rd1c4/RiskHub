---
title: RiskHub User Documentation
version: "2.1"
last_updated: "2026-03-07"
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

# RiskHub User Documentation

Back to tree: <a href="../DOCUMENTATION_TREE.md">/Users/stefanlesnak/Antigravity/Risk App 2/docs/DOCUMENTATION_TREE.md</a>

This library is the production user manual for all non-admin roles. It is written for real day-to-day operations: what to do, where to do it, and how to diagnose problems when the app behaves differently than you expect.

**On this page**
- [Who Should Use This Library](#who-should-use-this-library)
- [What You Can Expect From These Manuals](#what-you-can-expect-from-these-manuals)
- [Quick Start (30 Minutes)](#quick-start-30-minutes)
- [Library Map (By Sidebar Module)](#library-map-by-sidebar-module)
- [Library Map (By Common Workflows)](#library-map-by-common-workflows)
- [How Permissions and Scope Affect What You See](#how-permissions-and-scope-affect-what-you-see)
- [How To Use Links Inside Manuals](#how-to-use-links-inside-manuals)
- [How To Use Tags and Filters In The Reader](#how-to-use-tags-and-filters-in-the-reader)
- [How To Report Documentation Issues](#how-to-report-documentation-issues)
- [Change Policy and Source of Truth](#change-policy-and-source-of-truth)
- [Related Documentation](#related-documentation)

## Who Should Use This Library

Use this library if your role is one of the following:

- CRO
- Risk Manager
- Department Head
- Employee
- Compliance, Legal, Internal Audit, Actuarial
- Viewer (read-only usage)

If your account is a platform administrator (role `admin`), you will see a different documentation set in the in-app reader. This library remains focused on business operations, not platform administration. Admins should expect business routes such as `/governance` and `/activity-log` to remain unavailable.

## What You Can Expect From These Manuals

Every module manual in `docs/user/*.md` is designed to answer the same operational questions:

- **What is this module for?** (the business intent)
- **Where do I find it?** (routes and navigation)
- **Why can’t I see it?** (permissions and scope)
- **What are the key fields?** (what matters in practice)
- **How do I do the common tasks end-to-end?** (step-by-step workflows)
- **What happens when approvals are required?** (and where to track them)
- **How do I export evidence safely?**
- **What are the most common mistakes and their fixes?**

These manuals are intentionally **text-first** (no screenshots) so they stay maintainable and can be kept accurate across languages.

## Quick Start (30 Minutes)

If you are new to RiskHub, this path gets you productive quickly:

1. Start with [Getting Started](./getting-started.md) and complete the “first login checklist”.
2. Open the three core operating modules:
   - [Dashboard](./dashboard.md) (signals and summary)
   - [Risks](./risks.md) (the register)
   - [Controls](./controls.md) (mitigation and execution evidence)
3. Learn workflow behavior next:
   - [Workflow, Approvals, Notifications](./notifications.md)
4. If your role includes monitoring and reporting:
   - [KRIs](./kris.md)
5. If your org tracks remediation work:
   - [Issues / Findings](./issues.md)
6. If you manage third parties:
   - [Vendors](./vendors.md)

Keep [FAQ](./faq.md) open while learning. It is the quickest route to “why can’t I see X?” and “why didn’t my change apply?” answers.

## Library Map (By Sidebar Module)

This table maps what you see in the sidebar to the canonical manual page.

| Sidebar / area | Primary route | Canonical manual | What you will learn | Tags |
|---|---:|---|---|---|
| Dashboard | `/` | [Dashboard](./dashboard.md) | Trends, pressure signals, and export-friendly views | `overview`, `exports`, `audit` |
| Approvals + Notifications | `/approvals`, `/notifications` | [Workflow, Approvals, Notifications](./notifications.md) | Approval lifecycle, “pending change” behavior, and how to stay unblocked | `workflow`, `approvals`, `notifications` |
| Controls | `/controls` | [Managing Controls](./controls.md) | Control design, ownership, execution logging, and evidence | `controls`, `workflow`, `exports` |
| Risks | `/risks` | [Managing Risks](./risks.md) | Risk register hygiene, scoring, ownership, and linkage | `risks`, `workflow`, `approvals` |
| Issues / Findings (if enabled) | `/issues` | [Managing Issues](./issues.md) | Remediation tracking, linking to risks/controls, and closure discipline | `issues`, `workflow`, `exports` |
| KRIs | `/kris` | [Managing KRIs](./kris.md) | Thresholds, value recording rules, breach signals | `kri`, `notifications`, `exports` |
| Vendors (if enabled) | `/vendors` | [Managing Vendors](./vendors.md) | Core third-party register, risk-detail-style linked sections, create-from-vendor risk/control flows, exports | `vendors`, `workflow`, `exports` |
| Departments | `/departments` | [Departments](./departments.md) | Exposure by org unit, drill-down, and responsibility patterns | `departments`, `workflow`, `exports` |
| Governance (CRO-only, non-admin) | `/governance` | [Governance](./governance.md) | Orphans, ownership gaps, and governance resolution patterns | `governance`, `audit`, `troubleshooting` |
| Activity Log (permission-gated, non-admin) | `/activity-log` | [Activity Log](./activity-log.md) | “Who changed what”, timeline reconstruction, and audit evidence | `activity-log`, `audit`, `exports` |
| Users / Access Management (role-gated) | `/users` | [Access Management](./access-management.md) | Visibility rules, role/scope interpretation, and access checks | `access`, `audit`, `settings` |
| Risk Hub (CRO only) | `/risk-hub` | [Risk Hub](./risk-hub.md) | Governance configuration concepts and safe operating patterns | `riskhub`, `settings`, `approvals` |
| Settings | `/settings` | [Getting Started](./getting-started.md) | Preferences (language/theme) and documentation navigation | `settings`, `onboarding`, `workflow` |

## Library Map (By Common Workflows)

If you prefer to learn by task, use this index.

- “I can’t see a module / route I should have”:
  - start with [Getting Started](./getting-started.md#roles-scope-and-visibility)
  - then use [Access Management](./access-management.md#troubleshooting)
- “My change didn’t apply / it looks stuck”:
  - [Workflow, Approvals, Notifications](./notifications.md#approvals-and-notifications-behavior)
- “Create a high-quality risk record, fast”:
  - [Managing Risks](./risks.md#core-workflows)
- “Record control execution evidence”:
  - [Managing Controls](./controls.md#core-workflows)
- “Record a KRI value and understand approval gating”:
  - [Managing KRIs](./kris.md#core-workflows)
- “Create a remediation item linked to a risk/control”:
  - [Managing Issues](./issues.md#core-workflows)
- “Export an audit-ready pack”:
  - [Dashboard](./dashboard.md#filters-views-and-exports)
  - [Managing Vendors](./vendors.md#filters-views-and-exports)
  - [Activity Log](./activity-log.md#filters-views-and-exports)
- “Figure out who changed something, and when”:
  - [Activity Log](./activity-log.md)

## How Permissions and Scope Affect What You See

Most “missing feature” problems are caused by one of these three factors:

1. **Permission**: your account lacks `resource:action` access (for example `vendors:read`).
2. **Scope**: your access scope limits default visibility (`global`, `department`, or `manager`).
3. **Ownership exception**: ownership can expand visibility beyond your department scope for specific records.

Practical rules:

- If a sidebar item is missing (for example Issues), check permissions first.
- If the sidebar item exists but lists look empty, check scope and filters.
- If you can open a detail page from a link but can’t find it via lists, it is often a scope boundary plus an ownership exception.
- If you are logged in as platform admin, missing business modules is expected. Use the admin documentation library and `/admin` surfaces instead.

When in doubt, reproduce with:

- “All” filters cleared
- a known record ID or name
- and a second user account with broader scope (if available)

## How To Use Links Inside Manuals

RiskHub manuals use deterministic link conventions so navigation is predictable:

- [Getting Started](./getting-started.md) opens another manual inside the reader.
- App route examples should be shown as code, for example: `` `/approvals` ``.
- `[#anchor](#heading-id)` scrolls within the current manual.
- External links use `https://...` and open in a new tab.

If a link takes you to an unexpected place, treat it as a documentation bug and report it (see below).

## How To Use Tags and Filters In The Reader

The documentation library supports fast browsing by tags.

Recommended usage:

1. Start with `All` to learn what exists.
2. Filter by a module tag (for example `risks`, `controls`, `vendors`).
3. Add a workflow tag (for example `approvals`, `exports`) to narrow to a “task slice”.

If you are responsible for audits, the fastest path is usually:

- filter by `audit`
- then add `exports` or a module tag, depending on what evidence you need

## How To Report Documentation Issues

When reporting a docs issue, include enough context to reproduce it:

- manual name + section heading (or the URL hash if present)
- the link target you clicked
- your role and scope (global/department/manager)
- whether you used English or Czech locale

If the issue is “this behavior is wrong”, include:

- expected behavior (in one sentence)
- observed behavior
- any error message text

## Change Policy and Source of Truth

Documentation is treated as a product surface:

- Manuals are versioned and time-stamped (`version`, `last_updated`).
- The `source_of_truth` field points to the canonical code or business-logic section.
- English and Czech manuals are kept in filename parity and functional parity.

If you see a mismatch between a manual and actual behavior, assume the app is correct and the manual is stale, then report the issue with reproduction steps.

## Related Documentation

- First login and safe habits: [Getting Started](./getting-started.md)
- Core operational modules: [Risks](./risks.md), [Controls](./controls.md), [KRIs](./kris.md)
- Workflow behavior: [Workflow, Approvals, Notifications](./notifications.md)
- Admin-only documentation is intentionally not linked here (different audience library).

## What This Library Guarantees

- Content aligns with backend authorization and workflow behavior.
- Internal links are maintained and validated by docs contract checks.
- Czech and English files stay in parity at filename and workflow level.
- Metadata (`version`, `last_updated`, `source_of_truth`) is explicit per document.

## Recommended Reading Order

- Start with `./getting-started.md`.
- Continue with `./risks.md`, `./controls.md`, and `./kris.md`.
- Then read `./notifications.md` and `./dashboard.md`.
- If you manage third-party exposure, include `./vendors.md` for vendor catalog operations, grouped drill-down views, and vendor-context risk/control creation and linking workflows.
- Keep `./faq.md` open as your operational quick-reference.
