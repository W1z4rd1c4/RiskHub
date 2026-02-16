---
title: Managing Controls
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §2.2, §4, §7"
summary: "Guide to control lifecycle management, control-risk linkage, and execution logging with approval and scope safeguards."
tags:
  - controls
  - execution
  - governance
---

# Managing Controls

## Overview

Controls convert policy into repeatable execution. This guide covers control creation, ownership, linkage, and evidence-based execution logging.

Primary app route: `/controls`

## Control Lifecycle

1. Define control objective and scope.
2. Set owner and department context.
3. Configure frequency and execution expectations.
4. Link to relevant risks.
5. Operate through execution logs and updates.
6. Adjust via approval-aware governance when sensitive fields change.

## Creating Controls Correctly

When creating a control:

- write an objective that can be tested in real operations
- assign practical execution frequency
- select owner with confirmed accountability
- link only to risks the control actually mitigates

Poor linkage quality causes reporting distortion and approval noise.

## Execution Logging Standards

Each execution event should include:

- execution date/time
- outcome/result
- supporting evidence (where applicable)
- exception notes if control failed or partially executed

Avoid low-information logs such as “done” without context.

## Control Owner and Visibility Rules

Control ownership can cross department boundaries under policy constraints. Visibility and edit rights are still enforced by backend permission and scope checks.

## Sensitive Edit Governance

Changes to ownership and department are sensitive and may trigger approvals, especially in high-risk linkage contexts.

Before saving sensitive updates:

- summarize business reason
- notify impacted stakeholders
- verify downstream reporting impact

## Troubleshooting

### I cannot log execution

Validate `controls:execute` capability and ownership/assignment context.

### Linked risk is missing in detail view

Check scope + ownership inheritance and refresh linkage state.

### Control edit created approval request unexpectedly

Likely sensitive-field or high-impact change path. Check workflow status.

## Related Documentation

- `./risks.md`
- `./notifications.md`
- `./dashboard.md`
