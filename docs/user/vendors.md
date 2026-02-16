---
title: Managing Vendors
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "vendor endpoints and issue/remediation workflows"
summary: "Operational guide for vendor lifecycle governance, status tracking, and evidence-based updates aligned with access and reporting rules."
tags:
  - vendors
  - third-party
  - governance
---

# Managing Vendors

## Overview

Vendor management supports third-party risk oversight, lifecycle tracking, and reporting readiness.

Primary route: `/vendors`

## Core Vendor Workflow

1. Create or open a vendor profile.
2. Validate ownership and department context.
3. Maintain critical attributes (status, services, key risk factors).
4. Link remediation/issue items where needed.
5. Export scoped views for governance review.

## Data Quality Requirements

Each active vendor record should include:

- clear service/process context
- accountable owner
- current operational status
- relevant risk and remediation context

Avoid placeholder vendor records that cannot be used in audit or committee review.

## Lifecycle Operations

Common lifecycle actions:

- onboarding new vendor
- status transition (active/inactive)
- archive/restore operations
- periodic review updates

Each lifecycle action should be backed by clear notes and timestamped changes.

## Governance Tips

- keep vendor records aligned with issue/remediation state
- verify department fallback behavior where vendor department is unset
- use exports for review meetings instead of ad-hoc screenshots

## Troubleshooting

### I cannot edit a vendor

Check write permissions and scope, then confirm entity ownership constraints.

### Vendor data appears missing in export

Exports are scope-aware. Validate filters and authorization context.

### Related issues do not appear

Confirm link integrity and whether issue visibility is limited by role or department.

## Related Documentation

- `./dashboard.md`
- `./notifications.md`
- `./faq.md`
