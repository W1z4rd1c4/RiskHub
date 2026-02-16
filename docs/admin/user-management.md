---
title: User and Access Governance Runbook
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "access-management endpoints and RBAC policy"
summary: "Operational runbook for user lifecycle, role changes, scope governance, and auditable access administration."
tags:
  - users
  - access
  - rbac
---

# User and Access Governance Runbook

## Overview

This runbook covers identity lifecycle and access governance for platform administrators.

Primary route: `/users` and access-management surfaces.

## High-Impact Operations

Treat these operations as high risk:

- role reassignment
- scope expansion to global
- department reassignment for active owners
- manager-chain changes affecting delegated visibility

## Standard Change Workflow

1. Locate user and review current access profile.
2. Confirm requested change source and approval context.
3. Apply minimal change.
4. Verify effective permissions after save.
5. Check audit log entry and timestamp.

## Deactivation Procedure

Before deactivation:

- identify owned entities and pending workflow items
- ensure ownership handoff is complete
- confirm no orphaned governance responsibilities remain

Then deactivate and verify no unintended access artifacts remain.

## Safe Rollback Strategy

If a change causes scope/permission regression:

- revert to last known-good role/scope immediately
- capture incident context
- run impact review for affected entities and approvals

## Troubleshooting

### User reports missing data after role change

Check scope first, then department assignment, then ownership exceptions.

### User can access too much data

Likely scope escalation or role drift. Reconcile effective permissions against policy.

### Access change not reflected immediately

Confirm save completed, then re-authenticate to refresh session-bound claims.

## Related Documentation

- `./departments.md`
- `./approvals.md`
- `./reports.md`
