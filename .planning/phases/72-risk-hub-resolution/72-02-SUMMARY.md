# Phase 72 Plan 02: Risk Hub Resolution Summary

**Wired global configuration into risk thresholds and notification timing, making CRO-configured settings affect severity calculations and KRI reminders.**

## Accomplishments

- Created typed config lookup helpers with 60-second TTL caching to avoid DB hits
- Risk severity threshold (`is_critical_risk`) now uses `ConfigDefaults` with async DB lookup option
- KRI notification timing (advance reminders, overdue intervals, breach thresholds) sourced from `global_config`
- All defaults remain safe fallbacks when config is missing

## Files Created/Modified

- `backend/app/models/global_config.py` - Added `ConfigDefaults` class, `get_config_value()`, `get_config_int()`, `get_config_float()`, cache helpers
- `backend/app/core/permissions.py` - Replaced hardcoded `CRITICAL_RISK_THRESHOLD` with ConfigDefaults; added `is_critical_risk_async()` for DB config lookup
- `backend/app/services/kri_deadline_service.py` - Added `_load_config()` to load all notification timing values once; updated all usages to read from config dict
- `backend/tests/test_global_config_usage.py` - 10 tests covering config helpers, risk thresholds, KRI config loading, and cache behavior

## Decisions Made

- Used TTL-based caching (60 seconds) rather than request-scoped to balance freshness with performance
- Sync `is_critical_risk()` uses static defaults; async version fetches from DB for true configurability
- Config keys use snake_case to match Python convention (e.g., `high_risk_min_net_score`)

## Issues Encountered

None

## Next Step

Ready for `72-03-PLAN.md`.
