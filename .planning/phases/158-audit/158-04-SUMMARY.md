---
phase: 158-audit
plan: "04"
status: complete
date: 2026-01-18
---

# 158-04 Summary: Fix Risk ID Generator Past 99

## Objective

Fix Risk ID code auto-generation so it does not break past 99 due to lexicographic ordering.

## What Was Built

### Code Changes

**`backend/app/api/v1/endpoints/risks.py`** - `generate_risk_id_code` function

Changed ordering from lexicographic-only to length-aware:

```python
# Before (buggy)
.order_by(Risk.risk_id_code.desc())
.limit(100)

# After (fixed)
.order_by(func.length(Risk.risk_id_code).desc(), Risk.risk_id_code.desc())
.limit(20)
```

### Root Cause

Lexicographic (string) sorting makes `"CLAI-R99" > "CLAI-R100"` because `'9' > '1'` at the first differing character. This caused the generator to stall at R99.

### Solution

Order by `length(risk_id_code) DESC` first, then by `risk_id_code DESC`. This ensures longer codes (R100+) always sort before shorter ones (R99 and below).

### Regression Tests

**`backend/tests/test_risk_id_generation.py`** (NEW)

- `test_generate_risk_id_handles_r99_r100_boundary` - Key regression test
- `test_generate_risk_id_basic_sequence` - Basic R01 → R02
- `test_generate_risk_id_empty_start` - First code is R01
- `test_generate_risk_id_high_numbers` - R150 → R151
- `test_generate_risk_id_process_abbreviation` - Various process names

## Commits

- `fix(158-04): use length-aware ordering in Risk ID generator for R99/R100 boundary`

## Files Changed

- `backend/app/api/v1/endpoints/risks.py` (MODIFIED)
- `backend/tests/test_risk_id_generation.py` (NEW)
