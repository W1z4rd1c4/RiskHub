---
phase: 159-audit-fixes
plan: 04
completed: 2026-01-23
---

# Summary: Department High-Risk Threshold Fix

## Problem

`_count_high_risks_by_dept` used hardcoded threshold `>= 16` but dashboard uses `>= 10` (HIGH_RISK_MIN_NET_SCORE).

## Solution

Replaced hardcoded 16 with `ConfigDefaults.HIGH_RISK_MIN_NET_SCORE` (10).

**Before**: `Risk.net_score >= 16` (actually "critical" level)
**After**: `Risk.net_score >= ConfigDefaults.HIGH_RISK_MIN_NET_SCORE` (high risk, consistent)

## Commit

`c42c360` - fix(159-04): use ConfigDefaults.HIGH_RISK_MIN_NET_SCORE for consistency
