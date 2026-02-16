---
title: Department Lifecycle Administration
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md §2.4 and §3"
summary: "Runbook for creating, updating, and deactivating departments while preserving visibility integrity and ownership continuity."
tags:
  - departments
  - structure
  - governance
---

# Department Lifecycle Administration

## Overview

Departments are structural security boundaries in RiskHub. Department changes directly affect visibility and fallback approval paths.

## Create and Update Standards

For each department record:

- use consistent naming conventions
- assign correct manager linkage
- validate active state and hierarchy context

## Deactivation Runbook

1. Enumerate affected users and owned entities.
2. Resolve ownership dependencies.
3. Confirm no active workflows rely on old mapping.
4. Deactivate department.
5. Validate post-change visibility behavior.

## Ownership Continuity Controls

Department changes must not produce hidden orphan states. Verify:

- risk owners remain resolvable
- control ownership remains actionable
- KRI reporting responsibility is still assigned

## Hierarchy and Reporting Considerations

If hierarchy changes, check dashboard/report effects:

- aggregated counts may shift by department path
- manager-based visibility may change
- historical reporting comparisons may require annotation

Before closing the change request, capture a short post-change note with date, scope, and expected metric side effects. This prevents false incident escalations when teams compare trend lines across a restructuring window.

## Troubleshooting

### Department cannot be safely deactivated

Usually unresolved ownership or active workflow dependencies. Resolve those first.

### Users lost expected visibility after restructure

Validate department assignment + access scope + manager chain.

### Unexpected cross-department access after change

Check ownership exception paths and linked entity inheritance.

## Related Documentation

- `./user-management.md`
- `./reports.md`
