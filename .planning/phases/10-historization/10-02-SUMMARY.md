---
phase: 10-historization
plan: 02
completed: 2025-12-30
---

# Summary: KRI History Service and API Endpoints

## Objective
Exposed KRI reporting windows, reminders, and historization through services and API endpoints with 15-day grace window enforcement.

## Changes Made

### Task 1: KRI History Service with Reporting Windows

**Files Created:**
- `backend/app/services/kri_history_service.py` - **NEW**

**Files Modified:**
- `backend/app/services/kri_deadline_service.py`

**Features:**
- `KRIHistoryService` with:
  - `frequency_to_days()` - frequency to period length mapping
  - `current_period(kri)` - calculates current reporting period
  - `due_date(period_end)` - period_end + 15 days grace
  - `reporting_owner_id(kri)` - fallback to risk owner
  - `record_value()` - records value with window enforcement
  - `get_history()` - paginated history retrieval
  - `get_overdue_kris()` - lists overdue KRIs
  - `apply_history_correction()` - corrects historical entries

- Updated `KRIDeadlineService` with:
  - Advance reminder (7 days before period end)
  - Deadline notification (on due date)
  - Overdue reminder (every 7 weeks after due date)
  - Reporting owner routing (fallback to risk owner)
  - Distinct message copy for reporting vs breach

### Task 2: KRI Value/History Endpoints

**File Modified:** `backend/app/api/v1/endpoints/kris.py`

**New Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/kris/{id}/values` | POST | Record value with history |
| `/kris/{id}/history` | GET | Paginated history list |
| `/kris/overdue` | GET | List overdue KRIs |
| `/kris/{id}/history/{entry_id}` | PATCH | Correct history entry |

**Features:**
- Department access validation on all endpoints
- Non-privileged users blocked from backdating
- History corrections flow through approval workflow
- Privileged users can apply corrections immediately

## Verification Results

| Check | Status |
|-------|--------|
| KRIHistoryService imports | ✅ Pass |
| KRI router imports | ✅ Pass |
| Period window logic | ✅ Implemented |
| Reminder cadence types | ✅ due_soon, deadline, overdue |

## Files Modified

1. `backend/app/services/kri_history_service.py` (NEW)
2. `backend/app/services/kri_deadline_service.py`
3. `backend/app/api/v1/endpoints/kris.py`

## Next Steps
- Plan 10-03: Integrate approval resolution for history corrections
- Plan 10-04: Frontend UI for history viewing and value recording
