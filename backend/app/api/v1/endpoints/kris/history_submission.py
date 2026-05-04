"""Compatibility facade for KRI history submission helpers."""

from app.services._kri_history.approval_intake import create_kri_submission_approval

_create_kri_submission_approval = create_kri_submission_approval

__all__ = ["_create_kri_submission_approval"]
