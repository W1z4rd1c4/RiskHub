# 158-02 Summary: Approval-Applied EDIT Parity

## Objective

Make approval-applied EDIT operations produce the same derived fields and audit attribution as direct updates.

## Root Cause

In `approval_execution_service.py`:

- **Risk edits**: Applied field changes but did NOT recompute `gross_score`/`net_score`
- **Control edits**: Applied field changes but did NOT set `updated_by_id`

## Fix Applied

**File:** `backend/app/services/approval_execution_service.py`

### Risk Score Recomputation

```python
# After applying pending changes
gross_inputs_changed = any(k in applied_changes for k in ("gross_probability", "gross_impact"))
net_inputs_changed = any(k in applied_changes for k in ("net_probability", "net_impact"))

if gross_inputs_changed:
    old_gross_score = risk.gross_score
    risk.gross_score = risk.gross_probability * risk.gross_impact
    if risk.gross_score != old_gross_score:
        applied_changes["gross_score"] = {"old": old_gross_score, "new": risk.gross_score}
```

### Control Audit Attribution

```python
if applied_changes:
    control.updated_by_id = current_user.id
```

## Test Added

**File:** `backend/tests/test_approval_edit_apply.py` (NEW)

- `test_approval_edit_risk_recomputes_gross_score` — verifies gross_score recomputation
- `test_approval_edit_risk_recomputes_net_score` — verifies net_score recomputation
- `test_approval_edit_control_sets_updated_by_id` — verifies audit attribution
- `test_approval_edit_risk_no_score_change_when_no_probability_impact` — verifies non-score edits don't touch scores

## Commit

```
fix(158-02): add risk score recomputation and control audit attribution in approval edits
```
