"""Compatibility facade for KRI history endpoint helpers."""

from app.services._kri_history.loading import _assert_kri_submit_access, _load_kri_with_risk_or_404
from app.services._kri_history.approval_intake import create_kri_submission_approval
from app.services._kri_history.direct_application import apply_kri_value_directly, run_best_effort_notification

_apply_kri_value_directly = apply_kri_value_directly
_create_kri_submission_approval = create_kri_submission_approval
_run_best_effort_notification = run_best_effort_notification

__all__ = [
    "_apply_kri_value_directly",
    "_assert_kri_submit_access",
    "_create_kri_submission_approval",
    "_load_kri_with_risk_or_404",
    "_run_best_effort_notification",
]
