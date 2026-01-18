# 158-06 Summary: Add continuous to ControlFrequency Enum

## Objective

Align Control frequency enums by adding missing `continuous` to the backend ControlFrequency model enum.

## Root Cause

- Schema (`backend/app/schemas/control.py`) included `continuous = "continuous"`
- Model (`backend/app/models/control.py`) was missing it
- Dashboards iterating the model enum would silently omit "continuous" controls

## Fix Applied

**File:** `backend/app/models/control.py`

```diff
 class ControlFrequency(str, PyEnum):
     ...
     ad_hoc = "ad_hoc"
+    continuous = "continuous"
```

## Verification

```python
from app.models.control import ControlFrequency
print([e.value for e in ControlFrequency])
# ['daily', 'weekly', 'monthly', 'quarterly', 'annually', 'ad_hoc', 'continuous']
```

## Commit

```
fix(158-06): add continuous to ControlFrequency enum
```
