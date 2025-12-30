---
phase: 10-historization
plan: 01
completed: 2025-12-30
---

# Summary: KRI Historization Backend Data Model

## Objective
Added KRI historization data model, reporting ownership, and reporting-period fields to the backend to support KRI value history tracking, reporting cadence, and responsibility.

## Changes Made

### Task 1: Extended KRI Model + New History Model

**Files Modified:**
- `backend/app/models/key_risk_indicator.py` - Extended with historization fields
- `backend/app/models/kri_history.py` - **NEW** Value history model
- `backend/app/models/__init__.py` - Added new exports

**Changes:**
- Added `KRIFrequency` enum (daily, weekly, monthly, quarterly, annually)
- Extended `KeyRiskIndicator` with:
  - `frequency` (String(20), defaults to quarterly)
  - `reporting_owner_id` (FK to users, nullable - falls back to risk owner)
  - `last_period_end` (Date, nullable)
  - `last_reported_at` (DateTime, server default now)
  - `history_entries` relationship with cascade delete
- Created `KRIValueHistory` model with:
  - Period boundaries (period_start, period_end dates)
  - Value snapshot (value, lower_limit, upper_limit, unit, breach_status)
  - Recording metadata (recorded_at, recorded_by_id)
  - Composite indexes for time-series queries

### Task 2: Updated KRI Schemas

**File Modified:** `backend/app/schemas/kri.py`

**Changes:**
- Added `KRIFrequencyEnum` for API validation
- Extended `KRIBase/KRICreate/KRIUpdate` with `frequency` and `reporting_owner_id`
- Extended `KRIResponse` with `reporting_owner_name`, `last_period_end`, `last_reported_at`
- Added history-related schemas:
  - `KRIHistoryEntry` - Single history record
  - `KRIHistoryListResponse` - Paginated list
  - `KRIRecordValue` - For recording new values
  - `KRIHistoryEdit` - For correction requests

### Task 3: Alembic Migration

**File Created:** `backend/alembic/versions/c2d4f6g8h0j2_add_kri_history.py`

**Migration includes:**
- New columns on `key_risk_indicators` table
- New `kri_value_history` table with FK constraints
- Indexes: `ix_kri_value_history_kri_id`, `ix_kri_value_history_kri_period_end`, `ix_kri_value_history_kri_recorded_at`
- Backfill logic for existing KRIs

## Verification Results

| Check | Status |
|-------|--------|
| Models import cleanly | ✅ Pass |
| Schemas import cleanly | ✅ Pass |
| Migration syntax valid | ✅ Pass |
| Database migration test | ⏸ Skipped (DB not running) |

## Files Modified

1. `backend/app/models/key_risk_indicator.py`
2. `backend/app/models/kri_history.py` (NEW)
3. `backend/app/models/__init__.py`
4. `backend/app/schemas/kri.py`
5. `backend/alembic/versions/c2d4f6g8h0j2_add_kri_history.py` (NEW)

## Next Steps
- Plan 10-02: Update KRI endpoints to support value recording and history retrieval
- Plan 10-03: Add scheduled reminders for KRI reporting windows
