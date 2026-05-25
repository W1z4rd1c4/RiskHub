"""Stable facade for backend-authoritative action capability builders."""

from app.services._authorization_capabilities import (
    Capabilities,
    approval_capabilities,
    build_me_capabilities,
    can_view_loaded_vendor,
    can_view_vendor_link,
    control_capabilities,
    issue_capabilities,
    kri_capabilities,
    preload_issue_capabilities,
    risk_capabilities,
    vendor_capabilities,
)

__all__ = [
    "Capabilities",
    "approval_capabilities",
    "build_me_capabilities",
    "can_view_loaded_vendor",
    "can_view_vendor_link",
    "control_capabilities",
    "issue_capabilities",
    "kri_capabilities",
    "preload_issue_capabilities",
    "risk_capabilities",
    "vendor_capabilities",
]
