"""Compatibility facade for KRI history loading helpers."""

from app.services._kri_history.loading import _assert_kri_submit_access, _load_kri_with_risk_or_404

__all__ = ["_assert_kri_submit_access", "_load_kri_with_risk_or_404"]
