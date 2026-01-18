# 158-01 Summary: Fix ApprovalRequest UTC Import Crash

## Objective

Fix a backend model import crash where `UTC` was referenced before import, breaking `import app.models` and Alembic migrations.

## Root Cause

In `backend/app/models/approval_request.py`:

- Line 90: `created_at` column used `datetime.now(UTC)` in its default lambda
- Line 110: `from datetime import UTC` was imported **after** being used

Python resolves names at runtime, so when the class body executed, `UTC` was undefined → `NameError`.

## Fix Applied

**File:** `backend/app/models/approval_request.py`

```diff
-from datetime import datetime
+from datetime import datetime, UTC
```

Removed redundant late import at line 110.

## Regression Test

**File:** `backend/tests/test_model_imports.py` (NEW)

- `test_app_models_imports()` — verifies `import app.models` succeeds
- `test_approval_request_imports()` — verifies `ApprovalRequest` imports
- `test_all_model_classes_accessible()` — verifies all model classes from `__all__`

## Verification

| Check | Result |
|-------|--------|
| `python -c "import app.models"` | ✅ SUCCESS |
| `pytest tests/test_model_imports.py` | ✅ 3/3 passed |

## Commit

```
fix(158-01): fix UTC import order crash in ApprovalRequest model
```

Files: `backend/app/models/approval_request.py`, `backend/tests/test_model_imports.py`
