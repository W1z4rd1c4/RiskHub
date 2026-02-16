---
title: Managing Risks
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §2.1, §6, §7"
summary: "Operational guide for creating, updating, and governing risks with approval-aware edits and cross-department ownership constraints."
tags:
  - risks
  - workflow
  - approvals
---

# Managing Risks

## Overview

The risk register is the central operating surface for identifying, scoring, and governing organizational risk exposure.

Primary app route: `/risks`

## Who Can Do What

Capabilities depend on role and assigned permissions:

- read access: scoped by role/scope + ownership exceptions
- create/edit access: restricted by permission grants
- sensitive edits: may require approval before final application

Always assume backend rules are authoritative.

## End-to-End Risk Workflow

1. Open `/risks` and filter to your operational scope.
2. Select an existing risk or create a new one.
3. Complete required fields with business-quality descriptions.
4. Confirm owner and department assignments are intentional.
5. Link relevant controls.
6. Save and verify whether a workflow request was generated.
7. Track follow-up in `/notifications` or `/approvals`.

## Sensitive Field Decision Rules

Treat these fields as governance-sensitive:

- owner assignment
- department assignment
- category changes
- priority changes

If you modify one of these, expect policy-driven approval behavior.

## Quality Standards for Risk Records

A production-quality risk record should include:

- clear threat statement
- realistic probability/impact values
- defined owner accountability
- control linkage with practical mitigation relevance
- current status and action context

## Common Operational Mistakes

- changing multiple sensitive fields without explanatory notes
- assigning owners without confirming workload/scope
- leaving controls unlinked after major risk updates
- assuming cross-department visibility without ownership basis

## Troubleshooting

### Risk not visible to expected user

Validate role scope first, then ownership assignment, then department mapping.

### Save succeeded but values unchanged

Check if the edit entered approval workflow instead of immediate apply.

### Cross-department ownership confusion

Ownership may grant visibility exception even when department differs. Confirm ownership chain explicitly.

## Related Documentation

- `./controls.md`
- `./kris.md`
- `./notifications.md`
- `./dashboard.md`
