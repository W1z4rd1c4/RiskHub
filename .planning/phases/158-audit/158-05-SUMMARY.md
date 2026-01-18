---
phase: 158-audit
plan: "05"
status: complete
date: 2026-01-18
---

# 158-05 Summary: Unify Risk Thresholds via GlobalConfig

## Objective

Eliminate hardcoded risk threshold drift across backend by using `ConfigDefaults` as single source of truth.

## What Was Built

### Core Changes

**`backend/app/models/global_config.py`**

- Fixed `ConfigDefaults` to match seeded values:
  - `MEDIUM_RISK_MIN_NET_SCORE = 5`
  - `HIGH_RISK_MIN_NET_SCORE = 10`
  - `CRITICAL_RISK_MIN_NET_SCORE = 16`
- Added `get_risk_thresholds()` async helper for DB-backed thresholds
- Added `build_risk_level_ranges()` to construct RISK_LEVEL_RANGES dict from thresholds

### Endpoint Updates

| File | What Changed |
|------|--------------|
| `dashboard.py` | RISK_LEVEL_RANGES now uses `build_risk_level_ranges()` + ConfigDefaults |
| `dashboard.py` | Critical/high counts use `ConfigDefaults.CRITICAL/HIGH_RISK_MIN_NET_SCORE` |
| `departments.py` | RISK_LEVEL_RANGES now uses `build_risk_level_ranges()` + ConfigDefaults |
| `reports.py` | Summary endpoint uses ConfigDefaults for critical threshold |
| `report_service.py` | PDF generation uses ConfigDefaults for critical count |

### Root Cause

Drift occurred because different endpoints hardcoded different values:

- dashboard.py: critical=15, high=12
- departments.py: critical=16, high=10
- report_service.py: critical=16

### After

All backend code now uses:

- **Critical**: 16 (from `ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE`)
- **High**: 10 (from `ConfigDefaults.HIGH_RISK_MIN_NET_SCORE`)
- **Medium**: 5 (from `ConfigDefaults.MEDIUM_RISK_MIN_NET_SCORE`)

## Commits

- `45650e0` - fix(158-05): unify risk thresholds via ConfigDefaults (medium=5, high=10, critical=16)

## Files Changed

- `backend/app/models/global_config.py` (MODIFIED)
- `backend/app/api/v1/endpoints/dashboard.py` (MODIFIED)
- `backend/app/api/v1/endpoints/departments.py` (MODIFIED)
- `backend/app/api/v1/endpoints/reports.py` (MODIFIED)
- `backend/app/services/report_service.py` (MODIFIED)
