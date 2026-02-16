---
title: RiskHub Platform Administration Documentation
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md §1.5 and admin endpoints"
summary: "Production runbook library for platform administrators covering access governance, org structure maintenance, observability, and admin support operations."
tags:
  - overview
  - administration
  - runbook
---

# RiskHub Platform Administration Documentation

This is the canonical admin manual for platform operators. It is not a business user guide.

## Audience and Boundary

This library is for `admin` role users who manage platform integrity, access governance, and operational support surfaces.

It does **not** cover business ownership decisions. Business user workflows are in `../user/README.md`.

## Admin Responsibilities Covered Here

- access governance and user-role maintenance
- department structure lifecycle operations
- workflow observability and support triage
- reporting and evidence extraction for operational incidents
- Risk Hub configuration boundary support

## How to Use This Library

Read in this order for new admins:

1. `./getting-started.md`
2. `./user-management.md`
3. `./departments.md`
4. `./approvals.md`
5. `./reports.md`
6. `./riskhub-config.md`

## Operating Principles

- least privilege on every change
- explicit auditability of admin actions
- no hidden manual overrides outside controlled flows
- escalate domain decisions to business owners

## Service-Level Expectations

This admin library assumes platform operators work with clear response targets:

- acknowledge high-impact access incidents quickly
- provide reproducible evidence for each conclusion
- separate technical root-cause from policy disputes
- hand off business decisions with clean context, not assumptions

Operational quality is measured by traceability and predictability, not by speed alone.

## Escalation and Handoff

If an issue crosses from platform operations into business policy, handoff must be explicit. Include the incident context, affected entities, attempted technical checks, and outstanding decision points. This keeps ownership clear, prevents duplicate investigation, and ensures admin actions stay inside platform-governance boundaries.

## Navigation and Linking

In-app docs links support deterministic behavior:

- `./file.md`: open another admin document inside reader
- `/path`: navigate app route
- `https://...`: open external source in a new tab

## Related Sets

- user docs (non-admin): `../user/README.md`
- Czech admin parity: `../admin-cs/README.md`
