# Phase 72 Plan 01: Risk Hub Resolution Summary

**Integrated dynamic risk types into backend risk workflows with accurate counts computed from live data.**

## Accomplishments

- Risk type validation now uses dynamic configuration from `risk_types` table instead of hardcoded enum
- Risk type counts in Risk Hub API are computed dynamically from actual risks, excluding archived items
- Creating/updating risks with unknown risk types returns clear 400 error with guidance
- Fixed pre-existing timezone bug in `deps.py` that caused test failures

## Files Created/Modified

- `backend/app/schemas/risk.py` - Changed `RiskTypeEnum` to string type for dynamic validation; kept "operational" default
- `backend/app/api/v1/endpoints/risks.py` - Added `validate_risk_type()` helper; validation in create/update endpoints; updated filter to use string comparison
- `backend/app/api/v1/endpoints/riskhub.py` - Import Risk model; compute `risk_count` dynamically via grouped query excluding archived risks
- `backend/tests/test_riskhub_risk_types.py` - 8 comprehensive tests covering valid/invalid types, updates, inactive types, and accurate counts
- `backend/app/api/deps.py` - Fixed timezone-naive/aware datetime comparison in last_active_at check

## Decisions Made

- Default risk_type remains "operational" for backwards compatibility
- Query excludes archived risks from count to show accurate active totals
- Inactive (soft-deleted) risk types are rejected as "unknown" to prevent stale references

## Issues Encountered

- Pre-existing timezone bug in `deps.py` discovered: datetime comparison failed in SQLite tests where `last_active_at` was naive. Fixed by treating naive datetimes as UTC.

## Next Step

Ready for `72-02-PLAN.md`.
