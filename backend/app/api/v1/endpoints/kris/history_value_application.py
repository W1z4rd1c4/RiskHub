"""Compatibility facade for KRI history value application helpers."""

from app.services._kri_history.direct_application import apply_kri_value_directly, run_best_effort_notification

_apply_kri_value_directly = apply_kri_value_directly
_run_best_effort_notification = run_best_effort_notification

__all__ = ["_apply_kri_value_directly", "_run_best_effort_notification"]
