---
title: Key Risk Indicators (KRIs)
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §2.3, §5"
summary: "Complete KRI operating guide for value submission, threshold management, breach handling, and historical correction workflows."
tags:
  - kri
  - thresholds
  - reporting
---

# Key Risk Indicators (KRIs)

## Overview

KRIs provide measurable early-warning and threshold monitoring for linked risks.

Primary app route: `/kris`

## Core Responsibilities

KRI operations include:

- maintaining KRI definitions and ownership
- submitting periodic values with context
- monitoring limit breaches and overdue submissions
- handling correction workflows with traceability

## KRI Submission Workflow

1. Open `/kris` and filter to assigned or relevant indicators.
2. Open detail and confirm reporting period.
3. Enter value with contextual notes.
4. Submit and confirm recorded timestamp.
5. Review breach/overdue state and notifications.

## Reporting Owner and Fallback Model

- Reporting owner is the primary submission owner.
- If reporting owner is missing, fallback responsibility follows linked risk ownership rules.
- Department context is inherited from the linked risk path.

## Breach and Escalation Handling

When thresholds are exceeded:

- validate value correctness first
- document business reason for deviation
- track required remediation actions
- monitor escalation and follow-up through workflow

## Historical Corrections

Corrections are governance-sensitive. Maintain full traceability:

- explain why correction is needed
- preserve old/new value context
- reference source evidence

Do not silently overwrite historical values.

## Troubleshooting

### I cannot submit KRI value

Confirm submission permission and ownership context on the linked risk chain.

### Indicator shows unexpected department context

KRIs inherit context from linked risk. Check linkage integrity.

### Breach alert appears incorrect

Validate thresholds and measurement unit first, then check submitted value precision.

## Related Documentation

- `./risks.md`
- `./notifications.md`
- `./dashboard.md`
- `./faq.md`
