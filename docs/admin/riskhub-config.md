---
title: Risk Hub Configuration Support Boundaries (Admin Runbook)
version: "2.1"
last_updated: "2026-04-25"
audience: admin
source_of_truth: "frontend/src/pages/RiskHubPage.tsx + backend/app/api/v1/endpoints/riskhub/* + authz role model"
summary: "Admin runbook defining what admins support in Risk Hub configuration (technical enablement) vs what remains a business-owner decision, with incident triage procedures."
tags:
  - riskhub
  - settings
  - audit
  - troubleshooting
  - workflow
---

# Risk Hub Configuration Support Boundaries (Admin Runbook)

## Overview

Risk Hub is the configuration surface for business governance. It is typically used by the CRO role to maintain:

- risk type taxonomy
- system settings that influence governance behavior
- approval scenarios/rules
- roles and permissions models (where allowed)
- departments configuration (business-owned)
- risk questionnaires configuration

Platform admins support **technical enablement and platform integrity**, not business semantics. This matters because Risk Hub settings can change how the organization operates, and admin overrides create audit risk.

This runbook explains:

- what admins should support (technical)
- what admins should not decide (policy)
- how to triage incidents when Risk Hub configuration fails
- how to assemble an evidence pack for handoff

## When To Use This

Use this runbook when:

- a CRO reports they cannot access `/risk-hub` (unexpected redirect/denial)
- Risk Hub tabs fail to load (risk types/settings/approvals/roles/departments/questionnaires)
- configuration saves fail (validation errors, forbidden, server errors)
- configuration changes appear to “not apply” or behave inconsistently
- there is a dispute about what a configuration value should be (boundary question)

## Preconditions and Safety

Before you do anything:

1. Confirm the reporter’s identity and effective role.
   - Risk Hub is CRO-only. If the reporter is not CRO, access denial may be correct.
2. Capture the minimal reproducible facts:
   - which tab failed (risk types vs settings vs approvals vs roles vs departments vs questionnaires)
   - what action was attempted (load vs save)
   - approximate timestamp
   - any UI error message text
3. Decide whether this is technical, data integrity, or policy.

Safety rules:

- Do not invent configuration values. If the question is “what should it be?”, hand off to the business owner.
- Prefer read-only investigation first (logs/audit).
- If you must change access (for example the CRO account role), record before/after and keep rollback ready.

## Step-by-Step Procedure

### 1) Confirm access contract (role gating)

Risk Hub route:

- `/risk-hub` is expected to be accessible only to the CRO role.

Steps:

1. Confirm the reporter’s role in `/users`.
2. If the user is not CRO:
   - do not “force open” Risk Hub
   - clarify the access contract with the business owner
   - if the user should be CRO, change role through the supported access workflow (see user-management runbook)

### 2) If access is correct but pages fail: gather technical evidence

Use Admin Console (`/admin`) to capture:

- audit logs around the timestamp (look for config change attempts and denied requests)
- application logs around the timestamp (errors, validation failures, exceptions)

Capture request IDs when present. They are the fastest bridge to engineering analysis.

### 3) Classify failure mode and apply the minimal fix

Common failure modes:

- **Forbidden / permission denied**:
  - likely role mismatch, stale session, or backend permission regression
- **Validation errors**:
  - configuration input rejected (data-quality or rule mismatch)
- **Server errors (500)**:
  - technical defect or integration failure
- **“Saved” but did not apply**:
  - the change is approval-gated, or the UI is reflecting cached state, or the save never completed
- **Questionnaire send skipped risks**:
  - missing owner, existing open questionnaire, or out-of-scope risk selection
- **Role permission save rejected**:
  - one or more permission IDs no longer exists; the backend rejects the whole replacement before clearing current permissions
- **Department save/delete rejected**:
  - manager is missing/inactive, duplicate name/code exists, or the department still has users, risks, controls, KRIs, vendors, or pending orphan records

Minimal interventions admins can take safely:

- session refresh guidance:
  - ask the reporter to log out/in after role changes
- access correction:
  - correct the user’s role/scope only if authorized and clearly requested
- evidence-driven escalation:
  - if the failure is 500 or inconsistent enforcement, escalate to engineering with request IDs

Questionnaire-specific support:

- one risk can have only one open questionnaire (`sent` or `in_progress`)
- batch send and single send should report the same skip reasons for missing owner and open questionnaire
- owner-name display should show a human label or `Unknown user`; raw numeric owner IDs in the UI should be treated as a display regression
- deadline reminder dedupe is per questionnaire instance while notification navigation remains risk-based

Role/department-specific support:

- Risk Hub role and department rows expose backend capability metadata for update/delete/restore actions; if an action disappears after refresh, treat the backend as authoritative.
- Department managers must be active users. Reactivating or replacing the user is safer than bypassing this validation.
- Department deletes are intentionally conservative because department scope drives RBAC, reports, vendors, KRIs, and orphan governance.

### 4) Boundary handling: technical vs policy

Use this boundary rule:

- “The screen won’t load / save returns 500” is technical (admin + engineering).
- “This threshold should be 15 not 20” is policy (business owner).
- “Save is denied unexpectedly” is technical until proven otherwise (admin investigates auth path).

When you hand off policy:

- include evidence of what the system currently does
- include what would change if the policy decision changes
- do not propose values unless the business owner requests options

## Verification Checklist

After support actions, verify:

- the CRO can load `/risk-hub` and the failing tab now loads
- if a save was involved, the save action succeeds and the change is observable
- audit trails exist for any config changes that occurred
- the incident ticket includes:
  - what failed
  - what was verified
  - what was changed (if anything)
  - what remains a business decision (if applicable)

## Rollback Strategy

Rollback depends on what changed:

- If you changed **access** (role/scope/department):
  - revert to the prior values immediately if it caused regression
  - revoke sessions if the change created unintended exposure
- If the CRO changed **configuration** and it caused harm:
  - prefer reverting via the same Risk Hub mechanism (business-owned)
  - do not apply “silent admin rollback” outside the governed surface

If you cannot roll back safely, escalate. Risk Hub configuration touches governance behavior and must be handled with explicit ownership.

## Troubleshooting

### CRO cannot access `/risk-hub` and gets redirected

Checks:

- confirm the account is CRO in `/users`
- confirm the session is refreshed after role change

Actions:

- correct role if wrong (with approval)
- have the user re-authenticate
- if still failing, escalate as auth regression

### Risk Hub loads but one tab fails (risk types/settings/approvals/roles/departments/questionnaires)

Checks:

- capture the tab name and action
- correlate with logs/audit in `/admin`

Actions:

- if 500: escalate to engineering with request ID
- if validation: capture exact message and hand off to business owner if it’s a policy input

### Questionnaire batch send skipped more rows than expected

Checks:

- selected risks have owners
- selected risks do not already have open questionnaires
- filters did not include out-of-scope or inactive records

Actions:

- provide the created/skipped/error summary to the CRO
- correct missing owner data through the normal governance/access workflow
- do not manually create duplicate open questionnaires

### Business owner requests an “admin override”

This is a governance smell. Default response:

- do not override without explicit policy
- offer a supported, auditable path (Risk Hub change + approvals where applicable)

## Escalation and Handoff

Escalate to engineering when:

- requests error 500 or behave inconsistently across accounts
- audit trail is missing for config changes
- permission enforcement is contradictory

Escalate to business owner when:

- the correct value/threshold/taxonomy is disputed
- department structure decisions are required

Handoff package:

- who reported it (role/scope)
- which tab/action failed
- timestamp window
- request IDs + log snippets
- what you verified and what you changed
- what decision is required (if any) and who owns it

## Related Documentation

- Access corrections: [User and Access Management](./user-management.md)
- Evidence exports: [Reports and Evidence Exports](./reports.md)
- Approvals incident support: [Approvals Support](./approvals.md)
