---
title: Risk Hub Configuration Boundary and Support Model
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "role model and Risk Hub access contracts"
summary: "Defines what platform admins support in Risk Hub configuration and what remains a business-owner responsibility."
tags:
  - configuration
  - boundaries
  - support
---

# Risk Hub Configuration Boundary and Support Model

## Overview

Risk Hub configuration is a business-governance function. Platform admins provide technical enablement and operational support, not domain ownership.

## Admin Scope in Configuration Context

Admins are responsible for:

- access-path reliability
- endpoint availability and auth integrity
- auditability of configuration actions
- incident triage when config operations fail

Admins are not responsible for deciding business threshold values or policy semantics.

## Support Workflow for Config Incidents

1. Confirm affected account role and scope.
2. Validate whether access denial is expected by contract.
3. Check API health/logs for technical failures.
4. Collect evidence package.
5. Handoff to business owner when issue is policy-level.

## Boundary Examples

- "Cannot load config screen" -> admin technical support.
- "Threshold value should be 15 not 20" -> business owner decision.
- "Save denied unexpectedly" -> admin investigates auth/permission path.

## Incident Evidence Checklist

- account identity and role
- request path and payload category
- timestamp and traceable request ID
- relevant logs
- expected vs observed behavior

## Troubleshooting

### Config endpoint works for one account but not another

Check role-based contract first; differences may be intentional.

### Screen opens but save fails

Verify permission path, request payload validity, and backend validation response.

### Business owner requests admin override

Use approved governance path. Avoid unmanaged overrides outside policy.

## Related Documentation

- `./user-management.md`
- `./approvals.md`
- `./reports.md`
