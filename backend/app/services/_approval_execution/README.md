# backend/app/services/_approval_execution

## Purpose

Business/service-layer logic for `_approval_execution`.

## Contents

- `__init__.py`
- `__pycache__/`
- `authorization.py`
- `constants.py`
- `delete_side_effects.py`
- `edit_risk_control.py`
- `helpers.py`
- `kri_changes.py`
- `kri_generic_edit.py`
- `kri_history_correction.py`
- `kri_side_effects.py`
- `kri_value_submission.py`
- `loading.py`
- `logging.py`
- `privilege_context.py`
- `resolution.py`
- `results.py` — canonical `SideEffectResult`, `apply_auto_rejection`, and `auto_reject_kri_approval` helpers.
- `side_effects.py`
- `staleness.py`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

`privilege_context.py` is the canonical FastAPI dependency for approvals
endpoints. Use `Depends(get_privilege_context)` to obtain the authenticated
`PrivilegeContext`, then pass `ctx.user` to service-layer APIs or call
`ctx.tier_for_approval(db, approval)` when an endpoint needs approval-specific
tier data.
