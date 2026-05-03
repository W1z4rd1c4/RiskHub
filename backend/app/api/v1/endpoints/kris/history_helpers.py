"""Compatibility facade for KRI history endpoint helpers."""

from app.services._kri_history.loading import _assert_kri_submit_access, _load_kri_with_risk_or_404
from app.services._kri_history.submission import _create_kri_submission_approval
from app.services._kri_history.value_application import _apply_kri_value_directly, _run_best_effort_notification

__all__ = [
    "_apply_kri_value_directly",
    "_assert_kri_submit_access",
    "_create_kri_submission_approval",
    "_load_kri_with_risk_or_404",
    "_run_best_effort_notification",
]
