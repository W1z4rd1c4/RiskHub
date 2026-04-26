"""Stable facade for backend-authoritative action capability builders."""

from app.services._authorization_capabilities_impl import (
    approval_capabilities,
    can_view_loaded_vendor,
    can_view_vendor_link,
    control_capabilities,
    issue_capabilities,
    kri_capabilities,
    risk_capabilities,
)

__all__ = [
    "approval_capabilities",
    "can_view_loaded_vendor",
    "can_view_vendor_link",
    "control_capabilities",
    "issue_capabilities",
    "kri_capabilities",
    "risk_capabilities",
]
