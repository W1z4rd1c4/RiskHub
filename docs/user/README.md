---
title: RiskHub User Documentation
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md"
summary: "Complete user guide for daily risk operations, workflow approvals, dashboards, vendor oversight, and in-app documentation navigation."
tags:
  - overview
  - onboarding
  - workflows
---

# RiskHub User Documentation

This documentation set is the production user manual for all non-admin roles. It is written for real day-to-day work in RiskHub, not as product marketing copy.

## Who Should Use This Library

Use this library if your role is one of the following:

- CRO
- Risk Manager
- Department Head
- Employee
- Compliance, Legal, Internal Audit, Actuarial
- Viewer (read-only usage)

If your account is a platform administrator (`admin`), use the admin documentation set instead: `../admin/README.md`.

## How to Navigate Quickly

The in-app documentation reader supports direct navigation links between documents. For example:

- onboarding flow: `./getting-started.md`
- core risk operations: `./risks.md`
- control lifecycle and execution logging: `./controls.md`
- KRI and thresholds: `./kris.md`
- workflow and notifications: `./notifications.md`
- dashboard and exports: `./dashboard.md`
- vendor governance: `./vendors.md`
- quick support answers: `./faq.md`

You can also jump to app pages from docs when links use app routes:

- risk register: `/risks`
- controls catalog: `/controls`
- KRI list: `/kris`
- dashboard: `/`
- settings: `/settings`

## How the Content Is Structured

Each user manual follows the same production format:

1. **Overview**: what the feature is for and where it lives in the app.
2. **Role and permission context**: who can read/write/approve.
3. **Core workflows**: step-by-step operational flow.
4. **Decision rules**: policy constraints, approval triggers, and scope boundaries.
5. **Troubleshooting**: what to check before escalating.
6. **Related docs**: direct links to adjacent workflows.

## What This Library Guarantees

- Content aligns with backend authorization and workflow behavior.
- Internal links are maintained and validated by docs contract checks.
- Czech and English files stay in parity at filename and workflow level.
- Metadata (`version`, `last_updated`, `source_of_truth`) is explicit per document.

## Recommended Reading Order

- Start with `./getting-started.md`.
- Continue with `./risks.md`, `./controls.md`, and `./kris.md`.
- Then read `./notifications.md` and `./dashboard.md`.
- If you manage third-party exposure, include `./vendors.md`.
- Keep `./faq.md` open as your operational quick-reference.
