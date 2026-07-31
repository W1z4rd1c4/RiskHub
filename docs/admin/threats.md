---
title: Threat Register Support (Admin Runbook)
version: "1.0"
last_updated: "2026-07-31"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md + docs/security/authorization-capability-contract.md + frontend/src/pages/ThreatsPage.tsx"
summary: "Operational support for CISO Threat stewardship, scoped linked-Risk context, reassignment, and safe evidence."
tags:
  - workflow
  - approvals
  - notifications
  - troubleshooting
  - governance
  - threats
  - access
  - audit
---

# Threat Register Support (Admin Runbook)

## Overview

Threats form a global catalog stewarded by the CISO role. Every active Threat requires one active Threat Steward who holds the canonical CISO role. The CISO can manage the Threat lifecycle and Threat-to-Risk links and receives read context needed for stewardship, but has no User or platform administration, approval authority, or broad write authority over other registers.

Use this runbook to support sign-in, role, visibility, orphan, reassignment, linked-Risk, localization, and notification cases. Platform administrators must not use their role to edit Threat content, assign a Steward, resolve a request, or expose linked Risks the reporting user cannot read.

## When To Use This

Use the procedure when a CISO cannot open the Threat register, a Threat is missing, a Steward lookup is empty, a former Steward is still displayed, a reassignment is pending, a Threat appears in unexpected Risk groups, an export differs from the visible filtered result, or an expected notification is absent.

Do not use it to choose the Threat Steward, classify a Threat, decide relevant subjects, create Risk links, or approve accountability reassignment. Those choices belong to authorized governance users.

## Preconditions and Safety

Record the environment, time, locale, user email, active roles, Threat name, expected Steward, expected linked Risk, route, URL state, and exact error. Confirm whether the user and Threat are active.

Treat linked Risk context as independently permission-scoped. Never ask for or reveal a hidden Risk identifier, label, count, group, lookup option, or CSV value. Do not assign CISO temporarily to diagnose a display issue unless a separately approved identity procedure explicitly requires it.

## Step-by-Step Procedure

### 1) Confirm the canonical CISO identity

Verify that the user is active and holds the protected canonical CISO role. A similarly named custom role is not equivalent. CISO least privilege deliberately excludes platform administration and approval resolution. If the role was removed, Threat stewardship assignments remain historical evidence and enter orphan governance.

### 2) Reproduce Threat collection behavior

Open the register with the user’s locale and preserve URL-backed search, selected view, filters, group, sort, and page. Search can cover the Threat name, description, typical weaknesses, relevant subject, and Steward. Filter and facet results must reflect only data within the caller’s readable context.

Threats are global and do not belong to a Department tab. A missing Threats tab in Department detail is therefore expected, not a navigation defect.

### 3) Validate Steward lookup and display

For new or reassigned active Threats, the lookup returns active canonical CISO identities. Historical labels can remain visible after deactivation or role loss so audit evidence is not destroyed. The UI must show a safe human-readable label, not a numeric ID. An orphan indicator means explicit governance reassignment is required.

### 4) Validate linked-Risk scope

One Threat can appear in every group for its caller-readable linked Risks. It must not be reduced arbitrarily to a single Risk group. Conversely, hidden Risk relationships must not affect visible labels, lookup choices, facet counts, group membership, or export cells. The Threat may still be visible even when some links are redacted.

### 5) Classify lifecycle and reassignment

Authorized CISO users manage ordinary Threat content and Threat-to-Risk links under backend capabilities. Governance actors retain archive and restore authority as defined by the runtime. An actual Threat Steward change uses the fixed accountability-reassignment scenario when enabled, requires a reason, and preserves the current approved Steward while pending.

The requester cannot approve their own request. Disabling delivery notifications does not bypass approval or hide the request from Approvals or My Requests. A CISO may request and read its own stewardship proposal but receives no approval-resolution capability from the CISO role.

### 6) Check orphan recovery

When the Steward is deactivated or loses CISO, the Threat keeps the former assignment as evidence, becomes orphaned, and requires another active CISO through explicit reassignment. Support must not clear the field, substitute an administrator, or rewrite history. Confirm the replacement remains eligible at decision time.

### 7) Gather safe evidence and route

Capture the Threat label, displayed Steward, orphan status, request identifier, scenario, status, requester, safe diff, timestamp, locale, URL filters, and correlation identifier. Route role activation and session faults to administration, content choices to the CISO, approval configuration to the CRO, and reproducible access or projection defects to engineering.

## Verification Checklist

- The user is active and holds the canonical CISO role where required.
- CISO access does not include platform administration or approval resolution.
- The Threat is global and is not expected in Department detail.
- The displayed Threat Steward is human-readable.
- Steward choices contain only active canonical CISO identities.
- Historical assignment evidence survives deactivation or role loss.
- An orphan is resolved only through explicit reassignment.
- Readable linked Risks create correct multi-group membership.
- Hidden Risk context does not leak through facets, labels, groups, lookup, or export.
- Queue visibility is independent from notification preferences.

## Rollback Strategy

This runbook is diagnostic and should not alter Threat business data. Remove temporary administrative session actions only through their approved operational process. If a reassignment proposal is wrong, the requester can cancel it when eligible or an independent resolver can reject it with a reason; retain the request as evidence.

If an approved reassignment or Threat change must be reversed, initiate the correct new authorized action. Never restore a Steward by direct database edit, reinstate an ineligible identity only to satisfy the row, or remove an orphan record manually.

## Troubleshooting

### Steward picker is empty

Confirm the requester has the required Threat write capability and that at least one active user holds the canonical CISO role. Check the purpose-scoped Steward lookup rather than the general User directory.

### Former Steward remains visible

This is expected evidence after deactivation or role loss. Look for the orphan state and pending governance reassignment. The historical label should remain safe and readable.

### Threat appears in several Risk groups

This is expected when it links to several Risks the caller can read. Validate each readable relationship and confirm that no hidden relationship contributes a visible group.

### CISO cannot approve a stewardship request

The CISO role intentionally provides no approval authority. Resolution requires an independent eligible Risk Manager or CRO configured for the scenario.

## Escalation and Handoff

Include environment, user, canonical roles, Threat name, Steward label, orphan state, readable linked-Risk context, view and filters, request identifier, status, scenario, timestamp, correlation identifier, and redacted screenshots. Identify the failure as identity, register visibility, Steward lookup, orphan governance, linked-Risk scope, approval, notification, localization, or export.

Escalate immediately if a non-CISO becomes Steward, a CISO administers users or resolves approvals solely through that role, self-approval succeeds, hidden Risk context leaks, or an orphan is silently cleared.

## Related Documentation

- [Approvals support](./approvals.md)
- [Risk Hub configuration](./riskhub-config.md)
- [Department support](./departments.md)
- [Admin onboarding](./getting-started.md)
- [Admin documentation index](./README.md)
